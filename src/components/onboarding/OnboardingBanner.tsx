import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useOnboardingProgress } from "@/hooks/useOnboardingState";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { Sparkles, ArrowRight } from "lucide-react";

/**
 * "Finish setting up Base Shop HQ" banner. Visible to owners only,
 * vanishes the moment progress.percent === 100. Lives at the top of
 * the Dashboard.
 */
export function OnboardingBanner() {
  const { data: currentAgent } = useCurrentAgent();
  const progress = useOnboardingProgress();

  if (!currentAgent || currentAgent.is_owner !== true) return null;
  if (!progress) return null;
  if (progress.percent >= 100) return null;

  const items = [
    { label: "Agency profile", done: progress.agencyProfileSet },
    { label: "Positions blueprint", done: progress.hasPositions },
    { label: "First carrier", done: progress.hasCarrier },
    { label: "Invite an agent", done: progress.hasInvitedAgent },
    { label: "Webhook (optional)", done: progress.webhookConfigured },
    { label: "Mark complete", done: progress.markedComplete },
  ];

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-4 sm:p-5 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Finish setting up Base Shop HQ
            </p>
            <div className="mt-2 flex items-center gap-3">
              <Progress value={progress.percent} className="h-1.5 flex-1" />
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {progress.percent}%
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {items.map((it) => (
                <span
                  key={it.label}
                  className={`text-xs flex items-center gap-1.5 ${
                    it.done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      it.done ? "bg-emerald-500" : "bg-muted-foreground/40"
                    }`}
                  />
                  {it.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Link to="/onboarding" className="shrink-0">
          <Button size="sm">
            Continue setup <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
