import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";

interface GoalProgressProps {
  current: number;
  goal: number;
  loading?: boolean;
}

export function GoalProgress({ current, goal, loading }: GoalProgressProps) {
  const percent = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;

  return (
    <div className="card-elevated">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Annual Goal Progress
          </span>
          <span className="text-sm font-bold text-foreground">
            {loading ? "..." : `${percent.toFixed(0)}%`}
          </span>
        </div>
        {loading ? (
          <div className="h-2.5 w-full animate-pulse rounded-full bg-muted" />
        ) : (
          <Progress value={percent} className="h-2.5" />
        )}
        <p className="text-xs text-muted-foreground">
          {formatCurrency(current)} of {formatCurrency(goal)} Goal
        </p>
      </div>
    </div>
  );
}
