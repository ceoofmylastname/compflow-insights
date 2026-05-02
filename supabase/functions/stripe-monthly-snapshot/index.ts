// Edge Function: stripe-monthly-snapshot
//
// Daily job (scheduled at 00:05 UTC via pg_cron + pg_net). Computes each
// active tenant's active-agent count for the prior 30 days. On the 1st of
// each month, also reports the count to Stripe via subscription_items.
// create_usage_record so the next invoice reflects the correct quantity.
//
// Idempotent: takes (tenant, period_start, period_end) as a unique key.
// Re-running on the same day overwrites the snapshot but does NOT
// duplicate the Stripe usage record (we only post once and store the
// stripe_usage_record_id).
//
// Required env / Vault secrets:
//   - STRIPE_SECRET_KEY

// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// @ts-ignore
declare const Deno: any;

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

function periodForToday(): { start: string; end: string; isFirstOfMonth: boolean } {
  const now = new Date();
  const isFirstOfMonth = now.getUTCDate() === 1;
  // Period = the calendar month that just ENDED (so on the 1st we're billing
  // the previous month). On other days we still snapshot the current rolling
  // 30-day window into a "preview" snapshot for the in-app dashboard.
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1));
  if (!isFirstOfMonth) {
    // For mid-month previews, just use a rolling 30-day window
    const rollingEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const rollingStart = new Date(rollingEnd.getTime() - 29 * 24 * 60 * 60 * 1000);
    return {
      start: rollingStart.toISOString().split("T")[0],
      end: rollingEnd.toISOString().split("T")[0],
      isFirstOfMonth: false,
    };
  }
  return {
    start: periodStart.toISOString().split("T")[0],
    end: periodEnd.toISOString().split("T")[0],
    isFirstOfMonth: true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response("Stripe not configured", { status: 500 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  const { start, end, isFirstOfMonth } = periodForToday();

  try {
    // Allow scoping to a single tenant for ad-hoc / testing runs
    const url = new URL(req.url);
    const tenantParam = url.searchParams.get("tenant_id");

    let tenantsQuery = adminClient
      .from("tenants")
      .select("id, stripe_customer_id, stripe_subscription_id, billing_status");
    if (tenantParam) tenantsQuery = tenantsQuery.eq("id", tenantParam);

    const { data: tenants, error } = await tenantsQuery;
    if (error) throw error;

    const results: Array<{ tenant_id: string; count: number; reported: boolean }> = [];

    for (const tenant of tenants ?? []) {
      // Snapshot via the RPC (idempotent on tenant + period)
      const { data: snapshot } = await adminClient.rpc("take_billing_snapshot" as any, {
        p_tenant_id: tenant.id,
        p_period_start_date: start,
        p_period_end_date: end,
        p_unit_price: null,
      });

      const snap = (Array.isArray(snapshot) ? snapshot[0] : snapshot) as
        | {
            id: string;
            active_agent_count: number;
            stripe_usage_record_id: string | null;
            reported_to_stripe_at: string | null;
          }
        | null;

      let reported = false;
      if (
        isFirstOfMonth &&
        snap &&
        !snap.stripe_usage_record_id &&
        tenant.stripe_subscription_id &&
        ["active", "trial", "past_due"].includes(tenant.billing_status ?? "")
      ) {
        try {
          const sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
          const meteredItem = sub.items.data.find(
            (it: any) => it.price?.recurring?.usage_type === "metered"
          );
          if (meteredItem) {
            const usageRecord = await stripe.subscriptionItems.createUsageRecord(
              meteredItem.id,
              {
                quantity: snap.active_agent_count,
                action: "set",
                timestamp: Math.floor(Date.now() / 1000),
              }
            );
            await adminClient
              .from("billing_snapshots")
              .update({
                stripe_usage_record_id: usageRecord.id,
                reported_to_stripe_at: new Date().toISOString(),
              })
              .eq("id", snap.id);
            reported = true;
          }
        } catch (e) {
          console.error("Failed to report usage for tenant", tenant.id, e);
        }
      }

      results.push({
        tenant_id: tenant.id,
        count: snap?.active_agent_count ?? 0,
        reported,
      });
    }

    return new Response(
      JSON.stringify({
        period_start: start,
        period_end: end,
        is_first_of_month: isFirstOfMonth,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
