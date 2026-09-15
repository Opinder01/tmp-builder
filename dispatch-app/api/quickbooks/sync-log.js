import { getSupabaseAdmin } from "../_lib/supabase.js";
import { requireRole } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

  if (req.query?.action === "list" && req.method === "GET") {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("qbo_sync_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { log: data });
  }

  return json(res, 404, { error: "Unknown action" });
}
