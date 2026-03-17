import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CF_ZONE_ID = Deno.env.get("CF_ZONE_ID")!;
const CF_API_TOKEN = Deno.env.get("CF_API_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { action, hostname, tenant_id } = await req.json();

    // Verify requesting user is owner of this tenant
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("tenant_id, is_owner")
      .eq("auth_user_id", user.id)
      .single();

    if (!agent || agent.tenant_id !== tenant_id || !agent.is_owner) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: corsHeaders }
      );
    }

    if (action === "add") {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/custom_hostnames`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hostname,
            ssl: {
              method: "txt",
              type: "dv",
              settings: { min_tls_version: "1.2", http2: "on" },
            },
          }),
        }
      );
      const cfData = await cfRes.json();

      if (!cfData.success) {
        return new Response(
          JSON.stringify({
            error: cfData.errors?.[0]?.message || "Cloudflare error",
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      const hostnameId = cfData.result.id;
      const txtVerification =
        cfData.result.ssl?.validation_records?.[0]?.txt_value || "";

      await supabase
        .from("tenants")
        .update({
          custom_domain: hostname,
          cloudflare_hostname_id: hostnameId,
          domain_txt_verification: txtVerification,
          domain_verified: false,
          domain_status: "pending",
        })
        .eq("id", tenant_id);

      return new Response(
        JSON.stringify({
          success: true,
          hostname_id: hostnameId,
          txt_verification: txtVerification,
          cname_target: "proxy.baseshophq.com",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "verify") {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("cloudflare_hostname_id")
        .eq("id", tenant_id)
        .single();

      if (!tenant?.cloudflare_hostname_id) {
        return new Response(
          JSON.stringify({ error: "No hostname registered" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/custom_hostnames/${tenant.cloudflare_hostname_id}`,
        { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
      );
      const cfData = await cfRes.json();
      const status = cfData.result?.status;
      const sslStatus = cfData.result?.ssl?.status;
      const isVerified = status === "active" && sslStatus === "active";

      await supabase
        .from("tenants")
        .update({
          domain_verified: isVerified,
          domain_status: isVerified
            ? "active"
            : status === "pending"
              ? "pending"
              : "failed",
        })
        .eq("id", tenant_id);

      return new Response(
        JSON.stringify({
          success: true,
          verified: isVerified,
          status,
          ssl_status: sslStatus,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "remove") {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("cloudflare_hostname_id")
        .eq("id", tenant_id)
        .single();

      if (tenant?.cloudflare_hostname_id) {
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/custom_hostnames/${tenant.cloudflare_hostname_id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
          }
        );
      }

      await supabase
        .from("tenants")
        .update({
          custom_domain: null,
          cloudflare_hostname_id: null,
          domain_txt_verification: null,
          domain_verified: false,
          domain_status: "none",
        })
        .eq("id", tenant_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: corsHeaders,
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
