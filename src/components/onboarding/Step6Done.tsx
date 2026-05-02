import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useUpdateOnboardingState } from "@/hooks/useOnboardingState";
import { useNavigate } from "react-router-dom";

interface Props {
  onBack: () => void;
}

export function Step6Done({ onBack }: Props) {
  const navigate = useNavigate();
  const update = useUpdateOnboardingState();
  const [marking, setMarking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await update.mutateAsync({
          step_completed: 6,
          completed_at: new Date().toISOString(),
        });
      } finally {
        if (!cancelled) setMarking(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 text-center py-6">
      <div className="mx-auto rounded-full bg-emerald-500/10 p-4 w-fit">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">You're all set</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Base Shop HQ is configured and ready to ingest carrier statements. Drop in a CSV from Book of Business and the system will route every row to the right agent.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 max-w-md mx-auto text-left">
        <p className="text-sm font-medium text-foreground mb-2">Recommended next steps</p>
        <ul className="text-xs text-muted-foreground space-y-1.5">
          <li>1. Add commission rates per carrier on the Carriers page.</li>
          <li>2. Record each agent's writing number and NPN under their profile.</li>
          <li>3. Upload your first carrier statement from Book of Business → Import CSV.</li>
        </ul>
      </div>

      <div className="flex justify-between max-w-md mx-auto pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={() => navigate("/dashboard")} disabled={marking}>
          {marking ? "Finishing..." : (
            <>
              Go to dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
