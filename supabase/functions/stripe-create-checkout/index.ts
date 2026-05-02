// Edge Function: stripe-create-checkout
//
// Creates a Stripe Checkout Session for a tenant signing up. Combines:
//   - The recurring subscription (active-agent metered pricing)
//   - The $497 one-time setup fee
//   - 14-day trial period
//
// Returns the Checkout Session URL the client redirects to.
//
// Auth: Authenticated. Pulls the caller's tenant_id from their agent record.
// Required env / Vault secrets:
//   - STRIPE_SECRET_KEY                  (Supabase Vault)
//   - STRIPE_PRICE_ACTIVE_AGENTS         (Stripe Price ID for the metered subscription)
//   - STRIPE_PRICE_SETUP_FEE             (Stripe Price ID for the one-time $497 fee)
//   - APP_URL                            (e.g. https://app.baseshophq.com)

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceActiveAgents = Deno.env.get("STRIPE_PRICE_ACTIVE_AGENTS");
    const priceSetupFee = Deno.env.get("STRIPE_PRICE_SETUP_FEE");
    const appUrl = Deno.env.get("APP_URL") ?? "https://app.baseshophq.com";

    if (!stripeKey || !priceActiveAgents || !priceSetupFee) {
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

    // Service role for tenant lookup + update
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

    // Reuse existing customer if we already created one
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        { price: priceActiveAgents }, // metered subscription line, no quantity
        { price: priceSetupFee, quantity: 1 }, // one-time $497 setup
      ],
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenant_id: tenant.id },
      },
      metadata: { tenant_id: tenant.id },
      success_url: `${appUrl}/settings?tab=billing&checkout=success`,
      cancel_url: `${appUrl}/settings?tab=billing&checkout=canceled`,
      allow_promotion_codes: true,
    });

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
