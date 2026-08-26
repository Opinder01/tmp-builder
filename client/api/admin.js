import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function isAuthorized(req) {
  const adminPassword = (process.env.ADMIN_PASSWORD || "").trim();
  if (!adminPassword) return false;
  return (req.headers["x-admin-password"] || "").trim() === adminPassword;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized." });

  const supabase = getSupabase();

  // GET — list all users
  if (req.method === "GET") {
    const { data: users, error: usersErr } = await supabase
      .from("app_users")
      .select("email, full_name, company_name, phone, created_at")
      .order("created_at", { ascending: false });

    if (usersErr) return json(res, 500, { error: "Failed to fetch users." });

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("email, plan, stripe_customer_id, stripe_subscription_id");

    const subMap = {};
    (subs || []).forEach((s) => { subMap[s.email] = s; });

    const result = (users || []).map((u) => ({
      email:           u.email,
      fullName:        u.full_name,
      companyName:     u.company_name,
      phone:           u.phone,
      createdAt:       u.created_at,
      plan:            subMap[u.email]?.plan ?? null,
      hasSubscription: !!subMap[u.email]?.stripe_subscription_id,
    }));

    return json(res, 200, { users: result });
  }

  // DELETE — remove user by email
  if (req.method === "DELETE") {
    const email = req.query?.email?.toLowerCase?.()?.trim();
    if (!email) return json(res, 400, { error: "email query param required." });

    const { error: userErr } = await supabase.from("app_users").delete().eq("email", email);
    if (userErr) return json(res, 500, { error: "Failed to delete user." });

    await supabase.from("subscriptions").delete().eq("email", email);
    await supabase.from("user_sessions").delete().eq("email", email);

    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}
