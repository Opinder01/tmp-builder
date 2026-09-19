import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile, requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";
import { sendPushToWorker } from "./_lib/push.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query?.action;

  if (action === "create" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { worker_id, label, storage_path, file_name, notify } = req.body || {};
    if (!worker_id || !label || !storage_path) {
      return json(res, 400, { error: "worker_id, label, and storage_path are required" });
    }

    const supabase = getSupabaseAdmin();
    const { data: paystub, error } = await supabase
      .from("paystubs")
      .insert({ worker_id, label, storage_path, file_name: file_name || null, uploaded_by: admin.id })
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });

    if (notify) {
      try {
        await sendPushToWorker(worker_id, {
          title: "New paystub available",
          body: label,
          url: "/paystubs",
        });
      } catch (err) {
        console.error("[paystubs] push notify failed:", err.message);
      }
    }

    return json(res, 201, { paystub });
  }

  if (action === "list" && req.method === "GET") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const supabase = getSupabaseAdmin();
    let query = supabase.from("paystubs").select("*").order("uploaded_at", { ascending: false });

    if (profile.role === "admin" && req.query?.worker_id) {
      query = query.eq("worker_id", req.query.worker_id);
    } else if (profile.role !== "admin") {
      query = query.eq("worker_id", profile.id);
    } else {
      return json(res, 400, { error: "worker_id is required" });
    }

    const { data, error } = await query;
    if (error) return json(res, 500, { error: error.message });

    const withUrls = await Promise.all(
      data.map(async (p) => {
        const { data: signed } = await supabase.storage.from("paystubs").createSignedUrl(p.storage_path, 60 * 10);
        return { ...p, file_url: signed?.signedUrl || null };
      })
    );

    return json(res, 200, { paystubs: withUrls });
  }

  if (action === "delete" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: "id is required" });

    const supabase = getSupabaseAdmin();
    const { data: paystub } = await supabase.from("paystubs").select("storage_path").eq("id", id).single();
    if (paystub) await supabase.storage.from("paystubs").remove([paystub.storage_path]);

    const { error } = await supabase.from("paystubs").delete().eq("id", id);
    if (error) return json(res, 500, { error: error.message });

    return json(res, 200, { deleted: true });
  }

  return json(res, 404, { error: "Unknown action" });
}
