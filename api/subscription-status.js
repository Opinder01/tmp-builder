import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * GET /api/subscription-status?email=user@example.com
 *
 * Queries the `subscriptions` table for the given email.
 * Returns subscription info if found, or { subscribed: false } if not.
 * Uses SERVICE_ROLE_KEY to bypass Supabase RLS — server-side only.
 *
 * Table columns: id, email, stripe_customer_id, stripe_subscription_id, plan
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
  console.log("[subscription-status] request for email:", email || "(none)");

  if (!email) {
    return json(res, 400, { error: "email query parameter is required" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("[subscription-status] SUPABASE_URL         :", supabaseUrl  ? `set (${supabaseUrl.slice(0, 30)}...)` : "❌ NOT SET");
  console.log("[subscription-status] SUPABASE_SERVICE_KEY :", serviceKey   ? "set" : "❌ NOT SET");

  if (!supabaseUrl || !serviceKey) {
    console.error("[subscription-status] ❌ Missing Supabase env vars — check Vercel environment variables.");
    return json(res, 500, { error: "Server configuration error." });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Select ONLY columns that exist in the subscriptions table
  const { data, error } = await supabase
    .from("subscriptions")
    .select("email, stripe_customer_id, stripe_subscription_id, plan")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[subscription-status] ❌ Supabase query error:");
    console.error("  code   :", error.code);
    console.error("  message:", error.message);
    console.error("  details:", error.details);
    return json(res, 500, { error: "Database error." });
  }

  if (!data) {
    console.log("[subscription-status] no row found for email:", email);
    // Not an error — user simply hasn't subscribed yet
    return json(res, 200, { subscribed: false });
  }

  console.log("[subscription-status] ✅ row found:", JSON.stringify(data));

  return json(res, 200, {
    subscribed:           true,
    plan:                 data.plan,
    stripeCustomerId:     data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
  });
}
