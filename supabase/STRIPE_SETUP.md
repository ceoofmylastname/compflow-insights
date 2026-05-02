# Stripe Setup — Operational Steps

Code is shipped. These steps must be done **once** in your Stripe account and Supabase project before billing works end to end.

## 1. Create a Stripe account + grab your keys

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and sign up (or sign in)
2. Stay in **test mode** for now (toggle top-right)
3. From Developers → API Keys, copy:
   - Publishable key (`pk_test_...`)
   - Secret key (`sk_test_...`)

## 2. Create the products and prices

In the Stripe dashboard, go to **Catalog → Products → Add product**.

### Product 1 — "Base Shop HQ Active Agents" (recurring, metered, tiered)

- **Name:** Base Shop HQ Active Agents
- **Pricing model:** **Standard pricing** with **Tiered pricing → Volume**
- **Billing period:** Monthly
- **Usage type:** **Metered** (we report quantity at end of period)
- **Tiers (Volume):**
  - First 49 units: $30.00 per unit
  - 50+ units: $25.00 per unit
- **Aggregation:** "Most recent usage record during period"

After creation, copy the **Price ID** (starts with `price_...`). This is `STRIPE_PRICE_ACTIVE_AGENTS`.

### Product 2 — "Base Shop HQ Setup Fee" (one-time)

- **Name:** Base Shop HQ Setup Fee
- **Pricing model:** Standard, one-time
- **Price:** $497.00 USD

Copy the **Price ID** → `STRIPE_PRICE_SETUP_FEE`.

## 3. Configure the Stripe webhook endpoint

After deploying the Edge Functions (Lovable does this automatically when you push), Stripe needs to know where to send events.

1. In Stripe dashboard → Developers → Webhooks → **Add endpoint**
2. **Endpoint URL:** `https://iqxcjayylqvertwznyze.supabase.co/functions/v1/stripe-webhook`
3. **Events to send:**
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click Add endpoint, then click into it, click **Reveal signing secret**, copy it (starts with `whsec_...`). This is `STRIPE_WEBHOOK_SECRET`.

## 4. Set the secrets in Supabase

Open the Supabase Dashboard → Project Settings → **Edge Functions** → **Secrets**. Add:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` from step 1 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 3 |
| `STRIPE_PRICE_ACTIVE_AGENTS` | `price_...` from step 2 |
| `STRIPE_PRICE_SETUP_FEE` | `price_...` from step 2 |
| `APP_URL` | e.g. `https://app.baseshophq.com` (or your subdomain / Lovable preview URL) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase — don't add them.

## 5. Schedule the daily snapshot cron

Run this SQL **once** in the Supabase SQL editor (replace the URL with your project's):

```sql
-- Enable pg_net if not already enabled (Supabase enables by default)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the snapshot at 00:05 UTC daily
SELECT cron.schedule(
  'stripe-monthly-snapshot',
  '5 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iqxcjayylqvertwznyze.supabase.co/functions/v1/stripe-monthly-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  $$
);
```

The `service_role_key` setting needs to be configured per project. Alternative: use Supabase's built-in **Cron** UI under Project Settings → Cron Jobs to schedule the function call without raw SQL.

To verify the schedule:

```sql
SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'stripe-monthly-snapshot';
```

## 6. Apply the migration

Paste [the migration file](./migrations/20260505000000_active_agent_billing.sql) contents into the Supabase SQL editor and run.

Verify:

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='stripe_customer_id') AS has_customer_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='billing_status') AS has_billing_status,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='billing_snapshots' AND column_name='total_amount') AS has_total_amount,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='take_billing_snapshot') AS has_snapshot_rpc,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='evaluate_billing_state') AS has_evaluate_rpc;
```

All five should be `true`.

## 7. Manual test plan

Once steps 1–6 are done:

### Test A — Subscribe a new tenant

1. Sign up a new tenant (or use a tenant currently in `billing_status='trial'`)
2. Settings → Billing → click **Subscribe**
3. Stripe Checkout opens. Use test card `4242 4242 4242 4242`, any future date, any CVC
4. After checkout completes, you're redirected back to `/settings?tab=billing&checkout=success`
5. Stripe webhook fires `checkout.session.completed` → tenant row gets `stripe_customer_id`, `stripe_subscription_id`, `billing_status='trial'`, `trial_ends_at` populated
6. Verify in SQL:
   ```sql
   SELECT id, stripe_customer_id, stripe_subscription_id, billing_status, trial_ends_at
   FROM tenants WHERE id = '<your test tenant id>';
   ```

### Test B — Take a snapshot manually

1. Settings → Billing → **Take Snapshot**
2. New row appears in Snapshot history with the correct active-agent count and projected total
3. Verify the count matches `SELECT COUNT(DISTINCT resolved_agent_id) FROM policies WHERE tenant_id = '<id>' AND status != 'Draft' AND created_at >= now() - interval '30 days';`

### Test C — Trigger the cron manually

```bash
curl -X POST "https://iqxcjayylqvertwznyze.supabase.co/functions/v1/stripe-monthly-snapshot?tenant_id=<your-tenant-id>" \
  -H "Authorization: Bearer <your-service-role-key>"
```

Response includes `count` and `reported` per tenant. On the 1st of the month, `reported=true` and a Stripe usage record is posted.

### Test D — Manage in Stripe portal

1. Settings → Billing → **Manage in Stripe**
2. Stripe Customer Portal opens
3. Update payment method, view invoices, cancel subscription
4. Cancel → Stripe webhook fires `customer.subscription.deleted` → tenant `billing_status='canceled'`

### Test E — Failed payment lifecycle

1. In Stripe dashboard, find an active subscription, change card to `4000 0000 0000 0341` (auto-fails on charge)
2. Trigger the next invoice (Stripe → Subscriptions → "Charge now")
3. Webhook fires `invoice.payment_failed` → tenant `billing_status='past_due'`, `payment_failure_count` increments
4. Repeat 3× → `evaluate_billing_state` flips tenant to `soft_disabled`
5. Verify in Settings → Billing: yellow then red status badge appears

### Test F — Idempotency

1. Run the snapshot manually twice for the same tenant
2. Verify only ONE row exists in `billing_snapshots` with the period unique key
3. The second run UPSERTs; it doesn't create a duplicate row

## 8. Going to production

When ready to take real money:

1. Stripe → toggle to **Live mode** (top-right)
2. Repeat steps 1–4 with live keys (the `pk_live_...` and `sk_live_...` ones)
3. Update Supabase secrets to the live values
4. Configure a separate live-mode webhook endpoint with its own signing secret
5. Test E above on live with a real expired card (small amount, refund yourself)
