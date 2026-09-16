import { getSupabaseAdmin } from "../_lib/supabase.js";
import { getSessionProfile } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { sendPushToWorker } from "../_lib/push.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_INTERVAL_DAYS = 14;

// Vercel Cron's day-of-month syntax (`*/14 * *`) resets at month boundaries
// and can't reliably produce an exact 14-day cadence, so this runs daily
// (see vercel.json) and decides internally whether today is a reminder day,
// counting from a fixed anchor date.
function isReminderDay(anchorDateStr) {
  const anchor = anchorDateStr ? new Date(anchorDateStr) : new Date("2026-01-05T00:00:00Z");
  const daysSinceAnchor = Math.floor((Date.now() - anchor.getTime()) / DAY_MS);
  return daysSinceAnchor >= 0 && daysSinceAnchor % REMINDER_INTERVAL_DAYS === 0;
}

async function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization || "";
    if (authHeader === `Bearer ${cronSecret}`) return true;
  }
  // Also allow an authenticated admin to trigger this manually ("send reminders now").
  const profile = await getSessionProfile(req);
  return profile?.role === "admin";
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  if (!(await isAuthorized(req))) {
    return json(res, 401, { error: "Not authorized" });
  }

  const force = req.query?.force === "true"; // admin "send reminders now" bypasses the cadence check
  if (!force && !isReminderDay(process.env.REMINDER_ANCHOR_DATE)) {
    return json(res, 200, { skipped: true, reason: "not a reminder day" });
  }

  const supabase = getSupabaseAdmin();

  const { data: dispatches, error } = await supabase
    .from("dispatches")
    .select("id, job_number, worker_id, start_time, timesheets(id)")
    .lt("start_time", new Date().toISOString());
  if (error) return json(res, 500, { error: error.message });

  const { data: alreadyReminded, error: reminderError } = await supabase
    .from("reminder_log")
    .select("dispatch_id");
  if (reminderError) return json(res, 500, { error: reminderError.message });
  const remindedIds = new Set((alreadyReminded || []).map((r) => r.dispatch_id));

  // dispatches -> timesheets is 1:1, so PostgREST embeds a single object (or null), not an array.
  const missing = dispatches.filter((d) => !d.timesheets && !remindedIds.has(d.id));

  const byWorker = new Map();
  for (const d of missing) {
    if (!byWorker.has(d.worker_id)) byWorker.set(d.worker_id, []);
    byWorker.get(d.worker_id).push(d);
  }

  let notified = 0;
  for (const [workerId, workerDispatches] of byWorker) {
    const count = workerDispatches.length;
    await sendPushToWorker(workerId, {
      title: "Timesheet reminder",
      body:
        count === 1
          ? `You have 1 shift (Job ${workerDispatches[0].job_number}) missing a timesheet.`
          : `You have ${count} shifts missing timesheets.`,
      url: "/",
      badgeCount: count,
    });
    notified++;

    await supabase.from("reminder_log").insert(
      workerDispatches.map((d) => ({ dispatch_id: d.id, worker_id: workerId }))
    );
  }

  return json(res, 200, { workersNotified: notified, dispatchesFlagged: missing.length });
}
