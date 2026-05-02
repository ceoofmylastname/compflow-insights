// Edge Function: stripe-webhook
//
// Receives Stripe webhook events and syncs tenant billing state.
//
// Tier-aware: when a subscription is created/updated, we walk its line items
// to figure out (a) which tier the tenant is on and (b) whether the
// white-label add-on is active. This is the source of truth — the in-app
// "tier picker" sets it optimistically, but the webhook reconciles after
// Stripe accepts the change.
//
// Events handled:
//   - checkout.session.completed         → set stripe_subscription_id, tier from metadata
//   - invoice.paid                       → billing_status='active', reset failure count
//   - invoice.payment_failed             → billing_status='past_due', increment failure count
//   - customer.subscription.updated      → sync tier, agent_cap, white_label_addon_active, trial state, billing_status
//   - customer.subscription.deleted      → billing_status='canceled'
//
// Required env / Vault secrets:
//   - STRIPE_SECRET_KEY
//   - STRIPE_WEBHOOK_SECRET
//   - STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PRO,
//     STRIPE_PRICE_ENTERPRISE, STRIPE_PRICE_WHITE_LABEL
//     (so we can map a price back to a tier / add-on)

// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// @ts-ignore
declare const Deno: any;

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

const TIER_AGENT_CAP: Record<string, number | null> = {
  starter: 3,
  growth: 10,
  pro: 50,
  enterprise: null,
};

function loadPriceMap(): { tierByPrice: Record<string, string>; whiteLabelPriceId: string | null } {
  const tierByPrice: Record<string, string> = {};
  const starter = Deno.env.get("STRIPE_PRICE_STARTER");
  const growth = Deno.env.get("STRIPE_PRICE_GROWTH");
  const pro = Deno.env.get("STRIPE_PRICE_PRO");
  const enterprise = Deno.env.get("STRIPE_PRICE_ENTERPRISE");
  const wl = Deno.env.get("STRIPE_PRICE_WHITE_LABEL");
  if (starter) tierByPrice[starter] = "starter";
  if (growth) tierByPrice[growth] = "growth";
  if (pro) tierByPrice[pro] = "pro";
  if (enterprise) tierByPrice[enterprise] = "enterprise";
  return { tierByPrice, whiteLabelPriceId: wl ?? null };
}

function inspectSubscription(
  sub: any,
  priceMap: { tierByPrice: Record<string, string>; whiteLabelPriceId: string | null }
) {
  let tier: string | null = null;
  let whiteLabel = false;
  for (const item of sub.items?.data ?? []) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    const t = priceMap.tierByPrice[priceId];
    if (t) tier = t;
    if (priceMap.whiteLabelPriceId && priceId === priceMap.whiteLabelPriceId) {
      whiteLabel = true;
    }
  }
  return { tier, whiteLabel };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Stripe not configured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const priceMap = loadPriceMap();

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature ?? "",
      webhookSecret
    );
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${(err as Error).message}`, {
      status: 400,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const tenantId = session.metadata?.tenant_id;
        const sessionTier = session.metadata?.tier as string | undefined;
        const sessionWL = session.metadata?.white_label === "true";
        if (!tenantId) break;
        const cap = sessionTier ? TIER_AGENT_CAP[sessionTier] ?? null : null;
        await adminClient
          .from("tenants")
          .update({
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            billing_status: "trial",
            is_in_trial: sessionTier !== "enterprise",
            current_plan_tier: sessionTier ?? null,
            agent_cap: cap,
            white_label_addon_active: sessionWL,
            trial_ends_at:
              session.subscription && sessionTier !== "enterprise"
                ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                : null,
          } as any)
          .eq("id", tenantId);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        await adminClient
          .from("tenants")
          .update({
            billing_status: "active",
            payment_failure_count: 0,
            last_invoice_paid_at: new Date().toISOString(),
            last_invoice_amount: (invoice.amount_paid ?? 0) / 100,
          } as any)
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const { data: tenant } = await adminClient
          .from("tenants")
          .select("id, payment_failure_count")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!tenant) break;
        await adminClient
          .from("tenants")
          .update({
            billing_status: "past_due",
            payment_failure_count: ((tenant as any).payment_failure_count ?? 0) + 1,
          } as any)
          .eq("id", tenant.id);
        await adminClient.rpc("evaluate_billing_state" as any, { p_tenant_id: tenant.id });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const customerId = sub.customer;
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
        const status =
          sub.status === "active"
            ? "active"
            : sub.status === "trialing"
            ? "trial"
            : sub.status === "past_due"
            ? "past_due"
            : sub.status === "canceled"
            ? "canceled"
            : null;

        const { tier, whiteLabel } = inspectSubscription(sub, priceMap);

        const update: Record<string, unknown> = {
          stripe_subscription_id: sub.id,
        };
        if (trialEnd) {
          update.trial_ends_at = trialEnd;
          update.is_in_trial = sub.status === "trialing";
        }
        if (status) update.billing_status = status;
        if (tier) {
          update.current_plan_tier = tier;
          update.agent_cap = TIER_AGENT_CAP[tier] ?? null;
        }
        update.white_label_addon_active = whiteLabel;

        await adminClient
          .from("tenants")
          .update(update as any)
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await adminClient
          .from("tenants")
          .update({ billing_status: "canceled" } as any)
          .eq("stripe_customer_id", sub.customer);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(`Handler error: ${(err as Error).message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
