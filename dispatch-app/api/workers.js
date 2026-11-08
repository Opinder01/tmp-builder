import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./_lib/supabase.js";
import { requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";

// Readable-but-random one-time password (no ambiguous 0/O/1/l) — the admin
// shares this with the flagger once; they're forced to set their own on
// first login, so no one but them knows their real password after that.
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generatePassword(length = 10) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query.action;

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

    const {
      worker_id, full_name, email, worker_type,
      phone, contracted_hours_per_period, contractor_bill_rate, job_title, wage, active,
    } = req.body || {};
    if (!worker_id) return json(res, 400, { error: "worker_id is required" });
    if (active !== undefined && typeof active !== "boolean") {
      return json(res, 400, { error: "active must be true or false" });
    }
    if (full_name !== undefined && !String(full_name).trim()) {
      return json(res, 400, { error: "Name can't be empty" });
    }
    if (worker_type !== undefined && !["employee", "contractor"].includes(worker_type)) {
      return json(res, 400, { error: "worker_type must be 'employee' or 'contractor'" });
    }
    const newEmail = email !== undefined ? String(email).trim().toLowerCase() : undefined;
    if (newEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return json(res, 400, { error: "Enter a valid email address" });
    }

    const supabase = getSupabaseAdmin();

    // The email is also the flagger's login, so it has to change in the auth
    // system as well as on their profile (otherwise the two would disagree and
    // they'd be locked out of the address shown). Auth first: it rejects an
    // address that's already taken before anything else is touched.
    let previousEmail = null;
    if (newEmail !== undefined) {
      const { data: current } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", worker_id)
        .eq("role", "worker")
        .maybeSingle();
      if (!current) return json(res, 404, { error: "Worker not found" });
      if (current.email.toLowerCase() !== newEmail) {
        previousEmail = current.email;
        const { error: authError } = await supabase.auth.admin.updateUserById(worker_id, {
          email: newEmail,
          email_confirm: true,
        });
        if (authError) return json(res, 400, { error: authError.message });
      }
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .update({
        ...(full_name !== undefined ? { full_name: String(full_name).trim() } : {}),
        ...(previousEmail !== null ? { email: newEmail } : {}),
        ...(worker_type !== undefined ? { worker_type } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(contracted_hours_per_period !== undefined ? { contracted_hours_per_period: contracted_hours_per_period || null } : {}),
        ...(contractor_bill_rate !== undefined ? { contractor_bill_rate: contractor_bill_rate || null } : {}),
        ...(job_title !== undefined ? { job_title: job_title || null } : {}),
        ...(wage !== undefined ? { wage: wage || null } : {}),
        // Deactivating only hides the flagger from the dispatch pickers; their
        // login, history and timesheets are untouched.
        ...(active !== undefined ? { active } : {}),
      })
      .eq("id", worker_id)
      .eq("role", "worker")
      .select()
      .single();
    if (error) {
      // Keep login and profile in step: put the old login email back.
      if (previousEmail !== null) {
        await supabase.auth.admin.updateUserById(worker_id, { email: previousEmail, email_confirm: true });
      }
      return json(res, 500, { error: error.message });
    }
    if (!profile) return json(res, 404, { error: "Worker not found" });

    return json(res, 200, { worker: profile });
  }

  if (action === "create" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { email, full_name, worker_type, phone, contracted_hours_per_period, contractor_bill_rate, job_title, wage } = req.body || {};
    if (!email || !full_name || !worker_type) {
      return json(res, 400, { error: "email, full_name, and worker_type are required" });
    }
    if (!["employee", "contractor"].includes(worker_type)) {
      return json(res, 400, { error: "worker_type must be 'employee' or 'contractor'" });
    }

    const password = generatePassword();
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
        must_change_password: true,
      })
      .select()
      .single();
    if (profileError) return json(res, 500, { error: profileError.message });

    return json(res, 201, { worker: profile, temporary_password: password });
  }

  if (action === "reset-password" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { worker_id } = req.body || {};
    if (!worker_id) return json(res, 400, { error: "worker_id is required" });

    const password = generatePassword();
    const supabase = getSupabaseAdmin();
    const { error: updateError } = await supabase.auth.admin.updateUserById(worker_id, { password });
    if (updateError) return json(res, 500, { error: updateError.message });

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", worker_id)
      .eq("role", "worker");
    if (profileError) return json(res, 500, { error: profileError.message });

    return json(res, 200, { temporary_password: password });
  }

  return json(res, 404, { error: "Unknown action" });
}
