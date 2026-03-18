

# Fix: refs_collected / refs_sold null constraint error

## Problem
The `refs_collected` and `refs_sold` columns are `NOT NULL DEFAULT 0` in the database. But in `PostDealModal.tsx`, when the user leaves these fields empty, the code sends `null` explicitly — which overrides the default and violates the constraint.

```ts
// Current (broken):
refs_collected: refsCollected ? parseInt(refsCollected, 10) : null,
refs_sold: refsSold ? parseInt(refsSold, 10) : null,
```

## Fix
In `src/components/policies/PostDealModal.tsx`, change `null` to `0` for both fields in the `handleSubmit` upsert and the `handleSaveDraft` insert:

```ts
refs_collected: refsCollected ? parseInt(refsCollected, 10) : 0,
refs_sold: refsSold ? parseInt(refsSold, 10) : 0,
```

Two lines changed in `handleSubmit`, two lines changed in `handleSaveDraft`. No other files affected.

