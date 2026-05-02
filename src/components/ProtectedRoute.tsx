import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useOnboardingProgress } from "@/hooks/useOnboardingState";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { data: currentAgent, isLoading: agentLoading } = useCurrentAgent();
  const progress = useOnboardingProgress();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Auto-redirect new owners to the onboarding wizard until they hit
  // minimum-viable setup (positions + carrier + agent invited). Non-owners
  // bypass this gate entirely. Once we have basics, the home page banner
  // takes over for the long-tail polish steps.
  const onOnboardingRoute = location.pathname.startsWith("/onboarding");
  const canEvaluate = !agentLoading && !!currentAgent && progress != null;
  if (
    canEvaluate &&
    currentAgent.is_owner === true &&
    !onOnboardingRoute &&
    !progress.minimumViable &&
    !progress.markedComplete
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
