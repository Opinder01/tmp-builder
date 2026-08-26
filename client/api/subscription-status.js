import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const ALLOWED_ORIGINS = new Set([
  "https://tmpbuilder.ca", "https://www.tmpbuilder.ca",
  "http://localhost:3000", "http://localhost:5173", "http://localhost:4173",
]);

export default async function handler(req, res) {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const email = req.query?.email?.toLowerCase?.()?.trim();
  if (!email) return json(res, 400, { error: "email query parameter is required" });

  // ── Session token validation ───────────────────────────────────────────────
  const authHeader = req.headers?.authorization || "";
  const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey   = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !serviceKey)
    return json(res, 500, { error: "Server configuration error." });

  const supabase = createClient(supabaseUrl, serviceKey);

  // Validate session token — reject if missing or doesn't match the requested email
  if (!sessionToken) return json(res, 401, { error: "Authentication required." });

  const { data: session } = await supabase
    .from("user_sessions").select("email")
    .eq("session_token", sessionToken).maybeSingle();

  if (!session || session.email !== email)
    return json(res, 401, { error: "Invalid or expired session." });

  // ── Step 1: check Supabase ────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("subscriptions")
    .select("email, stripe_customer_id, stripe_subscription_id, plan")
    .eq("email", email).maybeSingle();

  if (error) return json(res, 500, { error: "Database error." });

  if (data?.stripe_subscription_id && stripeKey) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });
      const sub = await stripe.subscriptions.retrieve(data.stripe_subscription_id);
      if (sub.status === "active" || sub.status === "trialing") {
        return json(res, 200, {
          subscribed: true, hadTrial: true, plan: data.plan,
          stripeCustomerId: data.stripe_customer_id,
          stripeSubscriptionId: data.stripe_subscription_id,
        });
      }
      return json(res, 200, { subscribed: false, hadTrial: true });
    } catch {
      // Stripe unreachable — deny access (fail secure, not fail open)
      return json(res, 200, { subscribed: false, stripeUnavailable: true });
    }
  }

  // ── Step 2: fallback — search Stripe directly ─────────────────────────────
  if (!stripeKey) return json(res, 200, { subscribed: false });

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });

    // Use customers.list() — avoids query injection risk of customers.search()
    const customers = await stripe.customers.list({ email, limit: 5 });
    if (customers.data.length === 0) return json(res, 200, { subscribed: false });

    let activeSub = null;
    let customerId = null;

    for (const customer of customers.data) {
      if (customer.deleted) continue;
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
      const active = subs.data.find((s) => s.status === "active" || s.status === "trialing");
      if (active) { activeSub = active; customerId = customer.id; break; }
    }

    if (!activeSub) return json(res, 200, { subscribed: false });

    const priceId = activeSub.items?.data?.[0]?.price?.id;
    const plan = priceId === process.env.STRIPE_PRICE_YEARLY ? "yearly" : "monthly";

    // Backfill Supabase
    await supabase.from("subscriptions").upsert(
      { email, stripe_customer_id: customerId, stripe_subscription_id: activeSub.id, plan },
      { onConflict: "email" }
    );

    return json(res, 200, {
      subscribed: true, hadTrial: true, plan,
      stripeCustomerId: customerId, stripeSubscriptionId: activeSub.id,
    });
  } catch {
    return json(res, 200, { subscribed: false });
  }
}
