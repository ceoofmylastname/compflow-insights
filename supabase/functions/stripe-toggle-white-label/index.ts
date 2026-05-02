// Edge Function: stripe-toggle-white-label
//
// Add or remove the White-Label Add-On line item on the tenant's subscription.
// Available on Growth, Pro, Enterprise. Hidden / rejected on Starter.
//
// Adding: prorated immediate add of the $97/mo line item.
// Removing: scheduled removal at end of current period.
//
// When the add-on is removed, vanity domains tied to the tenant should
// gracefully unbind at end of period. That cleanup is the white-label
// architecture's responsibility (Prompt 7) — this function just toggles
// the line item.
//
// Required env / Vault secrets:
//   - STRIPE_SECRET_KEY
//   - STRIPE_PRICE_WHITE_LABEL

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const wlPriceId = Deno.env.get("STRIPE_PRICE_WHITE_LABEL");
    if (!stripeKey || !wlPriceId) {
      return new Response(
        JSON.stringify({ error: "Stripe / white-label price not configured" }),
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
    const enable = body.enable === true;

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
      .select("id, stripe_subscription_id, current_plan_tier")
      .eq("id", agent.tenant_id)
      .maybeSingle();

    if (!tenant?.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "No active subscription" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentTier = (tenant as any).current_plan_tier as string | null;
    if (enable && currentTier === "starter") {
      return new Response(
        JSON.stringify({ error: "White-label add-on is not available on Starter. Upgrade first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
    const existingItem = sub.items.data.find((it: any) => it.price?.id === wlPriceId);

    if (enable && existingItem) {
      return new Response(JSON.stringify({ status: "already_active" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!enable && !existingItem) {
      return new Response(JSON.stringify({ status: "already_inactive" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (enable) {
      // Add the line item with immediate proration
      await stripe.subscriptionItems.create({
        subscription: sub.id,
        price: wlPriceId,
        quantity: 1,
        proration_behavior: "always_invoice",
      });
    } else {
      // Remove at end of period (proration_behavior 'none')
      await stripe.subscriptionItems.del(existingItem.id, {
        proration_behavior: "none",
      });
    }

    // Webhook will reconcile white_label_addon_active. Optimistic write here
    // so the UI updates immediately.
    await adminClient
      .from("tenants")
      .update({ white_label_addon_active: enable } as any)
      .eq("id", tenant.id);

    return new Response(
      JSON.stringify({ status: enable ? "added" : "scheduled_removal" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
