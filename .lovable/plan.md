

# Add Webhook Configuration to Settings

## Database Migration

The `webhook_configs` table is missing an `event_type` column. Add it:

```sql
ALTER TABLE public.webhook_configs ADD COLUMN event_type text NOT NULL DEFAULT 'deal.posted';
```

No other schema changes needed. The existing column is `webhook_url` (not `url`) — we'll keep that name since it's already used throughout the codebase.

## New Hook: `src/hooks/useWebhookConfigs.ts`

Following `useCommissionLevels.ts` pattern:
- `useWebhookConfigs()` — React Query fetch all webhook_configs for the tenant
- `useCreateWebhook()` — mutation to insert, invalidates `webhookConfigs` query key
- `useDeleteWebhook()` — mutation to delete by id, invalidates `webhookConfigs` query key

## Settings Page Updates

Replace the current "Notifications" tab with a "Webhooks" tab (owner-only):

- **Add webhook form**: URL input (required, validated to start with `https://`), event type selector (just `deal.posted` for now), active toggle, Save button
- **Existing webhooks list**: Table/cards showing each webhook's URL, event type, active status, and a Delete button with confirmation
- **Test button** per webhook row
- Remove the old inline webhook state management (lines 57-73, 98-133) and replace with the new hook

## Webhook Trigger in CSVImportModal

Currently (lines 274-299) it fetches a single webhook config via `.maybeSingle()`. Change to:
1. Before the policy import loop, fetch all active `deal.posted` webhooks: `.from("webhook_configs").select("*").eq("tenant_id", tenantId).eq("is_active", true).eq("event_type", "deal.posted")`
2. After a successful policy upsert where `!error && policy`, fire webhooks for each config with the new payload format:
```json
{
  "event": "deal.posted",
  "policy_number": "...",
  "client_name": "...",
  "carrier": "...",
  "product": "...",
  "annual_premium": 0,
  "agent_email": "...",
  "application_date": "...",
  "status": "..."
}
```
3. Loop: `for (const config of webhookConfigs) { await supabase.functions.invoke('fire-webhook', { body: { webhook_url: config.webhook_url, payload } }) }`
4. Only fire for rows that were actually upserted (`!error && policy`), not skipped/error rows

## Files Changed

- New migration (add `event_type` column)
- New `src/hooks/useWebhookConfigs.ts`
- `src/pages/Settings.tsx` — rewrite Notifications tab → Webhooks tab
- `src/components/shared/CSVImportModal.tsx` — update webhook trigger logic (lines 274-299)

