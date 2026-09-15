import { getSupabaseAdmin } from "./_lib/supabase.js";
import { requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

  const action = req.query?.action;
  const supabase = getSupabaseAdmin();

  if (action === "list" && req.method === "GET") {
    const { data, error } = await supabase.from("client_companies").select("*").order("name");
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { companies: data });
  }

  if (action === "create" && req.method === "POST") {
    const { name, phone, email, notes, qbo_customer_id, qbo_customer_name } = req.body || {};
    if (!name) return json(res, 400, { error: "name is required" });

    const { data, error } = await supabase
      .from("client_companies")
      .insert({
        name,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
        qbo_customer_id: qbo_customer_id || null,
        qbo_customer_name: qbo_customer_name || null,
      })
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, { company: data });
  }

  if (action === "update" && req.method === "POST") {
    const { id, name, phone, email, notes, qbo_customer_id, qbo_customer_name } = req.body || {};
    if (!id) return json(res, 400, { error: "id is required" });

    const { data, error } = await supabase
      .from("client_companies")
      .update({
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(qbo_customer_id !== undefined ? { qbo_customer_id: qbo_customer_id || null } : {}),
        ...(qbo_customer_name !== undefined ? { qbo_customer_name: qbo_customer_name || null } : {}),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { company: data });
  }

  return json(res, 404, { error: "Unknown action" });
}
