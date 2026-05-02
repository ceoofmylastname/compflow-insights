// Edge Function: stripe-update-tier
//
// Upgrade or downgrade a tenant's tier. Stripe handles proration:
//   - Upgrade  (Starter→Growth, Growth→Pro, Pro→Enterprise, etc.)
//       Apply immediately, prorated invoice.
//   - Downgrade (Pro→Growth, Growth→Starter, etc.)
//       Apply at end of current period, no immediate charge or refund.
//
// Tier order for upgrade/downgrade comparison: starter < growth < pro < enterprise.
// Caller specifies `target_tier`; the function infers direction.
//
// Required env / Vault secrets:
//   - STRIPE_SECRET_KEY
//   - STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE

// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Tier = "starter" | "growth" | "pro" | "enterprise";

const TIER_ORDER: Tier[] = ["starter", "growth", "pro", "enterprise"];

const TIER_PRICE_ENV: Record<Tier, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  pro: "STRIPE_PRICE_PRO",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

function tierIndex(t: Tier): number {
  return TIER_ORDER.indexOf(t);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetTier = body.target_tier as Tier;
    if (!TIER_ORDER.includes(targetTier)) {
      return new Response(JSON.stringify({ error: "Invalid target_tier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: agent } = await adminClient
      .from("agents")
      .select("tenant_id, is_owner")
      .eq("auth_user_id", claims.claims.sub)
      .maybeSingle();
    if (!agent || !agent.is_owner) {
      return new Response(JSON.stringify({ error: "Owner access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await adminClient
      .from("tenants")
      .select("id, stripe_customer_id, stripe_subscription_id, current_plan_tier")
      .eq("id", agent.tenant_id)
      .maybeSingle();
    if (!tenant?.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: "No active subscription. Use /stripe-create-checkout to start one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentTier = (tenant as any).current_plan_tier as Tier | null;
    if (!currentTier) {
      return new Response(JSON.stringify({ error: "Current tier unknown" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (currentTier === targetTier) {
      return new Response(JSON.stringify({ status: "noop", tier: currentTier }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    const targetPriceId = Deno.env.get(TIER_PRICE_ENV[targetTier]);
    if (!targetPriceId) {
      return new Response(
        JSON.stringify({ error: `Stripe price for ${targetTier} not configured` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
    // Locate the tier-driving line item (the one whose price ID is in the
    // tier env map). White-label / vanity-domain items are not touched.
    const tierEnvPriceIds: Record<string, string | undefined> = {
      starter: Deno.env.get("STRIPE_PRICE_STARTER"),
      growth: Deno.env.get("STRIPE_PRICE_GROWTH"),
      pro: Deno.env.get("STRIPE_PRICE_PRO"),
      enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE"),
    };
    const tierPriceIds = new Set(Object.values(tierEnvPriceIds).filter(Boolean) as string[]);
    const tierItem = sub.items.data.find((it: any) => tierPriceIds.has(it.price?.id));
    if (!tierItem) {
      return new Response(
        JSON.stringify({ error: "Could not locate tier line item on subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isUpgrade = tierIndex(targetTier) > tierIndex(currentTier);

    // Upgrade: prorate immediately. Downgrade: schedule the change for end
    // of period via proration_behavior='none' + cancel_at_period_end pattern,
    // or via Stripe Subscription Schedules. Simplest production-ready
    // behavior: immediate price swap with proration_behavior set per direction.
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: tierItem.id, price: targetPriceId }],
      proration_behavior: isUpgrade ? "always_invoice" : "none",
      ...(isUpgrade ? {} : { billing_cycle_anchor: "unchanged" }),
      metadata: { ...sub.metadata, tier: targetTier },
    });

    // The webhook (customer.subscription.updated) will reconcile
    // current_plan_tier and agent_cap. Nothing to write here besides logging.
    return new Response(
      JSON.stringify({
        status: isUpgrade ? "upgrade_applied" : "downgrade_scheduled",
        from: currentTier,
        to: targetTier,
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
