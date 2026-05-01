import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentRole } from "@/lib/agent-role";

const ROLE_STYLES: Record<AgentRole, string> = {
  Owner: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
  Manager: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30",
  Agent: "bg-muted text-muted-foreground border-border",
};

interface Props {
  role: AgentRole;
  className?: string;
}

export function AgentRoleBadge({ role, className }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0 h-4", ROLE_STYLES[role], className)}
    >
      {role}
    </Badge>
  );
}
