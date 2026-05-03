/**
 * Per-agent commission rate editor per Wiki/comp-grid-engine.md
 * ("Per-agent rate overrides", 2026-05-02). Owner-managed; read-only
 * for non-owners (write actions are RLS-rejected anyway, but the UI
 * hides them too).
 *
 * Renders one row per (carrier, product) pair active in the tenant.
 * Dropdown is the canonical 17-option ladder (50% to 130% in 5%
 * increments). Source label tells the owner whether the current rate
 * is an explicit per-agent override or the position-default fallback.
 *
 * Save logic: useSetAgentRate closes any prior open row for that
 * (agent, carrier, product) and inserts a new row with start_date
 * = today. Time-stamped: yesterday's policies still resolve to the
 * prior rate; today's pick up the new rate.
 */

import { useMemo } from "react";
import { useCarriers } from "@/hooks/useCarriers";
import { useCommissionLevels } from "@/hooks/useCommissionLevels";
import {
  useAgentCarrierRates,
  useSetAgentRate,
  useClearAgentRate,
} from "@/hooks/useAgentCarrierRates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/formatters";

// 17 options: 0.50, 0.55, ..., 1.30. Locked at the database level via
// the rate_in_range_5pct CHECK constraint; this is the matching UI list.
const RATE_OPTIONS: number[] = (() => {
  const out: number[] = [];
  for (let pct = 50; pct <= 130; pct += 5) out.push(pct / 100);
  return out;
})();

const formatPct = (rate: number) => `${(rate * 100).toFixed(0)}%`;

type AgentLite = {
  id: string;
  first_name: string;
  last_name: string;
  position_id: string | null;
  position?: string | null;
};

export function AgentCommissionRatesTab({
  agent,
  isOwner,
}: {
  agent: AgentLite;
  isOwner: boolean;
}) {
  const { data: carriers } = useCarriers();
  const { data: levels } = useCommissionLevels();
  const { data: agentRates } = useAgentCarrierRates(agent.id);
  const setRate = useSetAgentRate();
  const clearRate = useClearAgentRate();

  // Build the (carrier, product) row list from the tenant carrier
  // roster. A carrier with no products renders one row with NULL
  // product (covers the "any product for this carrier" override
  // case, though the picker UI here always sets a specific product).
  const rows = useMemo(() => {
    const out: Array<{ carrier: string; product: string }> = [];
    for (const c of carriers ?? []) {
      if (c.status !== "active") continue;
      const products = c.carrier_products ?? [];
      if (products.length === 0) continue;
      for (const p of products) {
        if (!p.is_active) continue;
        out.push({ carrier: c.name, product: p.name });
      }
    }
    return out;
  }, [carriers]);

  // Latest active per-agent override for a given (carrier, product).
  const activeOverride = (carrier: string, product: string) => {
    const today = new Date().toISOString().slice(0, 10);
    return (agentRates ?? []).find(
      (r) =>
        r.carrier === carrier &&
        (r.product == null || r.product === product) &&
        r.start_date <= today &&
        (!r.end_date || r.end_date >= today)
    );
  };

  // Position-default rate from commission_levels for the agent's
  // current position. Levels are sorted start_date DESC by the hook
  // so the most recent active row wins.
  const positionDefault = (carrier: string, product: string): number | null => {
    if (!agent.position_id) return null;
    const today = new Date().toISOString().slice(0, 10);
    const m = (levels ?? []).find(
      (l) =>
        l.carrier === carrier &&
        l.product === product &&
        l.position_id === agent.position_id &&
        l.start_date <= today
    );
    return m ? Number(m.rate) : null;
  };

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No carrier products configured for this tenant. Add carriers + products on{" "}
        <a href="/carriers" className="underline text-primary">
          Carriers and Comp Sheets
        </a>{" "}
        before setting per-agent rates.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            Commission rates for {agent.first_name} {agent.last_name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isOwner
              ? "Per-agent overrides on top of the position-based comp grid. Range 50% to 130% in 5% steps."
              : "Read-only view of your active rates. Contact your owner to change a rate."}
          </p>
        </div>
        {agent.position && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            Position: {agent.position}
          </Badge>
        )}
      </div>

      <div className="rounded-md border border-border max-h-[60vh] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Carrier</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Current Rate</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Effective Since</TableHead>
              {isOwner && <TableHead className="w-32">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ carrier, product }) => {
              const override = activeOverride(carrier, product);
              const def = positionDefault(carrier, product);
              const effective = override ? Number(override.rate) : def;
              const source = override ? "override" : def != null ? "position default" : "no rate set";
              const showWarning = effective != null && effective > 1.0;

              const handleChange = (next: number) => {
                if (next === effective) return;
                setRate.mutate({
                  agentId: agent.id,
                  carrier,
                  product,
                  rate: next,
                });
              };

              const handleClear = () => {
                clearRate.mutate({
                  agentId: agent.id,
                  carrier,
                  product,
                });
              };

              return (
                <TableRow key={`${carrier}::${product}`}>
                  <TableCell className="text-xs">{carrier}</TableCell>
                  <TableCell className="text-xs">{product}</TableCell>
                  <TableCell>
                    {isOwner ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={effective != null ? String(effective) : ""}
                          onValueChange={(v) => handleChange(Number(v))}
                        >
                          <SelectTrigger className="h-8 text-xs w-24">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {RATE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={String(r)}>
                                {formatPct(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {showWarning && (
                          <span
                            title="Higher than street level (100%). Confirm this is intentional."
                            className="text-amber-500"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-medium tabular-nums">
                        {effective != null ? formatPct(effective) : "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        source === "override"
                          ? "text-[10px] bg-blue-100 text-blue-800"
                          : source === "position default"
                            ? "text-[10px] bg-muted text-muted-foreground"
                            : "text-[10px] bg-amber-100 text-amber-800"
                      }
                    >
                      {source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {override ? formatDate(override.start_date) : "—"}
                  </TableCell>
                  {isOwner && (
                    <TableCell>
                      {override ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={handleClear}
                          disabled={clearRate.isPending}
                          title="Remove this override and fall back to the position default."
                        >
                          Apply default
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
