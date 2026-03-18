import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { usePlatformTenantDetail } from "@/hooks/usePlatformData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, FileText, Layers, Building2, Webhook } from "lucide-react";
import { format } from "date-fns";
import { StatusBadge } from "@/components/shared/StatusBadge";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

export default function SuperAdminTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: authLoading } = useSuperAdmin();
  const { data, isLoading } = usePlatformTenantDetail(tenantId);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) navigate("/dashboard", { replace: true });
  }, [authLoading, isSuperAdmin, navigate]);

  if (authLoading || isLoading || !data || !data.tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const { tenant, agents, policies, carriers, commissionLevels, webhooks } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate("/super-admin")}>
          <ArrowLeft className="h-4 w-4" /> Back to All Accounts
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{tenant.agency_name || tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            Tenant ID: {tenant.id} · Created {format(new Date(tenant.created_at), "MMM d, yyyy")}
          </p>
        </div>

        <Tabs defaultValue="agents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="agents" className="gap-1.5"><Users className="h-3.5 w-3.5" />Agents ({agents.length})</TabsTrigger>
            <TabsTrigger value="policies" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Policies ({policies.length})</TabsTrigger>
            <TabsTrigger value="carriers" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Carriers ({carriers.length})</TabsTrigger>
            <TabsTrigger value="commissions" className="gap-1.5"><Layers className="h-3.5 w-3.5" />Levels ({commissionLevels.length})</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5"><Webhook className="h-3.5 w-3.5" />Webhooks ({webhooks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="agents">
            <Card className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Upline</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((a: any) => (
                    <TableRow key={a.id} className={a.is_archived ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{a.first_name} {a.last_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{a.email}</TableCell>
                      <TableCell>{a.position || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.upline_email || "—"}</TableCell>
                      <TableCell>{a.contract_type || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.last_login_at ? format(new Date(a.last_login_at), "MMM d, yyyy") : "Never"}
                      </TableCell>
                      <TableCell>
                        {a.is_owner && <Badge variant="outline" className="text-[10px]">Owner</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {agents.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No agents.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="policies">
            <Card className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Premium</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.slice(0, 100).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.policy_number || "—"}</TableCell>
                      <TableCell>{p.client_name || "—"}</TableCell>
                      <TableCell>{p.carrier || "—"}</TableCell>
                      <TableCell>{p.product || "—"}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-right font-medium">{p.annual_premium ? formatCurrency(Number(p.annual_premium)) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.effective_date ? format(new Date(p.effective_date), "MMM d, yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {policies.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No policies.</TableCell></TableRow>
                  )}
                  {policies.length > 100 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4 text-xs">Showing first 100 of {policies.length} policies.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="carriers">
            <Card className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Website</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carriers.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><StatusBadge status={c.status === "active" ? "Active" : "Terminated"} /></TableCell>
                      <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{c.website || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {carriers.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No carriers.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="commissions">
            <Card className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Start Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissionLevels.map((cl: any) => (
                    <TableRow key={cl.id}>
                      <TableCell className="font-medium">{cl.carrier}</TableCell>
                      <TableCell>{cl.product}</TableCell>
                      <TableCell>{cl.position}</TableCell>
                      <TableCell className="text-right font-medium">{(Number(cl.rate) * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-muted-foreground">{cl.start_date}</TableCell>
                    </TableRow>
                  ))}
                  {commissionLevels.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No commission levels.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks">
            <Card className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map((w: any) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-sm">{w.webhook_url}</TableCell>
                      <TableCell>{w.event_type}</TableCell>
                      <TableCell>{w.is_active ? <Badge variant="outline" className="text-emerald-600">Yes</Badge> : <Badge variant="outline" className="text-muted-foreground">No</Badge>}</TableCell>
                    </TableRow>
                  ))}
                  {webhooks.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No webhooks.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
