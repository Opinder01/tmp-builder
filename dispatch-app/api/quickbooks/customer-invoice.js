import { getSupabaseAdmin } from "../_lib/supabase.js";
import { requireRole } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { createCustomerInvoice } from "./sync.js";
import { splitShiftHours } from "../_lib/overtime.js";

function estimateAmount(t) {
  const split = splitShiftHours(t.calculated_hours);
  let amount = 0;
  if (t.dispatch.qbo_item_id && t.dispatch.rate != null) amount += split.regular * t.dispatch.rate;
  if (t.dispatch.qbo_ot_item_id && t.dispatch.ot_rate != null) amount += split.overtime * t.dispatch.ot_rate;
  if (t.dispatch.qbo_dt_item_id && t.dispatch.dt_rate != null) amount += split.doubletime * t.dispatch.dt_rate;
  return amount;
}

// Timesheets already included in a successful invoice sync — excluded from
// future "unbilled" lists so the same shift never gets invoiced twice.
async function alreadyInvoicedTimesheetIds() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("qbo_sync_log").select("timesheet_id").eq("target", "invoice").eq("status", "success");
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
    const { client_company_id, from, to } = req.query || {};
    if (!client_company_id) return json(res, 400, { error: "client_company_id is required" });

    const { data: dispatches, error: dispatchError } = await supabase
      .from("dispatches")
      .select("id")
      .eq("client_company_id", client_company_id);
    if (dispatchError) return json(res, 500, { error: dispatchError.message });
    const dispatchIds = dispatches.map((d) => d.id);
    if (dispatchIds.length === 0) return json(res, 200, { timesheets: [], totalHours: 0, totalAmount: 0 });

    let query = supabase
      .from("timesheets")
      .select(
        "*, dispatch:dispatches(job_number, location, start_time, qbo_item_id, rate, qbo_ot_item_id, ot_rate, qbo_dt_item_id, dt_rate), worker:profiles!timesheets_worker_id_fkey(full_name)"
      )
      .eq("status", "approved")
      .in("dispatch_id", dispatchIds)
      .order("typed_start_time", { ascending: true });
    if (from) query = query.gte("typed_start_time", from);
    if (to) query = query.lte("typed_start_time", to);

    const { data, error } = await query;
    if (error) return json(res, 500, { error: error.message });

    const invoicedIds = await alreadyInvoicedTimesheetIds();
    // Only shifts where the admin actually set an item + rate can be invoiced.
    const unbilled = data.filter((t) => !invoicedIds.has(t.id) && t.dispatch.qbo_item_id && t.dispatch.rate != null);
    const totalHours = unbilled.reduce((sum, t) => sum + Number(t.calculated_hours), 0);
    const totalAmount = unbilled.reduce((sum, t) => sum + estimateAmount(t), 0);

    return json(res, 200, { timesheets: unbilled, totalHours, totalAmount });
  }

  if (action === "create" && req.method === "POST") {
    const { client_company_id, timesheet_ids } = req.body || {};
    if (!client_company_id || !Array.isArray(timesheet_ids) || timesheet_ids.length === 0) {
      return json(res, 400, { error: "client_company_id and a non-empty timesheet_ids array are required" });
    }

    const { data: company, error: companyError } = await supabase
      .from("client_companies")
      .select("*")
      .eq("id", client_company_id)
      .single();
    if (companyError || !company) return json(res, 404, { error: "Contractor not found" });
    if (!company.qbo_customer_id) {
      return json(res, 400, { error: `${company.name} isn't linked to a QuickBooks customer yet.` });
    }

    const { data: timesheets, error: tsError } = await supabase
      .from("timesheets")
      .select(
        "*, dispatch:dispatches(job_number, location, start_time, qbo_item_id, rate, qbo_ot_item_id, ot_rate, qbo_dt_item_id, dt_rate), worker:profiles!timesheets_worker_id_fkey(full_name)"
      )
      .in("id", timesheet_ids)
      .eq("status", "approved");
    if (tsError) return json(res, 500, { error: tsError.message });

    const invoicedIds = await alreadyInvoicedTimesheetIds();
    const unbilled = timesheets
      .filter((t) => !invoicedIds.has(t.id) && t.dispatch.qbo_item_id && t.dispatch.rate != null)
      .map((t) => ({ ...t, worker_full_name: t.worker?.full_name }));
    if (unbilled.length === 0) return json(res, 400, { error: "All selected timesheets are already invoiced or missing rate/item." });

    try {
      const result = await createCustomerInvoice(company.qbo_customer_id, unbilled);
      return json(res, 200, { result });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  return json(res, 404, { error: "Unknown action" });
}
