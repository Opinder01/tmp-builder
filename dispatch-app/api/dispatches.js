import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile, requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";
import { sendPushToWorker } from "./_lib/push.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query?.action;

  if (action === "create" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const {
      job_number, location, start_time, notes, worker_id, worker_ids, attachments,
      customer_qbo_id, qbo_customer_name, qbo_item_id, qbo_item_name, rate,
      qbo_ot_item_id, qbo_ot_item_name, ot_rate,
      qbo_dt_item_id, qbo_dt_item_name, dt_rate,
      client_company_id, client_company_name,
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
    const baseRow = {
      job_number: job_number || null,
      location,
      start_time,
      notes: notes || null,
      created_by: admin.id,
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

    const { data: dispatches, error } = await supabase
      .from("dispatches")
      .insert(ids.map((id) => ({ ...baseRow, worker_id: id })))
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
            body: job_number ? `Job ${job_number} — ${location}` : location,
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
      .select("*, timesheets(id, status)")
      .eq("id", id)
      .single();
    if (error) return json(res, 404, { error: "Dispatch not found" });
    return json(res, 200, { dispatch });
  }

  if (action === "update" && req.method === "POST") {
    const admin = await requireRole(req, res, "admin");
    if (!admin) return;

    const {
      id, job_number, location, start_time, notes, worker_id, notify,
      customer_qbo_id, qbo_customer_name, qbo_item_id, qbo_item_name, rate,
      qbo_ot_item_id, qbo_ot_item_name, ot_rate,
      qbo_dt_item_id, qbo_dt_item_name, dt_rate,
      client_company_id, client_company_name,
    } = req.body || {};
    if (!id || !location || !start_time || !worker_id) {
      return json(res, 400, { error: "id, location, start_time, and worker_id are required" });
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("dispatches")
      .select("worker_id, timesheets(id)")
      .eq("id", id)
      .single();
    if (fetchError) return json(res, 404, { error: "Dispatch not found" });

    // Reassigning the worker after a timesheet already exists would leave
    // that timesheet pointing at the old worker while the dispatch points
    // at a new one -- an inconsistent, orphaned record. Everything else
    // (time, location, contractor, billing) stays freely editable.
    if (existing.timesheets && existing.worker_id !== worker_id) {
      return json(res, 400, {
        error: "Can't reassign the worker — a timesheet has already been submitted for this dispatch.",
      });
    }

    const { data: dispatch, error } = await supabase
      .from("dispatches")
      .update({
        job_number: job_number || null,
        location,
        start_time,
        notes: notes || null,
        worker_id,
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

    if (notify) {
      try {
        const { data: workerDispatches } = await supabase
          .from("dispatches")
          .select("id, timesheets(id)")
          .eq("worker_id", worker_id);
        const badgeCount = (workerDispatches || []).filter((wd) => !wd.timesheets).length;

        await sendPushToWorker(worker_id, {
          title: "Dispatch updated",
          body: job_number ? `Job ${job_number} — ${location}` : location,
          url: "/",
          badgeCount,
        });
      } catch (err) {
        console.error("[dispatches] push notify failed:", err.message);
      }
    }

    return json(res, 200, { dispatch });
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

  if (action === "list" && req.method === "GET") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("dispatches")
      .select(
        "*, worker:profiles!dispatches_worker_id_fkey(id, full_name, worker_type), timesheets(id, status, calculated_hours, slip_photo_path)"
      )
      .order("start_time", { ascending: false });

    const isAdminViewingOneWorker = profile.role === "admin" && !!req.query?.worker_id;
    if (profile.role !== "admin") {
      query = query.eq("worker_id", profile.id);
    } else if (req.query?.worker_id) {
      query = query.eq("worker_id", req.query.worker_id);
    }

    const { data, error } = await query;
    if (error) return json(res, 500, { error: error.message });

    // Only sign photo URLs for the admin's single-worker schedule view (the
    // Worker Schedule PDF/preview needs them) -- not the full dispatch list,
    // to avoid an unnecessary batch of signed-URL calls on every load.
    if (isAdminViewingOneWorker) {
      await Promise.all(
        data.map(async (d) => {
          const path = d.timesheets?.slip_photo_path;
          if (!path) return;
          const { data: signed } = await supabase.storage.from("timesheet-photos").createSignedUrl(path, 60 * 15);
          d.timesheets.slip_photo_url = signed?.signedUrl || null;
        })
      );
    }

    return json(res, 200, { dispatches: data });
  }

  return json(res, 404, { error: "Unknown action" });
}
