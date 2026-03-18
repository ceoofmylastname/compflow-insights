import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    // Use service role to check platform_admins and query cross-tenant data
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: adminRecord } = await adminClient
      .from("platform_admins")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!adminRecord) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");

    if (tenantId) {
      // Detail view for a single tenant
      const [tenantsRes, agentsRes, policiesRes, carriersRes, commLevelsRes, webhooksRes] =
        await Promise.all([
          adminClient.from("tenants").select("*").eq("id", tenantId).single(),
          adminClient.from("agents").select("*").eq("tenant_id", tenantId).order("is_owner", { ascending: false }).order("created_at"),
          adminClient.from("policies").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500),
          adminClient.from("carriers").select("*").eq("tenant_id", tenantId),
          adminClient.from("commission_levels").select("*").eq("tenant_id", tenantId),
          adminClient.from("webhook_configs").select("*").eq("tenant_id", tenantId),
        ]);

      return new Response(
        JSON.stringify({
          tenant: tenantsRes.data,
          agents: agentsRes.data ?? [],
          policies: policiesRes.data ?? [],
          carriers: carriersRes.data ?? [],
          commissionLevels: commLevelsRes.data ?? [],
          webhooks: webhooksRes.data ?? [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Summary view: all tenants
    const { data: tenants } = await adminClient.from("tenants").select("*").order("created_at", { ascending: false });
    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantIds = tenants.map((t) => t.id);

    // Fetch all agents and policies across tenants
    const [agentsRes, policiesRes, webhooksRes] = await Promise.all([
      adminClient.from("agents").select("id, tenant_id, first_name, last_name, email, is_owner, position, upline_email, is_archived, last_login_at, created_at").in("tenant_id", tenantIds),
      adminClient.from("policies").select("id, tenant_id, annual_premium, resolved_agent_id, created_at, status").in("tenant_id", tenantIds),
      adminClient.from("webhook_configs").select("id, tenant_id, is_active").in("tenant_id", tenantIds),
    ]);

    const allAgents = agentsRes.data ?? [];
    const allPolicies = policiesRes.data ?? [];
    const allWebhooks = webhooksRes.data ?? [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    const result = tenants.map((t) => {
      const tenantAgents = allAgents.filter((a) => a.tenant_id === t.id);
      const tenantPolicies = allPolicies.filter((p) => p.tenant_id === t.id);
      const tenantWebhooks = allWebhooks.filter((w) => w.tenant_id === t.id);
      const owner = tenantAgents.find((a) => a.is_owner);

      // Active agents: those with policies in last 30 days
      const recentAgentIds = new Set(
        tenantPolicies
          .filter((p) => p.created_at >= thirtyDaysAgoStr && p.resolved_agent_id)
          .map((p) => p.resolved_agent_id)
      );

      const totalPremium = tenantPolicies.reduce(
        (sum, p) => sum + (Number(p.annual_premium) || 0),
        0
      );

      const lastPolicyDate = tenantPolicies.length > 0 ? tenantPolicies[0].created_at : null;

      return {
        tenant_id: t.id,
        tenant_name: t.name,
        agency_name: t.agency_name,
        subdomain: t.subdomain,
        custom_domain: t.custom_domain,
        domain_verified: t.domain_verified,
        logo_url: t.logo_url,
        owner_email: owner?.email ?? "—",
        owner_name: owner ? `${owner.first_name} ${owner.last_name}` : "—",
        plan: t.plan ?? "Free",
        total_agents: tenantAgents.filter((a) => !a.is_archived).length,
        active_agents_30d: recentAgentIds.size,
        total_policies: tenantPolicies.length,
        total_premium: totalPremium,
        created_at: t.created_at,
        last_policy_date: lastPolicyDate,
        webhook_count: tenantWebhooks.filter((w) => w.is_active).length,
      };
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
