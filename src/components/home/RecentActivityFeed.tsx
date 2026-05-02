import { useRecentActivity } from "@/hooks/useHomePage";
import { Activity, FileText, UserPlus, DollarSign, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

/**
 * View-down activity feed per Wiki/realtime-updates-and-hierarchy-cascade.md.
 * Owner sees tenant-wide; everyone else sees self + downline. Capped at
 * the last 20 events to keep the home page snappy.
 *
 * TODO (Prompt 5): consume `milestone.hit` events ($10K, $50K, $100K,
 * $250K, $500K, $1M annual premium) once the Webhook events expansion
 * lands the emitter. Render alongside policy_submitted / policy_issued /
 * policy_issue_paid / agent_added.
 */
export function RecentActivityFeed() {
  const { data: events, isLoading } = useRecentActivity(20);

  return (
    <div className="card-elevated p-5 animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Activity className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Recent activity</h3>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
      ) : !events || events.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No recent activity.</p>
      ) : (
        <ul className="space-y-2.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-1.5 shrink-0">
                <ActivityIcon kind={e.kind} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{e.who}</span>{" "}
                  <span className="text-muted-foreground">{verbForKind(e.kind)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.detail} · {formatDistanceToNow(parseISO(e.at))} ago
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityIcon({ kind }: { kind: string }) {
  const cls = "h-3.5 w-3.5";
  switch (kind) {
    case "policy_submitted": return <FileText className={`${cls} text-sky-500`} />;
    case "policy_issued":    return <CheckCircle2 className={`${cls} text-teal-500`} />;
    case "policy_issue_paid":return <DollarSign className={`${cls} text-emerald-500`} />;
    case "agent_added":      return <UserPlus className={`${cls} text-primary`} />;
    default:                 return <Activity className={`${cls} text-muted-foreground`} />;
  }
}

function verbForKind(kind: string): string {
  switch (kind) {
    case "policy_submitted": return "submitted a policy";
    case "policy_issued":    return "had a policy issued";
    case "policy_issue_paid":return "got paid on a policy";
    case "agent_added":      return "joined the team";
    default:                 return "did something";
  }
}
