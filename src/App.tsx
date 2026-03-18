import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { FilterProvider } from "@/contexts/FilterContext";

const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const MyProduction = lazy(() => import("./pages/MyProduction"));
const TeamProduction = lazy(() => import("./pages/TeamProduction"));
const BookOfBusiness = lazy(() => import("./pages/BookOfBusiness"));
const Scoreboard = lazy(() => import("./pages/Scoreboard"));
const AgentRoster = lazy(() => import("./pages/AgentRoster"));
const CommissionLevels = lazy(() => import("./pages/CommissionLevels"));
const Settings = lazy(() => import("./pages/Settings"));
const Carriers = lazy(() => import("./pages/Carriers"));
const Positions = lazy(() => import("./pages/Positions"));
const ActiveAgents = lazy(() => import("./pages/ActiveAgents"));
const Drafts = lazy(() => import("./pages/Drafts"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Contracts = lazy(() => import("./pages/Contracts"));
const Integrations = lazy(() => import("./pages/Integrations"));
const AuthenticatedLinks = lazy(() => import("./pages/AuthenticatedLinks"));
const ArchivedAgents = lazy(() => import("./pages/ArchivedAgents"));
const NotFound = lazy(() => import("./pages/NotFound"));

import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <FilterProvider>
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/my-production" element={<ProtectedRoute><MyProduction /></ProtectedRoute>} />
            <Route path="/team-production" element={<ProtectedRoute><TeamProduction /></ProtectedRoute>} />
            <Route path="/book-of-business" element={<ProtectedRoute><BookOfBusiness /></ProtectedRoute>} />
            <Route path="/scoreboard" element={<ProtectedRoute><Scoreboard /></ProtectedRoute>} />
            <Route path="/agent-roster" element={<ProtectedRoute><AgentRoster /></ProtectedRoute>} />
            <Route path="/commission-levels" element={<ProtectedRoute><CommissionLevels /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/carriers" element={<ProtectedRoute><Carriers /></ProtectedRoute>} />
            <Route path="/positions" element={<ProtectedRoute><Positions /></ProtectedRoute>} />
            <Route path="/active-agents" element={<ProtectedRoute><ActiveAgents /></ProtectedRoute>} />
            <Route path="/drafts" element={<ProtectedRoute><Drafts /></ProtectedRoute>} />
            <Route path="/payroll" element={<ProtectedRoute><Payroll /></ProtectedRoute>} />
            <Route path="/contracts" element={<ProtectedRoute><Contracts /></ProtectedRoute>} />
            <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
            <Route path="/authenticated-links" element={<ProtectedRoute><AuthenticatedLinks /></ProtectedRoute>} />
            <Route path="/archived-agents" element={<ProtectedRoute><ArchivedAgents /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </FilterProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
