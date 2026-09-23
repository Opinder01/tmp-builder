// Consolidated QuickBooks endpoint. Vercel's Hobby plan caps a deployment at
// 12 Serverless Functions, and each file under api/ counts as one — so every
// QuickBooks-related route (except callback.js, which must stay at its own
// path since Intuit redirects browsers there directly) lives in this single
// file, routed by ?resource=. See api/quickbooks/callback.js for the OAuth
// callback and api/_lib/qboSync.js for the shared sync logic.
import { getSupabaseAdmin } from "../_lib/supabase.js";
import { requireRole } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { getConnection, qboQuery, qboFetch } from "../_lib/qbo.js";
import { signState } from "../_lib/crypto.js";
import { splitShiftHours } from "../_lib/overtime.js";
import { createContractorBill, createCustomerInvoice } from "../_lib/qboSync.js";

function escapeQboString(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function estimateInvoiceAmount(t) {
  const split = splitShiftHours(t.calculated_hours);
  let amount = 0;
  if (t.dispatch.qbo_item_id && t.dispatch.rate != null) amount += split.regular * t.dispatch.rate;
  if (t.dispatch.qbo_ot_item_id && t.dispatch.ot_rate != null) amount += split.overtime * t.dispatch.ot_rate;
  if (t.dispatch.qbo_dt_item_id && t.dispatch.dt_rate != null) amount += split.doubletime * t.dispatch.dt_rate;
  return amount;
}

async function alreadyBilledTimesheetIds() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("qbo_sync_log").select("timesheet_id").eq("target", "vendor_bill").eq("status", "success");
  return new Set((data || []).map((r) => r.timesheet_id));
}

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

  const { resource, action } = req.query || {};
  const supabase = getSupabaseAdmin();

  // ── connect ──────────────────────────────────────────────────────────────
  if (resource === "connect" && req.method === "GET") {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return json(res, 500, { error: "QBO_CLIENT_ID / QBO_REDIRECT_URI are not configured." });
    }
    const returnOrigin = req.headers.origin || process.env.APP_ORIGIN?.split(",")[0]?.trim();
    const state = signState({ adminId: admin.id, returnOrigin });

    const url = new URL("https://appcenter.intuit.com/connect/oauth2");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
    url.searchParams.set("state", state);
    return json(res, 200, { url: url.toString() });
  }

  // ── status ───────────────────────────────────────────────────────────────
  if (resource === "status" && req.method === "GET") {
    const connection = await getConnection();
    if (!connection) return json(res, 200, { connected: false });
    return json(res, 200, {
      connected: true,
      environment: connection.environment,
      realmId: connection.realm_id,
      connectedAt: connection.connected_at,
      refreshTokenExpiresAt: connection.refresh_token_expires_at,
      refreshTokenExpired: new Date(connection.refresh_token_expires_at) < new Date(),
    });
  }

  // ── customers ────────────────────────────────────────────────────────────
  if (resource === "customers" && action === "search" && req.method === "GET") {
    const term = req.query?.q || "";
    if (!term) return json(res, 400, { error: "q is required" });
    try {
      const data = await qboQuery(
        `SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${escapeQboString(term)}%' MAXRESULTS 20`
      );
      const customers = (data.QueryResponse?.Customer || []).map((c) => ({ id: c.Id, name: c.DisplayName }));
      return json(res, 200, { customers });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  if (resource === "customers" && action === "create" && req.method === "POST") {
    const { name } = req.body || {};
    if (!name) return json(res, 400, { error: "name is required" });
    try {
      const data = await qboFetch("/customer", { method: "POST", body: { DisplayName: name } });
      return json(res, 201, { customer: { id: data.Customer.Id, name: data.Customer.DisplayName } });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  // ── items ────────────────────────────────────────────────────────────────
  if (resource === "items" && action === "list" && req.method === "GET") {
    try {
      const data = await qboQuery(`SELECT Id, Name FROM Item WHERE Type = 'Service' MAXRESULTS 100`);
      const items = (data.QueryResponse?.Item || []).map((i) => ({ id: i.Id, name: i.Name }));
      return json(res, 200, { items });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  // ── sync-log ─────────────────────────────────────────────────────────────
  if (resource === "sync-log" && action === "list" && req.method === "GET") {
    const { data, error } = await supabase
      .from("qbo_sync_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { log: data });
  }

  // ── contractor-bill ──────────────────────────────────────────────────────
  if (resource === "contractor-bill" && action === "unbilled" && req.method === "GET") {
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

  if (resource === "contractor-bill" && action === "create" && req.method === "POST") {
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

  // ── customer-invoice ─────────────────────────────────────────────────────
  if (resource === "customer-invoice" && action === "unbilled" && req.method === "GET") {
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
        "*, dispatch:dispatches(job_number, title, location, start_time, qbo_item_id, rate, qbo_ot_item_id, ot_rate, qbo_dt_item_id, dt_rate), worker:profiles!timesheets_worker_id_fkey(full_name)"
      )
      .eq("status", "approved")
      .in("dispatch_id", dispatchIds)
      .order("typed_start_time", { ascending: true });
    if (from) query = query.gte("typed_start_time", from);
    if (to) query = query.lte("typed_start_time", to);

    const { data, error } = await query;
    if (error) return json(res, 500, { error: error.message });

    const invoicedIds = await alreadyInvoicedTimesheetIds();
    const unbilled = data.filter((t) => !invoicedIds.has(t.id) && t.dispatch.qbo_item_id && t.dispatch.rate != null);
    const totalHours = unbilled.reduce((sum, t) => sum + Number(t.calculated_hours), 0);
    const totalAmount = unbilled.reduce((sum, t) => sum + estimateInvoiceAmount(t), 0);
    return json(res, 200, { timesheets: unbilled, totalHours, totalAmount });
  }

  if (resource === "customer-invoice" && action === "create" && req.method === "POST") {
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
        "*, dispatch:dispatches(job_number, title, location, start_time, qbo_item_id, rate, qbo_ot_item_id, ot_rate, qbo_dt_item_id, dt_rate), worker:profiles!timesheets_worker_id_fkey(full_name)"
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

  return json(res, 404, { error: "Unknown resource/action" });
}
