import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Rate limit admin auth attempts to prevent brute-force
const _rl = new Map();
function rateLimit(ip, maxAttempts, windowSec) {
  const now = Date.now();
  const e = _rl.get(ip);
  if (!e || now > e.r) { _rl.set(ip, { n: 1, r: now + windowSec * 1000 }); return false; }
  e.n++;
  return e.n > maxAttempts;
}
function getIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress || "unknown";
}

function isAuthorized(req) {
  const adminPassword = (process.env.ADMIN_PASSWORD || "").trim();
  if (!adminPassword) return false;
  const supplied = (req.headers["x-admin-password"] || "").trim();
  if (!supplied) return false;
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(adminPassword));
  } catch { return false; }
}

const ALLOWED_ORIGINS = new Set([
  "https://tmpbuilder.ca", "https://www.tmpbuilder.ca",
  "http://localhost:3000", "http://localhost:5173", "http://localhost:4173",
]);

export default async function handler(req, res) {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  if (req.method === "OPTIONS") return json(res, 204, {});

  const ip = getIp(req);
  // 5 failed attempts per IP per 15 minutes
  if (rateLimit(ip, 5, 900) && !isAuthorized(req))
    return json(res, 429, { error: "Too many attempts. Please wait 15 minutes." });

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
