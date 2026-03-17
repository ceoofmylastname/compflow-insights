import { cn } from "@/lib/utils";

const statusConfig: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  Active: {
    dot: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-500/25",
  },
  Submitted: {
    dot: "bg-sky-500",
    bg: "bg-sky-50 dark:bg-sky-500/15",
    text: "text-sky-700 dark:text-sky-400",
    border: "border-sky-200 dark:border-sky-500/25",
  },
  Pending: {
    dot: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-500/25",
  },
  Terminated: {
    dot: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-500/15",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-200 dark:border-red-500/25",
  },
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">--</span>;
  const config = statusConfig[status];
  if (!config) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
        {status}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm",
        config.bg,
        config.text,
        config.border
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {status}
    </span>
  );
}
