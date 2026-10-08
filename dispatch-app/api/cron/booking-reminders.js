import { getSupabaseAdmin } from "../_lib/supabase.js";
import { getSessionProfile } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { sendPushToWorker } from "../_lib/push.js";

const TZ = "America/Vancouver";
const HOUR_MS = 60 * 60 * 1000;

// YYYY-MM-DD of an instant as seen on the wall clock in Pacific time.
function pacificDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function pacificTime(date) {
  return date.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

async function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && (req.headers.authorization || "") === `Bearer ${cronSecret}`) return true;
  // Also lets an admin trigger it from the Bookings page to test the reminder.
  const profile = await getSessionProfile(req);
  return profile?.role === "admin";
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!(await isAuthorized(req))) return json(res, 401, { error: "Not authorized" });

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

  return json(res, 200, { bookings: bookings.length, notified });
}
