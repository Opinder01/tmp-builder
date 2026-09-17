import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile, requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";
import { syncApprovedTimesheet } from "./_lib/qboSync.js";

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

    const { timesheet_id, decision, rejection_reason } = req.body || {};
    if (!timesheet_id || !["approved", "rejected"].includes(decision)) {
      return json(res, 400, { error: "timesheet_id and decision ('approved'|'rejected') are required" });
    }
    if (decision === "rejected" && !rejection_reason) {
      return json(res, 400, { error: "rejection_reason is required when rejecting" });
    }

    const supabase = getSupabaseAdmin();
    const { data: timesheet, error } = await supabase
      .from("timesheets")
      .update({
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

  return json(res, 404, { error: "Unknown action" });
}
