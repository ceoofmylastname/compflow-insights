import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CFLogo from "@/components/CFLogo";
import { useTenantFromDomain } from "@/hooks/useTenantFromDomain";
import { hexToHsl } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: domainTenant } = useTenantFromDomain();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/dashboard");
    }
  };

  const tenantName = domainTenant?.agency_name || domainTenant?.name;
  const primaryHsl = domainTenant?.primary_color
    ? hexToHsl(domainTenant.primary_color)
    : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          {domainTenant?.logo_url ? (
            <img
              src={domainTenant.logo_url}
              alt={tenantName || ""}
              className="h-14 object-contain mb-4"
            />
          ) : domainTenant ? (
            <h2 className="text-2xl font-bold text-foreground mb-4">
              {tenantName}
            </h2>
          ) : (
            <Link to="/" className="mb-4">
              <CFLogo size="lg" />
            </Link>
          )}
          <CardTitle className="text-2xl">
            {domainTenant ? `Sign in to ${tenantName}` : "Welcome Back"}
          </CardTitle>
          {!domainTenant && (
            <CardDescription>Sign in to your BaseshopHQ account</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@agency.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button
              className="w-full"
              type="submit"
              disabled={loading}
              style={primaryHsl ? { backgroundColor: `hsl(${primaryHsl})` } : undefined}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            {!domainTenant && (
              <div className="flex items-center justify-between text-sm">
                <Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
                <Link to="/signup" className="text-primary hover:underline">Create account</Link>
              </div>
            )}
            {domainTenant && (
              <div className="text-center">
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
