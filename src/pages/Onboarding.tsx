import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useOnboardingState, useUpdateOnboardingState } from "@/hooks/useOnboardingState";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { OnboardingProgressHeader } from "@/components/onboarding/OnboardingProgressHeader";
import { Step1AgencyProfile } from "@/components/onboarding/Step1AgencyProfile";
import { Step2Positions } from "@/components/onboarding/Step2Positions";
import { Step3FirstCarrier } from "@/components/onboarding/Step3FirstCarrier";
import { Step4InviteAgents } from "@/components/onboarding/Step4InviteAgents";
import { Step5Webhook } from "@/components/onboarding/Step5Webhook";
import { Step6Done } from "@/components/onboarding/Step6Done";

const STEP_LABELS = [
  "Agency profile",
  "Positions blueprint",
  "First carrier",
  "Invite agents",
  "Webhook (optional)",
  "Done",
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { data: currentAgent, isLoading: agentLoading } = useCurrentAgent();
  const { data: state, isLoading: stateLoading } = useOnboardingState();
  const update = useUpdateOnboardingState();
  const [step, setStep] = useState<number>(1);

  // Resume at the next-uncompleted step on first paint.
  useEffect(() => {
    if (!state) return;
    if (state.completed_at) return; // already done — render Step 6 / will redirect below
    const resumeAt = Math.min(6, Math.max(1, (state.step_completed ?? 0) + 1));
    setStep(resumeAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.tenant_id]);

  if (agentLoading || stateLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Non-owner: bounce to dashboard.
  if (currentAgent && currentAgent.is_owner !== true) {
    return <Navigate to="/dashboard" replace />;
  }

  // Already complete and the owner navigated back here intentionally — let
  // them re-run the final screen but keep the redirect-out friendly.
  if (state?.completed_at && step !== 6) {
    return <Navigate to="/dashboard" replace />;
  }

  const advance = async (nextStep: number) => {
    // Persist the highest step the owner has reached. Step6Done writes
    // completed_at separately.
    const reached = Math.max(state?.step_completed ?? 0, nextStep - 1);
    await update.mutateAsync({ step_completed: reached });
    setStep(nextStep);
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <OnboardingProgressHeader
            currentStep={step}
            totalSteps={6}
            stepLabel={STEP_LABELS[step - 1]}
          />

          {step === 1 && <Step1AgencyProfile onNext={() => advance(2)} />}
          {step === 2 && <Step2Positions onNext={() => advance(3)} onBack={handleBack} />}
          {step === 3 && <Step3FirstCarrier onNext={() => advance(4)} onBack={handleBack} />}
          {step === 4 && <Step4InviteAgents onNext={() => advance(5)} onBack={handleBack} />}
          {step === 5 && <Step5Webhook onNext={() => advance(6)} onBack={handleBack} />}
          {step === 6 && <Step6Done onBack={handleBack} />}

          <div className="pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Save and finish later
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
