import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile, requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";
import { syncApprovedTimesheet } from "./_lib/qboSync.js";
import { splitShiftHours } from "./_lib/overtime.js";
import { sendPushToWorker } from "./_lib/push.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query?.action;

  if (action === "submit" && req.method === "POST") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const { dispatch_id, slip_photo_path, typed_start_time, typed_end_time, break_minutes } = req.body || {};
    if (!dispatch_id || !slip_photo_path || !typed_start_time || !typed_end_time) {
      return json(res, 400, {
        error: "dispatch_id, slip_photo_path, typed_start_time, and typed_end_time are required",
      });
    }

    const supabase = getSupabaseAdmin();

    // Confirm this dispatch actually belongs to the submitting worker (admins don't submit timesheets).
    const { data: dispatch, error: dispatchError } = await supabase
      .from("dispatches")
      .select("id, worker_id")
      .eq("id", dispatch_id)
      .single();
    if (dispatchError || !dispatch) return json(res, 404, { error: "Dispatch not found" });
    if (dispatch.worker_id !== profile.id) return json(res, 403, { error: "Forbidden" });

    const { data: timesheet, error } = await supabase
      .from("timesheets")
      .insert({
        dispatch_id,
        worker_id: profile.id,
        slip_photo_path,
        typed_start_time,
        typed_end_time,
        break_minutes: break_minutes || 0,
      })
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });

    return json(res, 201, { timesheet });
  }

  if (action === "pending" && req.method === "GET") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("timesheets")
      .select("*, worker:profiles!timesheets_worker_id_fkey(id, full_name), dispatch:dispatches(id, job_number, location, start_time)")
      .eq("status", "pending")
      .order("submitted_at", { ascending: true });
    if (error) return json(res, 500, { error: error.message });

    const withPhotoUrls = await Promise.all(
      data.map(async (t) => {
        const { data: signed } = await supabase.storage
          .from("timesheet-photos")
          .createSignedUrl(t.slip_photo_path, 60 * 10); // 10 minutes, just enough for the review screen
        return { ...t, slip_photo_url: signed?.signedUrl || null };
      })
    );

    return json(res, 200, { timesheets: withPhotoUrls });
  }

  if (action === "review" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const {
      timesheet_id, decision, rejection_reason,
      typed_start_time, typed_end_time, break_minutes, notify,
    } = req.body || {};
    if (!timesheet_id || !["approved", "rejected"].includes(decision)) {
      return json(res, 400, { error: "timesheet_id and decision ('approved'|'rejected') are required" });
    }
    if (decision === "rejected" && !rejection_reason) {
      return json(res, 400, { error: "rejection_reason is required when rejecting" });
    }

    const supabase = getSupabaseAdmin();

    // Admin can correct an obvious typo (wrong AM/PM, wrong end time, etc.)
    // right from the approval screen before approving -- calculated_hours is
    // a generated column, so it recomputes automatically from these.
    const corrections = {};
    if (typed_start_time) corrections.typed_start_time = typed_start_time;
    if (typed_end_time) corrections.typed_end_time = typed_end_time;
    if (break_minutes !== undefined && break_minutes !== null) corrections.break_minutes = break_minutes;

    const { data: timesheet, error } = await supabase
      .from("timesheets")
      .update({
        ...corrections,
        status: decision,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: decision === "rejected" ? rejection_reason : null,
      })
      .eq("id", timesheet_id)
      .eq("status", "pending") // prevents re-reviewing an already-decided timesheet
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    if (!timesheet) return json(res, 409, { error: "Timesheet already reviewed or not found" });

    let sync;
    if (decision === "approved") {
      const { data: dispatch } = await supabase.from("dispatches").select("*").eq("id", timesheet.dispatch_id).single();
      const { data: worker } = await supabase.from("profiles").select("*").eq("id", timesheet.worker_id).single();
      // Never blocks the approval itself — failures are logged to qbo_sync_log
      // and retryable from the QuickBooks settings screen.
      sync = await syncApprovedTimesheet(timesheet, dispatch, worker);

      if (notify) {
        try {
          await sendPushToWorker(timesheet.worker_id, {
            title: Object.keys(corrections).length > 0 ? "Timesheet approved (hours corrected)" : "Timesheet approved",
            body: dispatch?.job_number
              ? `Job ${dispatch.job_number} — ${timesheet.calculated_hours}h approved`
              : `${timesheet.calculated_hours}h approved`,
            url: "/history",
          });
        } catch (err) {
          console.error("[timesheets] push notify failed:", err.message);
        }
      }
    }

    return json(res, 200, { timesheet, sync });
  }

  if (action === "retry-sync" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { timesheet_id } = req.body || {};
    if (!timesheet_id) return json(res, 400, { error: "timesheet_id is required" });

    const supabase = getSupabaseAdmin();
    const { data: timesheet } = await supabase.from("timesheets").select("*").eq("id", timesheet_id).single();
    if (!timesheet || timesheet.status !== "approved") {
      return json(res, 400, { error: "Timesheet must be approved before it can be synced" });
    }
    const { data: dispatch } = await supabase.from("dispatches").select("*").eq("id", timesheet.dispatch_id).single();
    const { data: worker } = await supabase.from("profiles").select("*").eq("id", timesheet.worker_id).single();

    const sync = await syncApprovedTimesheet(timesheet, dispatch, worker);
    return json(res, 200, { sync });
  }

  if (action === "mine" && req.method === "GET") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("timesheets")
      .select("*, dispatch:dispatches(id, job_number, location, start_time, client_company_name)")
      .eq("worker_id", profile.id)
      .order("submitted_at", { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { timesheets: data });
  }

  if (action === "payroll-summary" && req.method === "GET") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { from, to } = req.query || {};
    if (!from || !to) return json(res, 400, { error: "from and to (dates) are required" });

    const supabase = getSupabaseAdmin();
    // Grouped by the shift's own typed start time (when the work actually
    // happened), not when it was submitted or reviewed -- that's what
    // determines which pay period a shift belongs to.
    const { data, error } = await supabase
      .from("timesheets")
      .select("calculated_hours, typed_start_time, worker:profiles!timesheets_worker_id_fkey(id, full_name, worker_type)")
      .eq("status", "approved")
      .gte("typed_start_time", from)
      .lt("typed_start_time", to);
    if (error) return json(res, 500, { error: error.message });

    const byWorker = new Map();
    for (const t of data) {
      if (!t.worker || t.worker.worker_type !== "employee") continue; // contractors are billed, not run through payroll
      const key = t.worker.id;
      if (!byWorker.has(key)) {
        byWorker.set(key, { worker_id: key, full_name: t.worker.full_name, regular: 0, overtime: 0, doubletime: 0 });
      }
      const split = splitShiftHours(t.calculated_hours);
      const entry = byWorker.get(key);
      entry.regular += split.regular;
      entry.overtime += split.overtime;
      entry.doubletime += split.doubletime;
    }

    const summary = [...byWorker.values()]
      .map((e) => ({ ...e, total: Math.round((e.regular + e.overtime + e.doubletime) * 100) / 100 }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    return json(res, 200, { summary });
  }

  return json(res, 404, { error: "Unknown action" });
}
