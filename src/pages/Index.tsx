import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTenantFromDomain } from "@/hooks/useTenantFromDomain";
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import StatsSection from "@/components/landing/StatsSection";
import PricingSection from "@/components/landing/PricingSection";
import Footer from "@/components/landing/Footer";

const Index = () => {
  const { user, loading } = useAuth();
  const { data: domainTenant, isLoading: domainLoading } = useTenantFromDomain();

  if (loading || domainLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Tenant domain detected — show white-labeled login redirect
  if (domainTenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
        {domainTenant.logo_url ? (
          <img
            src={domainTenant.logo_url}
            alt={domainTenant.agency_name || ""}
            className="h-14 object-contain"
          />
        ) : (
          <h1 className="text-3xl font-bold text-foreground">
            {domainTenant.agency_name || domainTenant.name}
          </h1>
        )}
        <p className="text-muted-foreground text-sm">
          Sign in to your account
        </p>
        <Navigate to="/login" replace />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <StatsSection />
      <PricingSection />
      <Footer />
    </div>
  );
};

export default Index;
