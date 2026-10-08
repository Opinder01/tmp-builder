import { getSupabaseAdmin } from "./_lib/supabase.js";
import { requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";

const SOURCES = ["website", "email", "text", "phone", "other"];

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

  const action = req.query?.action;
  const supabase = getSupabaseAdmin();

  if (action === "list" && req.method === "GET") {
    const { data, error } = await supabase.from("bookings").select("*").order("start_time", { ascending: true });
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { bookings: data });
  }

  if (action === "get" && req.method === "GET") {
    const id = req.query?.id;
    if (!id) return json(res, 400, { error: "id is required" });
    const { data, error } = await supabase.from("bookings").select("*").eq("id", id).single();
    if (error) return json(res, 404, { error: "Booking not found" });
    return json(res, 200, { booking: data });
  }

  if ((action === "create" || action === "update") && req.method === "POST") {
    const { id, client_company_id, client_company_name, start_time, location, flaggers_needed, source, notes } = req.body || {};
    if (!start_time || !location) return json(res, 400, { error: "start_time and location are required" });
    if (source && !SOURCES.includes(source)) return json(res, 400, { error: "Invalid source" });

    const row = {
      client_company_id: client_company_id || null,
      client_company_name: client_company_name || null,
      start_time,
      location,
      flaggers_needed: flaggers_needed || null,
      source: source || "other",
      notes: notes || null,
    };

    if (action === "create") {
      const { data, error } = await supabase.from("bookings").insert(row).select().single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 201, { booking: data });
    }

    if (!id) return json(res, 400, { error: "id is required" });
    const { data, error } = await supabase.from("bookings").update(row).eq("id", id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { booking: data });
  }

  if (action === "delete" && req.method === "POST") {
    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: "id is required" });
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { deleted: true });
  }

  return json(res, 404, { error: "Unknown action" });
}
