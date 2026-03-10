import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import CFLogo from "@/components/CFLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";

const steps = [
  { label: "Profile complete", description: "First name, last name, and NPN filled in" },
  { label: "Agent Roster imported", description: "At least 1 agent in your roster" },
  { label: "Commission Levels imported", description: "At least 1 commission rate schedule" },
  { label: "Policy Report imported", description: "At least 1 policy record" },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // For now, step 1 is always complete after signup
  const completedSteps = [true, false, false, false];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <CFLogo size="lg" />
          <CardTitle className="mt-4 text-2xl">Get Started with CompFlow</CardTitle>
          <p className="text-muted-foreground">Complete these steps to set up your agency</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-4">
              {completedSteps[i] ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-success shrink-0" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-medium text-foreground">{step.label}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
              {!completedSteps[i] && (
                <Button variant="outline" size="sm">Set Up</Button>
              )}
            </div>
          ))}
          <Button className="w-full mt-4" onClick={() => navigate("/dashboard")}>
            {completedSteps.every(Boolean) ? "Go to Dashboard" : "Skip for Now"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
