// Edge Function: stripe-monthly-snapshot
//
// Daily job (scheduled at 00:05 UTC). Per-tenant logic:
//   - starter / growth / pro: skip. Flat tiers don't report usage.
//   - enterprise:
//       Daily: snapshot rolling-30-day count (preview, in-app dashboard)
//       1st of month: snapshot prior calendar month and report usage to
//         Stripe via subscription_items.createUsageRecord
//
// Idempotent on (tenant_id, period_start_date, period_end_date) and only
// posts the Stripe usage record when stripe_usage_record_id is still NULL.
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
  if (!isFirstOfMonth) {
    const rollingEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const rollingStart = new Date(rollingEnd.getTime() - 29 * 24 * 60 * 60 * 1000);
    return {
      start: rollingStart.toISOString().split("T")[0],
      end: rollingEnd.toISOString().split("T")[0],
      isFirstOfMonth: false,
    };
  }
  // 1st of month: snapshot the calendar month that just ended
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1));
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
    const url = new URL(req.url);
    const tenantParam = url.searchParams.get("tenant_id");

    let tenantsQuery = adminClient
      .from("tenants")
      .select(
        "id, stripe_customer_id, stripe_subscription_id, billing_status, current_plan_tier"
      );
    if (tenantParam) tenantsQuery = tenantsQuery.eq("id", tenantParam);

    const { data: tenants, error } = await tenantsQuery;
    if (error) throw error;

    const results: Array<{
      tenant_id: string;
      tier: string | null;
      skipped: boolean;
      count: number;
      reported: boolean;
    }> = [];

    for (const tenant of tenants ?? []) {
      const tier = (tenant as any).current_plan_tier as string | null;

      // Flat-tier tenants don't get a usage report. Skip cleanly.
      if (tier !== "enterprise") {
        results.push({
          tenant_id: tenant.id,
          tier,
          skipped: true,
          count: 0,
          reported: false,
        });
        continue;
      }

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
        tier,
        skipped: false,
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
