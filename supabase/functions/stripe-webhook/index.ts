// Edge Function: stripe-webhook
//
// Receives Stripe webhook events. Handles the lifecycle events that affect
// tenant billing state. Verifies signatures using STRIPE_WEBHOOK_SECRET.
//
// Events handled:
//   - checkout.session.completed         → set stripe_subscription_id, billing_status='trial' or 'active'
//   - invoice.paid                       → billing_status='active', reset failure count
//   - invoice.payment_failed             → billing_status='past_due', increment failure count, evaluate_billing_state
//   - customer.subscription.updated      → sync trial_ends_at, billing_status
//   - customer.subscription.deleted      → billing_status='canceled'
//
// Required env / Vault secrets:
//   - STRIPE_SECRET_KEY
//   - STRIPE_WEBHOOK_SECRET

// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// @ts-ignore
declare const Deno: any;

// CORS not needed (Stripe calls this directly), but keep header consistency
const corsHeaders = { "Access-Control-Allow-Origin": "*" };

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
        if (!tenantId) break;
        await adminClient
          .from("tenants")
          .update({
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            billing_status: "trial",
            trial_ends_at: session.subscription
              ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
              : null,
          })
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
          })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        // Increment the failure count
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
            payment_failure_count: (tenant.payment_failure_count ?? 0) + 1,
          })
          .eq("id", tenant.id);
        // Evaluate soft-disable transition (3 failures or 14d past_due)
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
        const update: Record<string, unknown> = { stripe_subscription_id: sub.id };
        if (trialEnd) update.trial_ends_at = trialEnd;
        if (status) update.billing_status = status;
        await adminClient
          .from("tenants")
          .update(update)
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await adminClient
          .from("tenants")
          .update({ billing_status: "canceled" })
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
