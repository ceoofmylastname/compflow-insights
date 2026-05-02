# Stripe Setup — Operational Steps

Code is shipped. These steps must be done **once** in your Stripe account and Supabase project before billing works end to end.

> **Note:** This replaces an earlier setup doc that used a single metered price + $497 setup fee. Per the 2026-05-01 pricing lock, the model is now **four flat tiers (Starter / Growth / Pro / Enterprise)** with **no setup fee** and an optional **white-label add-on**.

## 1. Create a Stripe account + grab your keys

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and sign up (or sign in)
2. Stay in **test mode** for now (toggle top-right)
3. From Developers → API Keys, copy:
   - Publishable key (`pk_test_...`)
   - Secret key (`sk_test_...`)

## 2. Create the products and prices

In **Catalog → Products → Add product** in Stripe.

### Product 1 — "Base Shop HQ Starter"

- Pricing model: **Standard pricing**, recurring monthly
- Price: **$97.00 USD / month**
- Copy the Price ID → `STRIPE_PRICE_STARTER`

### Product 2 — "Base Shop HQ Growth"

- Pricing model: **Standard pricing**, recurring monthly
- Price: **$297.00 USD / month**
- Copy the Price ID → `STRIPE_PRICE_GROWTH`

### Product 3 — "Base Shop HQ Pro"

- Pricing model: **Standard pricing**, recurring monthly
- Price: **$497.00 USD / month**
- Copy the Price ID → `STRIPE_PRICE_PRO`

### Product 4 — "Base Shop HQ Enterprise" (metered)

- Pricing model: **Standard pricing → Recurring → Per-unit**, **Metered usage**
- Price: **$25.00 USD per unit per month** (default; configurable per contract)
- Aggregation: **Most recent usage record during period**
- Copy the Price ID → `STRIPE_PRICE_ENTERPRISE`

### Product 5 — "Base Shop HQ White-Label Add-On"

- Pricing model: **Standard pricing**, recurring monthly
- Price: **$97.00 USD / month**
- Copy the Price ID → `STRIPE_PRICE_WHITE_LABEL`

### Product 6 — "Additional Vanity Domain" (optional, Prompt 7 territory)

- Pricing model: **Standard pricing**, recurring monthly
- Price: **$25.00 USD / month**
- Copy the Price ID for later use (not consumed by Prompt 2 code; Prompt 7's Master Account billing roll-up adds this as a per-domain line item)

## 3. Configure the Stripe webhook endpoint

1. Stripe → Developers → Webhooks → **Add endpoint**
2. **Endpoint URL:** `https://iqxcjayylqvertwznyze.supabase.co/functions/v1/stripe-webhook`
3. **Events to send:**
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. After creation, click into the endpoint → **Reveal signing secret**, copy it (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`

## 4. Set the secrets in Supabase

Project Settings → Edge Functions → Secrets. Add:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_STARTER` | `price_...` |
| `STRIPE_PRICE_GROWTH` | `price_...` |
| `STRIPE_PRICE_PRO` | `price_...` |
| `STRIPE_PRICE_ENTERPRISE` | `price_...` |
| `STRIPE_PRICE_WHITE_LABEL` | `price_...` |
| `APP_URL` | e.g. `https://app.baseshophq.com` |

Don't add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — those are auto-injected.

## 5. Schedule the daily snapshot cron

Run this SQL **once** in the Supabase SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

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

The Edge Function branches by tier internally — flat-tier tenants are skipped, only Enterprise tenants get snapshotted and reported to Stripe.

Verify:

```sql
SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'stripe-monthly-snapshot';
```

## 6. Apply the migrations

Two migrations relevant here:

1. `supabase/migrations/20260505000000_active_agent_billing.sql` — original billing schema (tenants Stripe columns, billing_snapshots extension, RPCs)
2. `supabase/migrations/20260506000000_tier_billing.sql` — tier columns + agent cap trigger + cap status RPC

Paste both into the SQL editor in order. Verify with:

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='current_plan_tier') AS has_tier,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='agent_cap') AS has_cap,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='white_label_addon_active') AS has_wl,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='enforce_agent_cap') AS has_cap_trigger,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='tenant_agent_cap_status') AS has_cap_rpc,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_enforce_agent_cap') AS trigger_attached;
```

All six should be `true`.

## 7. Manual test plan

### Test A — Subscribe each tier

For each of Starter, Growth, Pro:

1. Sign up a fresh tenant
2. Settings → Billing → tier picker → click **Subscribe** on the tier
3. Stripe Checkout opens. Use test card `4242 4242 4242 4242`
4. After completion, redirected to `/settings?tab=billing&checkout=success`
5. Webhook fires → tenant row gets `current_plan_tier`, `agent_cap`, `stripe_customer_id`, `stripe_subscription_id`, `billing_status='trial'`, `is_in_trial=true`
6. Verify:
   ```sql
   SELECT id, current_plan_tier, agent_cap, white_label_addon_active, billing_status, trial_ends_at
   FROM tenants WHERE id = '<tenant id>';
   ```
   Starter should show `agent_cap=3`. Growth → 10. Pro → 50.

### Test B — Enterprise (no self-serve)

The "Subscribe" button on the Enterprise card is disabled with "Contact us" copy. To create an Enterprise tenant for testing, manually update the row:

```sql
UPDATE tenants SET current_plan_tier='enterprise', agent_cap=NULL WHERE id = '<tenant id>';
```

Then create the Stripe subscription manually in the dashboard with the `STRIPE_PRICE_ENTERPRISE` price.

### Test C — White-label toggle

1. On a Growth or Pro tenant: Settings → Billing → toggle "White-label add-on"
2. Stripe immediately invoices the prorated $97 add-on
3. Webhook fires `customer.subscription.updated` → `tenants.white_label_addon_active=true`
4. Toggle off: scheduled removal at end of period (no immediate refund)

White-label toggle should NOT appear on Starter (verify by checking out as Starter; the eligibility text replaces the toggle).

### Test D — Agent cap enforcement

1. As a Starter tenant (cap=3), invite 3 agents
2. Try to invite a 4th: server returns "Agent cap reached for current plan tier (starter, cap=3). Upgrade to add more agents."
3. The DB-level trigger `enforce_agent_cap` is the source of truth. The InviteAgentModal also pre-checks via `tenant_agent_cap_status` and shows the cap warning before the user even submits.
4. Upgrade to Growth → cap relaxes to 10 → invite succeeds.

### Test E — Tier upgrade and downgrade

1. Starter → click Upgrade on Pro card → Stripe applies prorated charge immediately
2. Pro → click Downgrade on Growth card → Stripe schedules the swap at end of period (no immediate change)
3. Both flows fire `customer.subscription.updated` → webhook reconciles `current_plan_tier` and `agent_cap`

### Test F — Enterprise snapshot + Stripe usage record

1. As an Enterprise tenant, create some non-draft policies
2. Run the snapshot cron manually:
   ```bash
   curl -X POST "https://iqxcjayylqvertwznyze.supabase.co/functions/v1/stripe-monthly-snapshot?tenant_id=<id>" \
     -H "Authorization: Bearer <service-role-key>"
   ```
3. Response: `results[0]` shows `tier="enterprise"`, `count=N`, `skipped=false`. On the 1st of the month, `reported=true`
4. Verify a `billing_snapshots` row exists with `total_amount` and (on month-rollover) `stripe_usage_record_id`

### Test G — Failed payment lifecycle

1. Change the customer's card in Stripe to `4000 0000 0000 0341` (always declines)
2. Force an invoice charge in Stripe dashboard
3. Webhook fires `invoice.payment_failed` → `billing_status='past_due'`, `payment_failure_count` increments
4. Repeat 3× → `evaluate_billing_state` flips tenant to `soft_disabled`
5. The Billing tab shows red status badge with the soft-disabled banner copy

### Test H — Idempotency

1. Run the snapshot manually twice for the same Enterprise tenant
2. Only one row in `billing_snapshots` (unique on tenant + period)
3. Stripe usage record only posted once (`stripe_usage_record_id` set on first run; second run sees it set and skips)

## 8. Going to production

1. Stripe → Live mode (top-right toggle)
2. Recreate the 5 products + the white-label add-on with live prices
3. Update the 5 Supabase secrets with live values
4. Configure a separate live-mode webhook endpoint with its own signing secret
5. Run Test G with a small real charge to verify the failure lifecycle works on live mode
