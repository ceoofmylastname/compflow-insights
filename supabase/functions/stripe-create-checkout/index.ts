// Edge Function: stripe-create-checkout
//
// Creates a Stripe Checkout Session for a tenant signing up or upgrading.
// Tier-aware: line items vary based on `tier` (starter | growth | pro |
// enterprise). White-label add-on attaches as a line item when requested AND
// the tier supports it (everything except Starter).
//
// NO setup fee. The previous $497 setup fee was dropped platform-wide per
// the 2026-05-01 pricing lock. Do not reintroduce it.
//
// Trial: Starter / Growth / Pro get 14 days. Enterprise bypasses trial.
//
// Auth: Authenticated, owner-only.
//
// Required env / Vault secrets:
//   - STRIPE_SECRET_KEY
//   - STRIPE_PRICE_STARTER         (recurring, flat $97/mo)
//   - STRIPE_PRICE_GROWTH          (recurring, flat $297/mo)
//   - STRIPE_PRICE_PRO             (recurring, flat $497/mo)
//   - STRIPE_PRICE_ENTERPRISE      (recurring, metered active agents)
//   - STRIPE_PRICE_WHITE_LABEL     (recurring, flat $97/mo, optional add-on)
//   - APP_URL

// @ts-ignore - Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore - Deno
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Tier = "starter" | "growth" | "pro" | "enterprise";

const TIER_PRICE_ENV: Record<Tier, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  pro: "STRIPE_PRICE_PRO",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

const TIER_AGENT_CAP: Record<Tier, number | null> = {
  starter: 3,
  growth: 10,
  pro: 50,
  enterprise: null,
};

function whiteLabelEligible(tier: Tier): boolean {
  return tier !== "starter";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const appUrl = Deno.env.get("APP_URL") ?? "https://app.baseshophq.com";
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe environment not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tier = (body.tier ?? "starter") as Tier;
    const whiteLabel = body.whiteLabel === true;

    if (!["starter", "growth", "pro", "enterprise"].includes(tier)) {
      return new Response(JSON.stringify({ error: "Invalid tier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (whiteLabel && !whiteLabelEligible(tier)) {
      return new Response(
        JSON.stringify({ error: "White-label add-on is not available on Starter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tierPriceId = Deno.env.get(TIER_PRICE_ENV[tier]);
    const wlPriceId = Deno.env.get("STRIPE_PRICE_WHITE_LABEL");

    if (!tierPriceId) {
      return new Response(
        JSON.stringify({ error: `Stripe price for ${tier} not configured` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (whiteLabel && !wlPriceId) {
      return new Response(
        JSON.stringify({ error: "White-label price not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    const userId = claims.claims.sub;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: agent } = await adminClient
      .from("agents")
      .select("tenant_id, email, is_owner")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!agent || !agent.is_owner) {
      return new Response(JSON.stringify({ error: "Owner access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await adminClient
      .from("tenants")
      .select("id, name, stripe_customer_id")
      .eq("id", agent.tenant_id)
      .maybeSingle();

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: agent.email,
        name: tenant.name,
        metadata: { tenant_id: tenant.id },
      });
      customerId = customer.id;
      await adminClient
        .from("tenants")
        .update({ stripe_customer_id: customerId })
        .eq("id", tenant.id);
    }

    // Build line items: tier price + optional white-label.
    const lineItems: any[] = [{ price: tierPriceId }];
    if (whiteLabel && wlPriceId) {
      lineItems.push({ price: wlPriceId, quantity: 1 });
    }

    const trialDays = tier === "enterprise" ? undefined : 14;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: lineItems,
      subscription_data: {
        ...(trialDays ? { trial_period_days: trialDays } : {}),
        metadata: {
          tenant_id: tenant.id,
          tier,
          white_label: whiteLabel ? "true" : "false",
        },
      },
      metadata: {
        tenant_id: tenant.id,
        tier,
        white_label: whiteLabel ? "true" : "false",
      },
      success_url: `${appUrl}/settings?tab=billing&checkout=success`,
      cancel_url: `${appUrl}/settings?tab=billing&checkout=canceled`,
      allow_promotion_codes: true,
    });

    // Stamp the chosen tier on the tenant up front so the in-app cap
    // enforcement applies immediately, even before the webhook fires.
    // Final source of truth remains the webhook, which mirrors Stripe's
    // subscription state.
    const cap = TIER_AGENT_CAP[tier];
    await adminClient
      .from("tenants")
      .update({
        current_plan_tier: tier,
        agent_cap: cap,
        white_label_addon_active: whiteLabel,
        is_in_trial: trialDays != null,
      } as any)
      .eq("id", tenant.id);

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
