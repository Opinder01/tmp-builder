import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile, requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";
import { sendPushToWorker } from "./_lib/push.js";
import { shiftSummary } from "./_lib/shiftSummary.js";

// Which QuickBooks targets ('payroll_time_activity', 'vendor_bill', 'invoice')
// already have a successful entry created from this timesheet.
async function syncedTargets(supabase, timesheetId) {
  const { data } = await supabase
    .from("qbo_sync_log")
    .select("target")
    .eq("timesheet_id", timesheetId)
    .eq("status", "success");
  return [...new Set((data || []).map((r) => r.target))];
}

// How many of a flagger's dispatches still have no timesheet (the app badge).
async function missingTimesheetCount(supabase, workerId) {
  const { data } = await supabase.from("dispatches").select("id, timesheets(id)").eq("worker_id", workerId);
  return (data || []).filter((d) => !d.timesheets).length;
}

// Best-effort push: never fails the save (no subscription / VAPID missing / etc).
async function notifyWorker(supabase, workerId, payload) {
  try {
    await sendPushToWorker(workerId, { url: "/", ...payload, badgeCount: await missingTimesheetCount(supabase, workerId) });
  } catch (err) {
    console.error("[dispatches] push notify failed:", err.message);
  }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query?.action;

  if (action === "create" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const {
      job_number, location, start_time, notes, worker_id, worker_ids, titles, attachments,
      customer_qbo_id, qbo_customer_name, qbo_item_id, qbo_item_name, rate,
      qbo_ot_item_id, qbo_ot_item_name, ot_rate,
      qbo_dt_item_id, qbo_dt_item_name, dt_rate,
      client_company_id, client_company_name, booking_id,
    } = req.body || {};

    // Accepts either a single worker_id (back-compat) or worker_ids (array,
    // for dispatching the same job to multiple workers at once). Each
    // worker gets their own dispatch row — same job info, own timesheet,
    // own payroll/billing entry — since hours and overtime are always
    // calculated per worker per shift, never pooled across a crew.
    const ids = Array.isArray(worker_ids) && worker_ids.length > 0
      ? [...new Set(worker_ids)]
      : worker_id ? [worker_id] : [];
    if (!location || !start_time || ids.length === 0) {
      return json(res, 400, { error: "location, start_time, and at least one worker are required" });
    }

    const supabase = getSupabaseAdmin();
    // Shared across every row in this submission, so workers dispatched
    // together to the same job can see who their colleagues are on it.
    const groupId = randomUUID();
    const baseRow = {
      job_number: job_number || null,
      location,
      start_time,
      notes: notes || null,
      created_by: admin.id,
      group_id: groupId,
      customer_qbo_id: customer_qbo_id || null,
      qbo_customer_name: qbo_customer_name || null,
      qbo_item_id: qbo_item_id || null,
      qbo_item_name: qbo_item_name || null,
      rate: rate ?? null,
      qbo_ot_item_id: qbo_ot_item_id || null,
      qbo_ot_item_name: qbo_ot_item_name || null,
      ot_rate: ot_rate ?? null,
      qbo_dt_item_id: qbo_dt_item_id || null,
      qbo_dt_item_name: qbo_dt_item_name || null,
      dt_rate: dt_rate ?? null,
      client_company_id: client_company_id || null,
      client_company_name: client_company_name || null,
    };

    // Each worker on a shared job can have a different role (e.g. one is
    // TCP, another LCT), so title is per-worker, not shared in baseRow.
    const { data: dispatches, error } = await supabase
      .from("dispatches")
      .insert(ids.map((id) => ({ ...baseRow, worker_id: id, title: titles?.[id] || null })))
      .select();
    if (error) return json(res, 500, { error: error.message });

    if (Array.isArray(attachments) && attachments.length > 0) {
      const rows = dispatches.flatMap((d) =>
        attachments.map((a) => ({
          dispatch_id: d.id,
          storage_path: a.storage_path,
          file_name: a.file_name || null,
          content_type: a.content_type || null,
        }))
      );
      const { error: attError } = await supabase.from("dispatch_attachments").insert(rows);
      if (attError) return json(res, 500, { error: attError.message });
    }

    // Dispatching from a logged booking marks it done so it stops showing up
    // in the day-before reminder. Best-effort: never fails the dispatch.
    if (booking_id) {
      await supabase.from("bookings").update({ status: "dispatched" }).eq("id", booking_id);
    }

    // Never blocks dispatch creation — a worker with no push subscription
    // (or a missing VAPID config) just means the notification is skipped;
    // the dispatch is still saved and visible in the app.
    await Promise.all(
      dispatches.map(async (d) => {
        try {
          const { data: workerDispatches } = await supabase
            .from("dispatches")
            .select("id, timesheets(id)")
            .eq("worker_id", d.worker_id);
          const badgeCount = (workerDispatches || []).filter((wd) => !wd.timesheets).length;

          await sendPushToWorker(d.worker_id, {
            title: "New dispatch",
            body: shiftSummary({ job_number, location, start_time }),
            url: "/",
            badgeCount,
          });
        } catch (err) {
          console.error("[dispatches] push notify failed:", err.message);
        }
      })
    );

    return json(res, 201, { dispatches, dispatch: dispatches[0] });
  }

  if (action === "get" && req.method === "GET") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const id = req.query?.id;
    if (!id) return json(res, 400, { error: "id is required" });

    const supabase = getSupabaseAdmin();
    const { data: dispatch, error } = await supabase
      .from("dispatches")
      .select(
        "*, timesheets(id, status, typed_start_time, typed_end_time, break_minutes, calculated_hours, slip_photo_path, submitted_at, reviewed_at)"
      )
      .eq("id", id)
      .single();
    if (error) return json(res, 404, { error: "Dispatch not found" });

    // For the edit screen: a link to the slip photo, and which QuickBooks
    // entries (payroll time entry / contractor bill / customer invoice) were
    // already created from this timesheet -- changing it here can't undo those.
    if (dispatch.timesheets) {
      const ts = dispatch.timesheets;
      let slip_photo_url = null;
      if (ts.slip_photo_path) {
        const { data: signed } = await supabase.storage.from("timesheet-photos").createSignedUrl(ts.slip_photo_path, 60 * 15);
        slip_photo_url = signed?.signedUrl || null;
      }
      dispatch.timesheets = { ...ts, slip_photo_url, qbo_synced: await syncedTargets(supabase, ts.id) };
    }
    return json(res, 200, { dispatch });
  }

  if (action === "update" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const {
      id, job_number, location, start_time, notes, worker_id, title, notify,
      customer_qbo_id, qbo_customer_name, qbo_item_id, qbo_item_name, rate,
      qbo_ot_item_id, qbo_ot_item_name, ot_rate,
      qbo_dt_item_id, qbo_dt_item_name, dt_rate,
      client_company_id, client_company_name,
      // Optional timesheet changes (admin can fix a timesheet at any status,
      // including after it was approved):
      timesheet,            // { typed_start_time, typed_end_time, break_minutes } -- new hours
      delete_timesheet,     // true -> remove the timesheet so the flagger can resubmit
      timesheet_on_reassign, // "move" | "delete" -- what to do with it if the flagger changes
    } = req.body || {};
    if (!id || !location || !start_time || !worker_id) {
      return json(res, 400, { error: "id, location, start_time, and worker_id are required" });
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("dispatches")
      .select(
        "worker_id, job_number, location, start_time, timesheets(id, status, typed_start_time, typed_end_time, break_minutes, calculated_hours)"
      )
      .eq("id", id)
      .single();
    if (fetchError) return json(res, 404, { error: "Dispatch not found" });

    const oldTs = existing.timesheets || null;
    const workerChanged = existing.worker_id !== worker_id;

    // Changing the flagger on a dispatch that already has a timesheet: the
    // admin must say whether the timesheet follows the dispatch to the new
    // flagger (the wrong person was assigned) or is removed (the new flagger
    // submits their own).
    if (oldTs && workerChanged && !delete_timesheet && !["move", "delete"].includes(timesheet_on_reassign)) {
      return json(res, 400, {
        error: "This dispatch already has a timesheet — choose whether to move it to the new flagger or delete it.",
      });
    }
    const removeTimesheet = !!oldTs && (!!delete_timesheet || (workerChanged && timesheet_on_reassign === "delete"));

    // Validate new hours up front, before anything is written.
    let hoursUpdate = null;
    if (oldTs && !removeTimesheet && timesheet) {
      const start = new Date(timesheet.typed_start_time);
      const end = new Date(timesheet.typed_end_time);
      const brk = Number(timesheet.break_minutes ?? 0);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return json(res, 400, { error: "Timesheet start and end times must be valid dates." });
      }
      if (!Number.isInteger(brk) || brk < 0) {
        return json(res, 400, { error: "Break minutes must be a whole number, 0 or more." });
      }
      const hours = (end - start) / 3600000 - brk / 60;
      if (hours <= 0) return json(res, 400, { error: "Timesheet end time must be after the start time (after the break)." });
      if (hours > 24) return json(res, 400, { error: "That timesheet works out to more than 24 hours — check the dates." });

      const unchanged =
        start.getTime() === new Date(oldTs.typed_start_time).getTime() &&
        end.getTime() === new Date(oldTs.typed_end_time).getTime() &&
        brk === oldTs.break_minutes;
      if (!unchanged) {
        hoursUpdate = {
          typed_start_time: start.toISOString(),
          typed_end_time: end.toISOString(),
          break_minutes: brk,
        };
      }
    }

    const { data: dispatch, error } = await supabase
      .from("dispatches")
      .update({
        job_number: job_number || null,
        location,
        start_time,
        notes: notes || null,
        worker_id,
        title: title || null,
        customer_qbo_id: customer_qbo_id || null,
        qbo_customer_name: qbo_customer_name || null,
        qbo_item_id: qbo_item_id || null,
        qbo_item_name: qbo_item_name || null,
        rate: rate ?? null,
        qbo_ot_item_id: qbo_ot_item_id || null,
        qbo_ot_item_name: qbo_ot_item_name || null,
        ot_rate: ot_rate ?? null,
        qbo_dt_item_id: qbo_dt_item_id || null,
        qbo_dt_item_name: qbo_dt_item_name || null,
        dt_rate: dt_rate ?? null,
        client_company_id: client_company_id || null,
        client_company_name: client_company_name || null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });

    // ── Timesheet changes (after the dispatch itself has saved) ─────────────
    let hoursNow = null;        // new calculated hours, if they were edited
    let timesheetChanged = false;
    let qboSynced = [];
    if (oldTs) {
      qboSynced = await syncedTargets(supabase, oldTs.id);
      try {
        if (removeTimesheet) {
          // Keep the record of anything already sent to QuickBooks (just
          // detach it from the deleted timesheet); drop failed/pending attempts.
          await supabase.from("qbo_sync_log").delete().eq("timesheet_id", oldTs.id).neq("status", "success");
          await supabase.from("qbo_sync_log").update({ timesheet_id: null }).eq("timesheet_id", oldTs.id);
          const { error: delError } = await supabase.from("timesheets").delete().eq("id", oldTs.id);
          if (delError) throw delError;
          timesheetChanged = true;
        } else {
          const update = { ...(hoursUpdate || {}) };
          if (workerChanged) update.worker_id = worker_id; // timesheet follows the dispatch
          if (Object.keys(update).length > 0) {
            const { data: updatedTs, error: tsError } = await supabase
              .from("timesheets")
              .update(update)
              .eq("id", oldTs.id)
              .select("calculated_hours")
              .single();
            if (tsError) throw tsError;
            if (hoursUpdate) hoursNow = updatedTs.calculated_hours;
            timesheetChanged = true;
          }
        }
      } catch (err) {
        return json(res, 500, {
          error: `The dispatch was saved, but the timesheet change failed: ${err.message}`,
        });
      }
    }

    // ── Notifications (only when the admin chose "Save & Notify") ───────────
    if (notify) {
      const summary = shiftSummary({ job_number, location, start_time });

      if (workerChanged) {
        // The flagger who was taken off, and the one who was added.
        await notifyWorker(supabase, existing.worker_id, {
          title: "Dispatch removed",
          body: `You're no longer on: ${shiftSummary(existing)}`,
        });
        await notifyWorker(supabase, worker_id, { title: "New dispatch", body: summary });
      } else {
        const extras = [];
        if (removeTimesheet) extras.push("Timesheet removed — please resubmit");
        else if (hoursNow !== null) extras.push(`Timesheet hours updated to ${hoursNow}h`);
        await notifyWorker(supabase, worker_id, {
          title: "Dispatch updated",
          body: [...extras, summary].join(" — "),
        });
      }
    }

    return json(res, 200, { dispatch, timesheetChanged, qboSynced: timesheetChanged ? qboSynced : [] });
  }

  if (action === "delete" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: "id is required" });

    const supabase = getSupabaseAdmin();

    const { data: timesheet } = await supabase
      .from("timesheets")
      .select("id")
      .eq("dispatch_id", id)
      .maybeSingle();

    // Clean up rows that reference this dispatch but aren't covered by an
    // on-delete-cascade FK, so the dispatch delete below doesn't get
    // blocked by a foreign key violation.
    if (timesheet) {
      await supabase.from("qbo_sync_log").delete().eq("timesheet_id", timesheet.id);
      await supabase.from("timesheets").delete().eq("id", timesheet.id);
    }
    await supabase.from("reminder_log").delete().eq("dispatch_id", id);

    const { error } = await supabase.from("dispatches").delete().eq("id", id);
    if (error) return json(res, 500, { error: error.message });

    return json(res, 200, { deleted: true });
  }

  if (action === "remind" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: "id is required" });

    const supabase = getSupabaseAdmin();
    const { data: dispatch, error } = await supabase
      .from("dispatches")
      .select("id, job_number, location, start_time, worker_id, timesheets(status)")
      .eq("id", id)
      .single();
    if (error || !dispatch) return json(res, 404, { error: "Dispatch not found" });

    const isRejected = dispatch.timesheets?.status === "rejected";
    if (dispatch.timesheets && !isRejected) {
      return json(res, 400, { error: "This dispatch already has a submitted timesheet." });
    }

    const summary = shiftSummary(dispatch);
    const result = await sendPushToWorker(dispatch.worker_id, {
      title: isRejected ? "Timesheet needs resubmission" : "Timesheet reminder",
      body: isRejected
        ? `Rejected, please resubmit — ${summary}`
        : `Missing timesheet — ${summary}`,
      url: "/",
    });

    return json(res, 200, { sent: result.sent > 0 });
  }

  if (action === "list" && req.method === "GET") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("dispatches")
      .select(
        "*, worker:profiles!dispatches_worker_id_fkey(id, full_name, worker_type), timesheets(id, status, calculated_hours, slip_photo_path, typed_start_time, typed_end_time, break_minutes)"
      )
      .order("start_time", { ascending: false });

    const isAdminScopedView = profile.role === "admin" && !!(req.query?.worker_id || req.query?.client_company_id);
    if (profile.role !== "admin") {
      query = query.eq("worker_id", profile.id);
    } else if (req.query?.worker_id) {
      query = query.eq("worker_id", req.query.worker_id);
    } else if (req.query?.client_company_id) {
      query = query.eq("client_company_id", req.query.client_company_id);
    }

    const { data, error } = await query;
    if (error) return json(res, 500, { error: error.message });

    // Sign photo URLs for the admin's single-worker/single-contractor schedule
    // view (the PDF preview needs them) and for any pending timesheet on the
    // general dashboard list (so admins can review + approve right there) --
    // not for every past dispatch, to avoid an unbounded batch of signed-URL
    // calls on every load.
    if (profile.role === "admin") {
      await Promise.all(
        data.map(async (d) => {
          const path = d.timesheets?.slip_photo_path;
          if (!path) return;
          if (!isAdminScopedView && d.timesheets.status !== "pending") return;
          const { data: signed } = await supabase.storage.from("timesheet-photos").createSignedUrl(path, 60 * 15);
          d.timesheets.slip_photo_url = signed?.signedUrl || null;
        })
      );
    }

    // A worker viewing their own dispatches can't see other workers' rows,
    // so a shift dispatched to a crew looks like it's theirs alone. Look up
    // who else shares each dispatch's group_id (same "New Dispatch"
    // submission) and attach their names.
    if (profile.role !== "admin" && data.length > 0) {
      const groupIds = [...new Set(data.map((d) => d.group_id))];
      const { data: crewRows } = await supabase
        .from("dispatches")
        .select("group_id, worker:profiles!dispatches_worker_id_fkey(id, full_name)")
        .in("group_id", groupIds)
        .neq("worker_id", profile.id);
      const byGroup = new Map();
      for (const row of crewRows || []) {
        if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, []);
        byGroup.get(row.group_id).push(row.worker);
      }
      for (const d of data) {
        d.colleagues = byGroup.get(d.group_id) || [];
      }
    }

    return json(res, 200, { dispatches: data });
  }

  return json(res, 404, { error: "Unknown action" });
}
