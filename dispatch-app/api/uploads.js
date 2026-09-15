import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";

const ALLOWED_BUCKETS = new Set(["timesheet-photos", "dispatch-attachments"]);

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query?.action;

  if (action === "sign-upload" && req.method === "POST") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const { bucket, file_name } = req.body || {};
    if (!bucket || !ALLOWED_BUCKETS.has(bucket) || !file_name) {
      return json(res, 400, { error: "bucket (timesheet-photos|dispatch-attachments) and file_name are required" });
    }

    const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${profile.id}/${Date.now()}-${safeName}`;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (error) return json(res, 500, { error: error.message });

    return json(res, 200, { path, token: data.token, signedUrl: data.signedUrl });
  }

  return json(res, 404, { error: "Unknown action" });
}
