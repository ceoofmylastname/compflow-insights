import { Progress } from "@/components/ui/progress";
import CFLogo from "@/components/CFLogo";

interface Props {
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
}

export function OnboardingProgressHeader({ currentStep, totalSteps, stepLabel }: Props) {
  const pct = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CFLogo size="sm" />
          <span className="text-sm font-semibold text-foreground">BaseshopHQ</span>
        </div>
        <span className="text-xs text-muted-foreground">
          Step {currentStep} of {totalSteps}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{stepLabel}</p>
    </div>
  );
}
