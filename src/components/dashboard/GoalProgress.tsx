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
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Annual Goal Progress</span>
        <span className="text-sm text-muted-foreground">
          {loading ? "..." : `${percent.toFixed(0)}%`}
        </span>
      </div>
      {loading ? (
        <div className="h-2 w-full animate-pulse rounded bg-muted" />
      ) : (
        <Progress value={percent} className="h-2" />
      )}
      <p className="text-xs text-muted-foreground">
        {formatCurrency(current)} of {formatCurrency(goal)} Goal
      </p>
    </div>
  );
}
