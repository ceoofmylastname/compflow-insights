import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  Active: "bg-success/20 text-success border-success/30",
  Submitted: "bg-primary/20 text-primary border-primary/30",
  Pending: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  Terminated: "bg-destructive/20 text-destructive border-destructive/30",
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">--</span>;
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", statusStyles[status] || "")}
    >
      {status}
    </Badge>
  );
}
