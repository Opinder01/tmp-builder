import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query.action;

  if (action === "password-changed" && req.method === "POST") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", profile.id);
    if (error) return json(res, 500, { error: error.message });

    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Unknown action" });
}
