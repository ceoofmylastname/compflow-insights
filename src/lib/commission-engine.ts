import type { SupabaseClient } from "@supabase/supabase-js";

interface Agent {
  id: string;
  email: string;
  upline_email: string | null;
  contract_type: string | null;
  start_date: string | null;
}

export interface AgentPositionHistory {
  agent_id: string;
  position_id: string | null;
  upline_email: string | null;
  start_date: string;
  end_date: string | null;
  /** Optional — used as a tiebreaker when two history rows share start_date. */
  created_at?: string | null;
}

interface CommissionLevel {
  carrier: string;
  product: string;
  position_id: string;
  rate: number;
  start_date: string;
}

interface RateAdjustment {
  carrier: string;
  product: string;
  position_id: string;
  adjustment_rate: number;
  start_date: string;
  end_date: string | null;
}

export interface PositionSnapshot {
  position_id: string;
  upline_email: string | null;
}

/**
 * Resolve an agent's position_id and upline as of `appDate` from the
 * agent_position_history time-stamped ledger. Picks the row whose
 * [start_date, end_date] window contains appDate. If multiple rows match,
 * prefers the latest start_date — and when start_dates tie (e.g. an
 * upline reassignment that happened on the same day as a previous position
 * change), breaks the tie on `created_at` DESC so the most recently inserted
 * row wins. This matters specifically for owner-driven reassignments where
 * the closed row's end_date and the new row's start_date both equal today.
 */
export function findPositionAt(
  history: AgentPositionHistory[],
  agentId: string,
  appDate: string
): PositionSnapshot | null {
  const matches = history.filter(
    (h) =>
      h.agent_id === agentId &&
      h.position_id != null &&
      h.start_date <= appDate &&
      (h.end_date == null || h.end_date >= appDate)
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const startCmp = b.start_date.localeCompare(a.start_date);
    if (startCmp !== 0) return startCmp;
    // Tiebreaker: most recently created row wins.
    const aCreated = a.created_at ?? "";
    const bCreated = b.created_at ?? "";
    return bCreated.localeCompare(aCreated);
  });
  return {
    position_id: matches[0].position_id as string,
    upline_email: matches[0].upline_email,
  };
}

/**
 * Public helper: resolve an agent's upline + position as of a given date from
 * a pre-fetched history array.
 *
 * Identical lookup to `findPositionAt`, but exported as the canonical
 * "what was this user's upline on date X" helper so other surfaces
 * (audits, payroll re-runs, future hierarchy reports) can reuse the same
 * time-stamped logic without re-rolling. Pass the same `agent_position_history`
 * row set the engine itself uses.
 *
 * Returns null when no open or applicable history row exists for that agent
 * at that date — meaning the agent had no recorded position/upline at the
 * time, which the commission engine treats as "no payouts above this agent."
 */
export function getUserUplineAt(
  history: AgentPositionHistory[],
  agentId: string,
  date: string
): PositionSnapshot | null {
  return findPositionAt(history, agentId, date);
}

/**
 * Find the commission rate for a given carrier/product/position_id active on
 * appDate. `levels` must be sorted by start_date DESC. Applies any matching
 * rate adjustment on top of the base rate.
 */
function findRate(
  levels: CommissionLevel[],
  carrier: string,
  product: string,
  positionId: string,
  appDate: string,
  adjustments: RateAdjustment[]
): number | null {
  const match = levels.find(
    (l) =>
      l.carrier === carrier &&
      l.product === product &&
      l.position_id === positionId &&
      l.start_date <= appDate
  );
  if (!match) return null;

  let rate = match.rate;

  const adj = adjustments.find(
    (a) =>
      a.carrier === carrier &&
      a.product === product &&
      a.position_id === positionId &&
      a.start_date <= appDate &&
      (!a.end_date || a.end_date >= appDate)
  );
  if (adj) rate += adj.adjustment_rate;

  return rate;
}

/**
 * Calculate and persist commission payouts for a single policy.
 *
 * Resolves each agent's position from agent_position_history at the policy's
 * application_date (time-stamped: a promotion today doesn't change
 * commissions on a policy written six months ago). Walks the upline chain
 * via the upline_email recorded on the agent's position-history row, also
 * snapshotted at application_date.
 */
export async function calculateAndSavePayouts(
  policyId: string,
  supabaseClient: SupabaseClient
): Promise<void> {
  const { data: policy, error: policyErr } = await supabaseClient
    .from("policies")
    .select("*")
    .eq("id", policyId)
    .single();

  if (policyErr || !policy) return;

  const {
    carrier,
    product,
    application_date,
    annual_premium,
    resolved_agent_id,
    tenant_id,
  } = policy;

  if (!carrier || !product || !application_date || !annual_premium || !resolved_agent_id) return;

  /**
   * Payment lifecycle per Wiki/comp-grid-engine.md (canonical seven-status model):
   *   - status === 'Issue Paid'           -> payment_status='paid', paid_at=now()
   *   - status === 'Issued' (or 'Active') -> payment_status='pending'
   *   - everything else                    -> payment_status='pending' (engine still
   *     writes rows so dashboards have data, but they aren't payable yet).
   * 'Active' is the deprecated alias maintained during the migration window.
   * TODO: remove 'Active' branch after Active enum drop.
   */
  const policyStatus = (policy as { status?: string | null }).status ?? null;
  const isIssuePaid = policyStatus === "Issue Paid";
  const paymentStatus: "paid" | "pending" = isIssuePaid ? "paid" : "pending";
  const paidAt: string | null = isIssuePaid ? new Date().toISOString() : null;

  // 1. Fetch agents in tenant
  const { data: agents } = await supabaseClient
    .from("agents")
    .select("id, email, upline_email, contract_type, start_date")
    .eq("tenant_id", tenant_id);

  if (!agents || agents.length === 0) return;

  const agentMap = new Map<string, Agent>();
  const emailMap = new Map<string, Agent>();
  for (const a of agents) {
    agentMap.set(a.id, a as Agent);
    emailMap.set(a.email, a as Agent);
  }

  // 2. Fetch position history for the tenant (we filter to relevant rows in JS).
  // created_at is included so findPositionAt can break ties when two rows
  // share start_date (e.g. an owner-driven upline reassign on the same day
  // as a previous position change).
  const { data: historyRaw } = await supabaseClient
    .from("agent_position_history")
    .select("agent_id, position_id, upline_email, start_date, end_date, created_at")
    .eq("tenant_id", tenant_id);

  const history = (historyRaw ?? []) as AgentPositionHistory[];

  // 3. Fetch commission levels
  const { data: levelsRaw } = await supabaseClient
    .from("commission_levels")
    .select("carrier, product, position_id, rate, start_date")
    .eq("tenant_id", tenant_id)
    .order("start_date", { ascending: false });

  const levels = (levelsRaw ?? []) as CommissionLevel[];
  if (levels.length === 0) return;

  // 4. Fetch rate adjustments
  const { data: adjustmentsRaw } = await supabaseClient
    .from("commission_rate_adjustments")
    .select("carrier, product, position_id, adjustment_rate, start_date, end_date")
    .eq("tenant_id", tenant_id);

  const adjustments = (adjustmentsRaw ?? []) as RateAdjustment[];

  // 5. Resolve writing agent + their position at application_date
  const writingAgent = agentMap.get(resolved_agent_id);
  if (!writingAgent) return;
  if (writingAgent.start_date && writingAgent.start_date > application_date) return;

  const writingPos = getUserUplineAt(history, writingAgent.id, application_date);
  if (!writingPos) return;

  const directRate = findRate(
    levels,
    carrier,
    product,
    writingPos.position_id,
    application_date,
    adjustments
  );
  if (directRate == null) return;

  const payouts: Array<{
    tenant_id: string;
    policy_id: string;
    agent_id: string;
    commission_rate: number;
    commission_amount: number;
    payout_type: string;
    contract_type: string | null;
    payment_status: "paid" | "pending";
    paid_at: string | null;
  }> = [];

  payouts.push({
    tenant_id,
    policy_id: policyId,
    agent_id: resolved_agent_id,
    commission_rate: directRate,
    commission_amount: annual_premium * directRate,
    payout_type: "direct",
    contract_type: writingAgent.contract_type,
    payment_status: paymentStatus,
    paid_at: paidAt,
  });

  // 6. Walk upline chain. The upline at policy-write time is recorded on the
  //    writing agent's position-history row (writingPos.upline_email), then
  //    each subsequent upline's own at-the-time row.
  let currentUplineEmail = writingPos.upline_email;
  let downlineRate = directRate;
  const visited = new Set<string>([resolved_agent_id]);

  while (currentUplineEmail) {
    const upline = emailMap.get(currentUplineEmail);
    if (!upline || visited.has(upline.id)) break;
    visited.add(upline.id);

    if (upline.start_date && upline.start_date > application_date) {
      // Upline wasn't active yet at app date; can't credit them. Try to keep
      // walking using their CURRENT upline_email as a fallback so the chain
      // doesn't dead-end on agents missing position history.
      currentUplineEmail = upline.upline_email;
      continue;
    }

    const uplinePos = getUserUplineAt(history, upline.id, application_date);
    if (!uplinePos) {
      currentUplineEmail = upline.upline_email;
      continue;
    }

    const uplineRate = findRate(
      levels,
      carrier,
      product,
      uplinePos.position_id,
      application_date,
      adjustments
    );
    if (uplineRate != null && uplineRate > downlineRate) {
      payouts.push({
        tenant_id,
        policy_id: policyId,
        agent_id: upline.id,
        commission_rate: uplineRate - downlineRate,
        commission_amount: (uplineRate - downlineRate) * annual_premium,
        payout_type: "override",
        contract_type: upline.contract_type,
        payment_status: paymentStatus,
        paid_at: paidAt,
      });
      downlineRate = uplineRate;
    }

    currentUplineEmail = uplinePos.upline_email;
  }

  // 7. Persist
  if (payouts.length > 0) {
    await supabaseClient
      .from("commission_payouts")
      .upsert(payouts as any, { onConflict: "policy_id,agent_id", ignoreDuplicates: false });
  }
}

/**
 * Recalculate commission payouts for every policy in a tenant. Useful after
 * editing comp grid rates retroactively.
 */
export async function recalculateAllPayouts(
  tenantId: string,
  supabaseClient: SupabaseClient
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const { data: policies, error: fetchErr } = await supabaseClient
    .from("policies")
    .select("id")
    .eq("tenant_id", tenantId);

  if (fetchErr) return { processed: 0, errors: [fetchErr.message] };
  if (!policies || policies.length === 0) return { processed: 0, errors: [] };

  for (const policy of policies) {
    try {
      await calculateAndSavePayouts(policy.id, supabaseClient);
      processed++;
    } catch (err: any) {
      errors.push(`Policy ${policy.id}: ${err.message ?? "unknown error"}`);
    }
  }

  return { processed, errors };
}
