// Edge Function: signup-owner
//
// Atomically provisions a new owner: creates an auth user, a tenant, and
// the owner agent row using the service-role key. This bypasses the RLS
// roundtrip that broke the old client-side signup flow (auth user got
// created but tenant/agent inserts failed because the session was not
// yet authenticated, leaving orphaned auth.users rows that produced
// "User already registered" on retry).
//
// Called from /signup. After this returns 200, the client signs the user
// in with email + password and then calls stripe-create-checkout to send
// them to the Stripe Checkout page for the chosen tier.
//
// Required env (auto-injected):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

// @ts-ignore - Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SignupBody {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  agency_name?: string;
  phone?: string;
  npn?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json().catch(() => ({}))) as SignupBody;
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const firstName = (body.first_name ?? "").trim();
    const lastName = (body.last_name ?? "").trim();
    const agencyName = (body.agency_name ?? "").trim();
    const phone = body.phone?.trim() || null;
    const npn = body.npn?.trim() || null;

    if (!email || !password || !firstName || !lastName || !agencyName) {
      return new Response(
        JSON.stringify({ error: "Email, password, first name, last name, and agency name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Block re-signup on emails that already have an agent row anywhere on
    // the platform. Email is unique platform-wide per the domain rules.
    const { data: existingAgent } = await admin
      .from("agents")
      .select("id, tenant_id, auth_user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingAgent) {
      return new Response(
        JSON.stringify({
          error: "An account with this email already exists. Sign in instead.",
          code: "email_in_use",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user. email_confirm:true skips the email-verification
    // step since they just typed the address into the signup form.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "Could not create user";
      const isDup = /already.*registered|exists|duplicate/i.test(msg);
      return new Response(
        JSON.stringify({
          error: isDup ? "An account with this email already exists. Sign in instead." : msg,
          code: isDup ? "email_in_use" : "auth_create_failed",
        }),
        { status: isDup ? 409 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = created.user.id;

    // Insert tenant. Roll back the auth user if this fails so the email
    // does not get stuck in "already registered" with no tenant.
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .insert({ name: agencyName, agency_name: agencyName })
      .select("id")
      .single();

    if (tenantErr || !tenant) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return new Response(
        JSON.stringify({ error: tenantErr?.message ?? "Could not create tenant" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert owner agent. Same rollback strategy on failure.
    const { error: agentErr } = await admin.from("agents").insert({
      tenant_id: tenant.id,
      auth_user_id: userId,
      first_name: firstName,
      last_name: lastName,
      email,
      npn,
      phone,
      is_owner: true,
      start_date: new Date().toISOString().split("T")[0],
    } as any);

    if (agentErr) {
      await admin.from("tenants").delete().eq("id", tenant.id).catch(() => {});
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return new Response(
        JSON.stringify({ error: agentErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ user_id: userId, tenant_id: tenant.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
