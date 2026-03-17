import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CFLogo from "@/components/CFLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const steps = [
  { label: "Import your agent roster", description: "At least 1 additional agent in your roster" },
  { label: "Import commission levels", description: "At least 1 commission rate schedule" },
  { label: "Import your first policies", description: "At least 1 policy record" },
  { label: "Invite your first agent", description: "At least 1 invite sent" },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: currentAgent } = useCurrentAgent();

  const tenantId = currentAgent?.tenant_id;

  const { data: counts, isLoading } = useQuery({
    queryKey: ["onboardingCounts", tenantId],
    queryFn: async () => {
      if (!tenantId) return { agents: 0, levels: 0, policies: 0, invites: 0 };

      const [agentsRes, levelsRes, policiesRes, invitesRes] = await Promise.all([
        supabase.from("agents").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("commission_levels").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("policies").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("invites").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      ]);

      return {
        agents: agentsRes.count ?? 0,
        levels: levelsRes.count ?? 0,
        policies: policiesRes.count ?? 0,
        invites: invitesRes.count ?? 0,
      };
    },
    enabled: !!tenantId,
  });

  const completedSteps = [
    (counts?.agents ?? 0) > 1,
    (counts?.levels ?? 0) >= 1,
    (counts?.policies ?? 0) >= 1,
    (counts?.invites ?? 0) >= 1,
  ];

  const allComplete = completedSteps.every(Boolean);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <CFLogo size="lg" />
          <CardTitle className="mt-4 text-2xl">Get Started with CompFlow</CardTitle>
          <p className="text-muted-foreground">Complete these steps to set up your agency</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : allComplete ? (
            <div className="text-center space-y-4 py-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <p className="text-lg font-semibold text-foreground">You're all set!</p>
              <p className="text-sm text-muted-foreground">Your agency is fully configured and ready to go.</p>
              <Button className="w-full" onClick={() => navigate("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          ) : (
            <>
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-4">
                  {completedSteps[i] ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{step.label}</p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  {!completedSteps[i] && (
                    <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
                      Set Up
                    </Button>
                  )}
                </div>
              ))}
              <Button className="w-full mt-4" variant="outline" onClick={() => navigate("/dashboard")}>
                Skip for Now
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
