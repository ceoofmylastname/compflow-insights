import type { SupabaseClient } from "@supabase/supabase-js";

interface Agent {
  id: string;
  email: string;
  position: string | null;
  upline_email: string | null;
  contract_type: string | null;
  start_date: string | null;
}

interface CommissionLevel {
  carrier: string;
  product: string;
  position: string;
  rate: number;
  start_date: string;
}

/**
 * Find the commission rate for a given carrier/product/position active on appDate.
 * Levels must be sorted by start_date DESC already.
 */
function findRate(
  levels: CommissionLevel[],
  carrier: string,
  product: string,
  position: string,
  appDate: string
): number | null {
  const match = levels.find(
    (l) =>
      l.carrier === carrier &&
      l.product === product &&
      l.position === position &&
      l.start_date <= appDate
  );
  return match?.rate ?? null;
}

/**
 * Calculate and persist commission payouts for a single policy.
 * Walks the upline chain to compute override commissions.
 */
export async function calculateAndSavePayouts(
  policyId: string,
  supabaseClient: SupabaseClient
): Promise<void> {
  // 1. Fetch the policy
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

  // 2. Fetch all agents for the tenant
  const { data: agents } = await supabaseClient
    .from("agents")
    .select("id, email, position, upline_email, contract_type, start_date")
    .eq("tenant_id", tenant_id);

  if (!agents || agents.length === 0) return;

  const agentMap = new Map<string, Agent>();
  const emailMap = new Map<string, Agent>();
  for (const a of agents) {
    agentMap.set(a.id, a as Agent);
    emailMap.set(a.email, a as Agent);
  }

  // 3. Fetch commission levels for tenant, sorted by start_date DESC
  const { data: levels } = await supabaseClient
    .from("commission_levels")
    .select("carrier, product, position, rate, start_date")
    .eq("tenant_id", tenant_id)
    .order("start_date", { ascending: false });

  if (!levels || levels.length === 0) return;

  // 4. Find writing agent
  const writingAgent = agentMap.get(resolved_agent_id);
  if (!writingAgent || !writingAgent.position) return;

  // Confirm agent start_date <= application_date
  if (writingAgent.start_date && writingAgent.start_date > application_date) return;

  // 5. Look up writing agent's rate
  const directRate = findRate(levels, carrier, product, writingAgent.position, application_date);
  if (directRate == null) return;

  const payouts: Array<{
    tenant_id: string;
    policy_id: string;
    agent_id: string;
    commission_rate: number;
    commission_amount: number;
    payout_type: string;
    contract_type: string | null;
  }> = [];

  // Direct payout for writing agent
  payouts.push({
    tenant_id,
    policy_id: policyId,
    agent_id: resolved_agent_id,
    commission_rate: directRate,
    commission_amount: annual_premium * directRate,
    payout_type: "direct",
    contract_type: writingAgent.contract_type,
  });

  // 6. Walk upline chain for overrides
  let currentAgent = writingAgent;
  let downlineRate = directRate;
  const visited = new Set<string>([resolved_agent_id]);

  while (currentAgent.upline_email) {
    const upline = emailMap.get(currentAgent.upline_email);
    if (!upline || visited.has(upline.id)) break; // prevent cycles
    visited.add(upline.id);

    if (!upline.position) {
      currentAgent = upline;
      continue;
    }

    // Confirm upline start_date <= application_date
    if (upline.start_date && upline.start_date > application_date) {
      currentAgent = upline;
      continue;
    }

    const uplineRate = findRate(levels, carrier, product, upline.position, application_date);
    if (uplineRate != null && uplineRate > downlineRate) {
      const overrideAmount = (uplineRate - downlineRate) * annual_premium;
      payouts.push({
        tenant_id,
        policy_id: policyId,
        agent_id: upline.id,
        commission_rate: uplineRate - downlineRate,
        commission_amount: overrideAmount,
        payout_type: "override",
        contract_type: upline.contract_type,
      });
      downlineRate = uplineRate;
    }

    currentAgent = upline;
  }

  // 7. Upsert all payouts
  if (payouts.length > 0) {
    await supabaseClient
      .from("commission_payouts")
      .upsert(payouts as any, { onConflict: "policy_id,agent_id", ignoreDuplicates: false });
  }
}

/**
 * Recalculate commission payouts for all policies in a tenant.
 * Useful when commission rates are updated retroactively.
 */
export async function recalculateAllPayouts(
  tenantId: string,
  supabaseClient: SupabaseClient
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  // Fetch all policy IDs for the tenant
  const { data: policies, error: fetchErr } = await supabaseClient
    .from("policies")
    .select("id")
    .eq("tenant_id", tenantId);

  if (fetchErr) {
    return { processed: 0, errors: [fetchErr.message] };
  }

  if (!policies || policies.length === 0) {
    return { processed: 0, errors: [] };
  }

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
