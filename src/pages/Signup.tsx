import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CFLogo from "@/components/CFLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const Signup = () => {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [npn, setNpn] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Signup failed");

      const userId = authData.user.id;

      // 2. Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({ name: agencyName })
        .select("id")
        .single();

      if (tenantError) throw tenantError;

      // 3. Create owner agent
      const { error: agentError } = await supabase.from("agents").insert({
        tenant_id: tenant.id,
        auth_user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email,
        npn,
        is_owner: true,
        start_date: new Date().toISOString().split("T")[0],
      });

      if (agentError) throw agentError;

      toast.success("Account created! Please check your email to verify.");
      navigate("/onboarding");
    } catch (err: any) {
      toast.error(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Link to="/" className="mb-4">
            <CFLogo size="lg" />
          </Link>
          <CardTitle className="text-2xl">Create Your Account</CardTitle>
          <CardDescription>Start tracking commissions in minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" placeholder="Jane" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" placeholder="Smith" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@agency.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npn">NPN (National Producer Number)</Label>
              <Input id="npn" placeholder="12345678" value={npn} onChange={(e) => setNpn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agencyName">Agency Name</Label>
              <Input id="agencyName" placeholder="Your Insurance Agency" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Signup;
