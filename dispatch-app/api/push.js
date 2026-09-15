import { getSupabaseAdmin } from "./_lib/supabase.js";
import { getSessionProfile } from "./_lib/auth.js";
import { setCors, json } from "./_lib/cors.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const action = req.query?.action;

  if (action === "subscribe" && req.method === "POST") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const { endpoint, keys } = req.body?.subscription || req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return json(res, 400, { error: "A valid PushSubscription (endpoint + keys) is required" });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { worker_id: profile.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        { onConflict: "endpoint" }
      );
    if (error) return json(res, 500, { error: error.message });

    return json(res, 200, { subscribed: true });
  }

  if (action === "unsubscribe" && req.method === "POST") {
    const profile = await getSessionProfile(req);
    if (!profile) return json(res, 401, { error: "Not authenticated" });

    const { endpoint } = req.body || {};
    if (!endpoint) return json(res, 400, { error: "endpoint is required" });

    const supabase = getSupabaseAdmin();
    await supabase.from("push_subscriptions").delete().eq("worker_id", profile.id).eq("endpoint", endpoint);
    return json(res, 200, { unsubscribed: true });
  }

  return json(res, 404, { error: "Unknown action" });
}
