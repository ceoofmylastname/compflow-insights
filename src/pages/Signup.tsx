import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CFLogo from "@/components/CFLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface InviteData {
  id: string;
  tenant_id: string;
  invitee_email: string;
  invitee_upline_email: string | null;
  token: string;
}

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [npn, setNpn] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(!!inviteToken);

  // If there's an invite token, look it up
  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, tenant_id, invitee_email, invitee_upline_email, token")
        .eq("token", inviteToken)
        .eq("accepted", false)
        .maybeSingle();
      if (error || !data) {
        toast.error("Invalid or expired invite link");
      } else {
        setInvite(data);
        setEmail(data.invitee_email);
      }
      setLoadingInvite(false);
    })();
  }, [inviteToken]);

  const isInviteFlow = !!invite;

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

      if (isInviteFlow) {
        // Invite flow: claim existing agent record + mark invite accepted
        // Find the agent record by email + tenant
        const { data: existingAgent } = await supabase
          .from("agents")
          .select("id")
          .eq("email", invite.invitee_email)
          .eq("tenant_id", invite.tenant_id)
          .is("auth_user_id", null)
          .maybeSingle();

        if (existingAgent) {
          // Claim existing agent record
          await supabase
            .from("agents")
            .update({ auth_user_id: userId, first_name: firstName || undefined, last_name: lastName || undefined, npn: npn || undefined })
            .eq("id", existingAgent.id);
        } else {
          // No pre-existing agent row — create one under the invite's tenant
          const { error: agentError } = await supabase.from("agents").insert({
            tenant_id: invite.tenant_id,
            auth_user_id: userId,
            first_name: firstName,
            last_name: lastName,
            email,
            npn: npn || null,
            upline_email: invite.invitee_upline_email,
            is_owner: false,
            start_date: new Date().toISOString().split("T")[0],
          });
          if (agentError) throw agentError;
        }

        // Mark invite as accepted
        await supabase
          .from("invites")
          .update({ accepted: true })
          .eq("id", invite.id);

        toast.success("Account created! Welcome to the team.");
        navigate("/dashboard");
      } else {
        // Owner signup flow: create tenant + owner agent
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .insert({ name: agencyName })
          .select("id")
          .single();

        if (tenantError) throw tenantError;

        const { error: agentError } = await supabase.from("agents").insert({
          tenant_id: tenant.id,
          auth_user_id: userId,
          first_name: firstName,
          last_name: lastName,
          email,
          npn: npn || null,
          is_owner: true,
          start_date: new Date().toISOString().split("T")[0],
        });

        if (agentError) throw agentError;

        toast.success("Account created!");
        navigate("/onboarding");
      }
    } catch (err: any) {
      toast.error(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  if (loadingInvite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading invite...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Link to="/" className="mb-4">
            <CFLogo size="lg" />
          </Link>
          <CardTitle className="text-2xl">
            {isInviteFlow ? "Join Your Team" : "Create Your Account"}
          </CardTitle>
          <CardDescription>
            {isInviteFlow
              ? `You've been invited to join as ${invite.invitee_email}`
              : "Start tracking commissions in minutes"}
          </CardDescription>
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
              <Input
                id="email"
                type="email"
                placeholder="you@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isInviteFlow}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npn">NPN (National Producer Number)</Label>
              <Input id="npn" placeholder="12345678" value={npn} onChange={(e) => setNpn(e.target.value)} />
            </div>
            {!isInviteFlow && (
              <div className="space-y-2">
                <Label htmlFor="agencyName">Agency Name</Label>
                <Input id="agencyName" placeholder="Your Insurance Agency" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required />
              </div>
            )}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Creating account..." : isInviteFlow ? "Join Team" : "Create Account"}
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
