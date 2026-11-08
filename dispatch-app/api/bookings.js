import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile, requireRole } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";
import { sendPushToWorker } from "./_lib/push.js";

const TZ = "America/Vancouver";
const HOUR_MS = 60 * 60 * 1000;

// YYYY-MM-DD of an instant as seen on the wall clock in Pacific time.
function pacificDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function pacificTime(date) {
  return date.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

// "cron" (Vercel's daily run), "admin" (a manual test from the Bookings page),
// or null. Only the cron run also notifies flaggers, so testing the button
// can't ping crews or send them the same reminder twice.
async function remindCaller(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && (req.headers.authorization || "") === `Bearer ${cronSecret}`) return "cron";
  const profile = await getSessionProfile(req);
  return profile?.role === "admin" ? "admin" : null;
}

// Shown if the 0014 migration (worker_ids / notify_flaggers columns) hasn't been run yet.
function isMissingColumn(error) {
  return /worker_ids|notify_flaggers/.test(error?.message || "") && /column|schema cache/i.test(error?.message || "");
}
const MIGRATION_MESSAGE =
  "Selecting flaggers needs a one-time database update (supabase/migrations/0014_booking_flaggers.sql). Run it in the Supabase SQL editor, then try again.";


const SOURCES = ["website", "email", "text", "phone", "other"];

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query?.action;

  // Daily day-before reminder. Called by Vercel Cron (CRON_SECRET) or by an
  // admin from the Bookings page to test it.
  if (action === "remind" && (req.method === "GET" || req.method === "POST")) {
    const caller = await remindCaller(req);
    if (!caller) return json(res, 401, { error: "Not authorized" });
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const tomorrow = pacificDate(new Date(now.getTime() + 24 * HOUR_MS));

    // Window is wider than a day so DST shifts can't clip anything; the exact
    // "is this tomorrow in Pacific time" check happens below.
    const { data: candidates, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("status", "booked")
      .gte("start_time", new Date(now.getTime() - 12 * HOUR_MS).toISOString())
      .lte("start_time", new Date(now.getTime() + 60 * HOUR_MS).toISOString())
      .order("start_time", { ascending: true });
    if (error) return json(res, 500, { error: error.message });

    const bookings = candidates.filter((b) => pacificDate(new Date(b.start_time)) === tomorrow);
    if (bookings.length === 0) return json(res, 200, { bookings: 0, notified: 0 });

    const first = bookings[0];
    const who = first.client_company_name || first.location;
    const body =
      bookings.length === 1
        ? `${who} at ${pacificTime(new Date(first.start_time))} — ${first.location}. Tap to dispatch.`
        : `${bookings.length} bookings, first: ${who} at ${pacificTime(new Date(first.start_time))}. Tap to dispatch.`;

    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
    let notified = 0;
    for (const a of admins || []) {
      try {
        const result = await sendPushToWorker(a.id, {
          title: bookings.length === 1 ? "Booking tomorrow" : "Bookings tomorrow",
          body,
          url: "/bookings",
        });
        if (result.sent > 0) notified++;
      } catch (err) {
        console.error("[booking-reminders] push failed:", err.message);
      }
    }

    // Flaggers the admin chose to notify get their own day-before reminder --
    // only from the daily cron run, and only for bookings where the admin
    // switched "notify flaggers" on. Deactivated flaggers are skipped. Only
    // the time, place and contractor are sent; the private notes never are.
    let flaggersNotified = 0;
    if (caller === "cron") {
      const byWorker = new Map();
      for (const b of bookings) {
        if (!b.notify_flaggers) continue;
        for (const wid of b.worker_ids || []) {
          if (!byWorker.has(wid)) byWorker.set(wid, []);
          byWorker.get(wid).push(b);
        }
      }
      if (byWorker.size > 0) {
        const { data: active } = await supabase
          .from("profiles")
          .select("id")
          .in("id", [...byWorker.keys()])
          .eq("role", "worker")
          .neq("active", false);
        const activeIds = new Set((active || []).map((p) => p.id));
        for (const [wid, list] of byWorker) {
          if (!activeIds.has(wid)) continue;
          const f = list[0];
          const where = f.client_company_name ? `${f.location} (${f.client_company_name})` : f.location;
          const body =
            list.length === 1
              ? `${pacificTime(new Date(f.start_time))} — ${where}`
              : `${list.length} shifts tomorrow, first at ${pacificTime(new Date(f.start_time))} — ${where}`;
          try {
            const result = await sendPushToWorker(wid, {
              title: list.length === 1 ? "Shift tomorrow" : "Shifts tomorrow",
              body,
              url: "/",
            });
            if (result.sent > 0) flaggersNotified++;
          } catch (err) {
            console.error("[booking-reminders] flagger push failed:", err.message);
          }
        }
      }
    }

    return json(res, 200, { bookings: bookings.length, notified, flaggersNotified });
  }

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

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
    const { id, client_company_id, client_company_name, start_time, location, flaggers_needed, source, notes, worker_ids, notify_flaggers } = req.body || {};
    if (!start_time || !location) return json(res, 400, { error: "start_time and location are required" });
    if (Number.isNaN(new Date(start_time).getTime())) return json(res, 400, { error: "start_time is not a valid date and time" });
    if (source && !SOURCES.includes(source)) return json(res, 400, { error: "Invalid source" });

    // Flaggers picked for this booking (optional). Each must be a real flagger.
    const pickedIds = Array.isArray(worker_ids) ? [...new Set(worker_ids)] : [];
    if (pickedIds.length > 0) {
      const { data: found, error: findError } = await supabase
        .from("profiles")
        .select("id")
        .in("id", pickedIds)
        .eq("role", "worker");
      if (findError) return json(res, 500, { error: findError.message });
      if ((found || []).length !== pickedIds.length) return json(res, 400, { error: "One of the selected flaggers wasn't found" });
    }

    const row = {
      client_company_id: client_company_id || null,
      client_company_name: client_company_name || null,
      start_time,
      location,
      flaggers_needed: flaggers_needed || null,
      source: source || "other",
      notes: notes || null,
    };

    // Notifying flaggers only makes sense when some are selected.
    const flaggerFields = { worker_ids: pickedIds, notify_flaggers: pickedIds.length > 0 && notify_flaggers === true };

    if (action === "create") {
      // The new columns are only written when used, so bookings without
      // flaggers keep saving even before the 0014 migration has been run.
      const insertRow = pickedIds.length > 0 ? { ...row, ...flaggerFields } : row;
      const { data, error } = await supabase.from("bookings").insert(insertRow).select().single();
      if (error) return json(res, 500, { error: isMissingColumn(error) ? MIGRATION_MESSAGE : error.message });
      return json(res, 201, { booking: data });
    }

    if (!id) return json(res, 400, { error: "id is required" });
    const { data: existing } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
    if (!existing) return json(res, 404, { error: "Booking not found" });
    // Write the flagger columns if the table has them (so they can be cleared)
    // or if flaggers are being added.
    const hasFlaggerColumns = "worker_ids" in existing;
    const updateRow = hasFlaggerColumns || pickedIds.length > 0 ? { ...row, ...flaggerFields } : row;
    const { data, error } = await supabase.from("bookings").update(updateRow).eq("id", id).select().single();
    if (error) return json(res, 500, { error: isMissingColumn(error) ? MIGRATION_MESSAGE : error.message });
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
