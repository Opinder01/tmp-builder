import { getSupabaseAdmin } from "./_lib/supabase.js";
import { requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query.action;

  // TEMPORARY — reports this function's outbound IP for the Intuit production
  // app hosting-location questionnaire. Remove after.
  if (action === "diag-ip" && req.method === "GET") {
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      const data = await r.json();
      return json(res, 200, { ip: data.ip, region: process.env.VERCEL_REGION || null });
    } catch (err) {
      return json(res, 200, { error: err.message });
    }
  }

  if (action === "list" && req.method === "GET") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, worker_type, contracted_hours_per_period, contractor_bill_rate, job_title, wage, active")
      .eq("role", "worker")
      .order("full_name");
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { workers: data });
  }

  if (action === "update" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { worker_id, phone, contracted_hours_per_period, contractor_bill_rate, job_title, wage } = req.body || {};
    if (!worker_id) return json(res, 400, { error: "worker_id is required" });

    const supabase = getSupabaseAdmin();
    const { data: profile, error } = await supabase
      .from("profiles")
      .update({
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(contracted_hours_per_period !== undefined ? { contracted_hours_per_period: contracted_hours_per_period || null } : {}),
        ...(contractor_bill_rate !== undefined ? { contractor_bill_rate: contractor_bill_rate || null } : {}),
        ...(job_title !== undefined ? { job_title: job_title || null } : {}),
        ...(wage !== undefined ? { wage: wage || null } : {}),
      })
      .eq("id", worker_id)
      .eq("role", "worker")
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    if (!profile) return json(res, 404, { error: "Worker not found" });

    return json(res, 200, { worker: profile });
  }

  if (action === "create" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { email, password, full_name, worker_type, phone, contracted_hours_per_period, contractor_bill_rate, job_title, wage } = req.body || {};
    if (!email || !password || !full_name || !worker_type) {
      return json(res, 400, { error: "email, password, full_name, and worker_type are required" });
    }
    if (!["employee", "contractor"].includes(worker_type)) {
      return json(res, 400, { error: "worker_type must be 'employee' or 'contractor'" });
    }

    const supabase = getSupabaseAdmin();
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) return json(res, 500, { error: createError.message });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: created.user.id,
        role: "worker",
        worker_type,
        full_name,
        email,
        phone: phone || null,
        contracted_hours_per_period: contracted_hours_per_period || null,
        contractor_bill_rate: contractor_bill_rate || null,
        job_title: job_title || null,
        wage: wage || null,
      })
      .select()
      .single();
    if (profileError) return json(res, 500, { error: profileError.message });

    return json(res, 201, { worker: profile });
  }

  return json(res, 404, { error: "Unknown action" });
}
