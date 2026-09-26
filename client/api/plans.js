/**
 * Plans API — save/load/delete plans per user (syncs across devices)
 * GET    /api/plans          → list all plans (no snapshot data, just id/name/date)
 * GET    /api/plans?id=xxx   → single plan with full snapshot data
 * POST   /api/plans          → create or update a plan { id?, name, data }
 * DELETE /api/plans?id=xxx   → delete a plan
 */
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = new Set([
  "https://tmpbuilder.ca",
  "https://www.tmpbuilder.ca",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function setCors(req, res) {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function getEmailFromToken(req, supabase) {
  const auth = req.headers?.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const { data } = await supabase
    .from("user_sessions")
    .select("email")
    .eq("session_token", token)
    .maybeSingle();
  return data?.email || null;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return json(res, 204, {});

  const supabase = getSupabase();
  const email = await getEmailFromToken(req, supabase);
  if (!email) return json(res, 401, { error: "Not authenticated." });

  // ── GET: list plans or fetch one by id ────────────────────────────────────
  if (req.method === "GET") {
    const id = req.query?.id;

    if (id) {
      // Return single plan with full data
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, data, updated_at")
        .eq("id", id)
        .eq("email", email)
        .maybeSingle();
      if (error || !data) return json(res, 404, { error: "Plan not found." });
      return json(res, 200, { plan: data });
    }

    // Return list without heavy data field
    const { data, error } = await supabase
      .from("plans")
      .select("id, name, updated_at")
      .eq("email", email)
      .order("updated_at", { ascending: false });
    if (error) return json(res, 500, { error: "Failed to load plans." });
    return json(res, 200, { plans: data || [] });
  }

  // ── POST: create or update plan ───────────────────────────────────────────
  if (req.method === "POST") {
    const { id, name, data: planData } = req.body || {};
    if (!name || !planData) return json(res, 400, { error: "name and data are required." });

    if (id) {
      // Update existing plan
      const { error } = await supabase
        .from("plans")
        .update({ name, data: planData, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("email", email);
      if (error) return json(res, 500, { error: "Failed to update plan." });
      return json(res, 200, { id });
    }

    // Create new plan
    const { data: row, error } = await supabase
      .from("plans")
      .insert({ email, name, data: planData })
      .select("id")
      .single();
    if (error) return json(res, 500, { error: "Failed to save plan." });
    return json(res, 200, { id: row.id });
  }

  // ── DELETE: remove a plan ─────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const id = req.query?.id;
    if (!id) return json(res, 400, { error: "id is required." });
    const { error } = await supabase
      .from("plans")
      .delete()
      .eq("id", id)
      .eq("email", email);
    if (error) return json(res, 500, { error: "Failed to delete plan." });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed." });
}
