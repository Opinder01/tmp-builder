import webpush from "web-push";
import { getSupabaseAdmin } from "./supabase.js";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set");
  }
  webpush.setVapidDetails("mailto:info@crowntraffic.ca", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

// Sends a push notification to every subscription on file for a worker.
// Silently drops subscriptions that are gone (410/404 — browser unsubscribed,
// device reset, etc.) so the table doesn't accumulate dead rows forever.
export async function sendPushToWorker(workerId, payload) {
  ensureConfigured();
  const supabase = getSupabaseAdmin();

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("worker_id", workerId);
  if (error || !subs?.length) return { sent: 0 };

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("[push] send failed:", err.message);
        }
      }
    })
  );

  return { sent };
}
