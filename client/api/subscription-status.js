import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * GET /api/subscription-status?email=user@example.com
 *
 * Returns the subscription record from Supabase for the given email.
 * Used by ProtectedRoute to verify access on every protected page load.
 * Uses the SERVICE_ROLE_KEY so it bypasses Supabase RLS — server-side only.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const email = req.query?.email?.toLowerCase?.();
  if (!email) return json(res, 400, { error: "email query parameter is required" });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(res, 500, { error: "Supabase not configured on server." });

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("subscriptions")
    .select("email, plan, status, trial_ends_at, stripe_customer_id, stripe_subscription_id")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[subscription-status] Supabase error:", error.message);
    return json(res, 500, { error: "Database error." });
  }

  if (!data) {
    // No record found — user has never subscribed
    return json(res, 200, { status: "not_found" });
  }

  return json(res, 200, {
    status:                data.status,                 // "trial" | "active" | "inactive"
    plan:                  data.plan,                   // "monthly" | "yearly"
    trialEndsAt:           data.trial_ends_at,          // ISO string or null
    stripeCustomerId:      data.stripe_customer_id,
    stripeSubscriptionId:  data.stripe_subscription_id,
  });
}
