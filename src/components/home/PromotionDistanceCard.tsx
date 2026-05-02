import { usePromotionDistance } from "@/hooks/useHomePage";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, ChevronRight } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

/**
 * Distance-to-next-promotion widget per Wiki/home-page-and-announcements.md
 * §2 (personal hero card). Reads from promotion_targets and the user's
 * current production. Hidden if no target is configured for the user's
 * current position.
 */
export function PromotionDistanceCard() {
  const distance = usePromotionDistance();

  if (!distance) return null;
  if (distance.criteria.length === 0) return null;

  return (
    <div className="card-elevated p-5 animate-slide-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Next promotion
          </p>
          <h3 className="text-lg font-bold text-foreground mt-1 flex items-center gap-2">
            {distance.fromPosition ?? "Current"}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-primary">{distance.toPosition ?? "Next position"}</span>
          </h3>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Progress value={distance.overallPct} className="h-2 flex-1" />
        <span className="text-sm font-medium text-foreground tabular-nums">
          {Math.round(distance.overallPct)}%
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {distance.criteria.map((c) => {
          const fmt = c.unit === "currency" ? formatCurrency : formatNumber;
          const remaining = Math.max(0, c.target - c.current);
          return (
            <div key={c.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{c.label}</span>
              <span className="text-foreground">
                <span className="font-semibold">{fmt(c.current)}</span>
                <span className="text-muted-foreground"> / {fmt(c.target)}</span>
                {remaining > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    {fmt(remaining)} to go
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
