import { getSupabaseAdmin } from "../_lib/supabase.js";
import { requireRole } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { createContractorBill } from "./sync.js";

// Timesheets already included in a successful vendor_bill sync — excluded
// from future "unbilled" lists so the same shift never gets billed twice.
async function alreadyBilledTimesheetIds() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("qbo_sync_log").select("timesheet_id").eq("target", "vendor_bill").eq("status", "success");
  return new Set((data || []).map((r) => r.timesheet_id));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

  const action = req.query?.action;
  const supabase = getSupabaseAdmin();

  if (action === "unbilled" && req.method === "GET") {
    const { worker_id, from, to } = req.query || {};
    if (!worker_id) return json(res, 400, { error: "worker_id is required" });

    let query = supabase
      .from("timesheets")
      .select("*, dispatch:dispatches(job_number, location, start_time)")
      .eq("worker_id", worker_id)
      .eq("status", "approved")
      .order("typed_start_time", { ascending: true });
    if (from) query = query.gte("typed_start_time", from);
    if (to) query = query.lte("typed_start_time", to);

    const { data, error } = await query;
    if (error) return json(res, 500, { error: error.message });

    const billedIds = await alreadyBilledTimesheetIds();
    const unbilled = data.filter((t) => !billedIds.has(t.id));
    const totalHours = unbilled.reduce((sum, t) => sum + Number(t.calculated_hours), 0);

    return json(res, 200, { timesheets: unbilled, totalHours });
  }

  if (action === "create" && req.method === "POST") {
    const { worker_id, timesheet_ids } = req.body || {};
    if (!worker_id || !Array.isArray(timesheet_ids) || timesheet_ids.length === 0) {
      return json(res, 400, { error: "worker_id and a non-empty timesheet_ids array are required" });
    }

    const { data: worker, error: workerError } = await supabase.from("profiles").select("*").eq("id", worker_id).single();
    if (workerError || !worker) return json(res, 404, { error: "Worker not found" });
    if (worker.worker_type !== "contractor") return json(res, 400, { error: "Only contractors are billed this way" });

    const { data: timesheets, error: tsError } = await supabase
      .from("timesheets")
      .select("*, dispatch:dispatches(job_number, location, start_time)")
      .in("id", timesheet_ids)
      .eq("worker_id", worker_id)
      .eq("status", "approved");
    if (tsError) return json(res, 500, { error: tsError.message });

    const billedIds = await alreadyBilledTimesheetIds();
    const unbilled = timesheets.filter((t) => !billedIds.has(t.id));
    if (unbilled.length === 0) return json(res, 400, { error: "All selected timesheets are already billed." });

    try {
      const result = await createContractorBill(worker, unbilled);
      return json(res, 200, { result });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  return json(res, 404, { error: "Unknown action" });
}
