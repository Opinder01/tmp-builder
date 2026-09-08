import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = new Set([
  "https://tmpbuilder.ca", "https://www.tmpbuilder.ca",
  "http://localhost:3000", "http://localhost:5173", "http://localhost:4173",
]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  // ── Session authentication ─────────────────────────────────────────────────
  const authHeader = req.headers?.authorization || "";
  const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!sessionToken) return json(res, 401, { error: "Authentication required." });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: "Server configuration error." });

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: session } = await supabase
    .from("user_sessions").select("email")
    .eq("session_token", sessionToken).maybeSingle();
  if (!session) return json(res, 401, { error: "Invalid or expired session." });

  // Use the session's email as the authoritative identity — ignore body email
  const normalizedEmail = session.email;

  const { plan } = req.body || {};
  if (!plan || !["monthly", "yearly"].includes(plan)) {
    return json(res, 400, { error: 'Invalid plan. Must be "monthly" or "yearly".' });
  }

  const secretKey   = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json(res, 500, { error: "Payment service not configured." });

  const priceId =
    plan === "monthly"
      ? process.env.STRIPE_PRICE_MONTHLY
      : process.env.STRIPE_PRICE_YEARLY;

  if (!priceId) {
    return json(res, 500, { error: "Plan pricing not configured." });
  }

  const appUrl = (process.env.APP_URL || "https://tmpbuilder.ca").replace(/\/$/, "");
  const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

  // ── Find or create a valid Stripe Customer ──────────────────────────────────
  let customerId = null;

  async function isValidCustomer(id) {
    if (!id) return false;
    try {
      const c = await stripe.customers.retrieve(id);
      return !c.deleted;
    } catch {
      return false;
    }
  }

  try {
    // 1. Check Supabase for a saved customer ID
    const { data: subData } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (subData?.stripe_customer_id) {
      if (await isValidCustomer(subData.stripe_customer_id)) {
        customerId = subData.stripe_customer_id;
        console.log("[checkout] found valid customer in Supabase:", customerId);
      } else {
        console.log("[checkout] stale customer ID — will create new one:", subData.stripe_customer_id);
        await supabase
          .from("subscriptions")
          .update({ stripe_customer_id: null, stripe_subscription_id: null })
          .eq("email", normalizedEmail);
      }
    }

    // 2. List Stripe customers by email if no valid customer found yet
    if (!customerId) {
      const existing = await stripe.customers.list({ email: normalizedEmail, limit: 5 });
      const valid = existing.data.find(c => !c.deleted);
      if (valid) {
        customerId = valid.id;
        console.log("[checkout] found customer in Stripe list:", customerId);
      }
    }

    // 3. Create a brand-new Stripe customer if still none found
    if (!customerId) {
      const customer = await stripe.customers.create({ email: normalizedEmail });
      customerId = customer.id;
      console.log("[checkout] created new Stripe customer:", customerId);
    }

    // 4. Persist the valid customer ID to Supabase
    if (customerId) {
      await supabase
        .from("subscriptions")
        .upsert(
          { email: normalizedEmail, stripe_customer_id: customerId },
          { onConflict: "email" }
        );
    }
  } catch (err) {
    console.error("[checkout] customer setup error:", err.message);
    // Non-fatal — fall back to customer_email
  }

  // ── Check if customer already used their free trial ─────────────────────────
  let hadTrial = false;
  if (customerId) {
    try {
      const allSubs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
      hadTrial = allSubs.data.length > 0;
      console.log("[checkout] hadTrial:", hadTrial, "for customer:", customerId);
    } catch (err) {
      console.warn("[checkout] could not check trial history:", err.message);
    }
  }

  // ── Create the Checkout Session ─────────────────────────────────────────────
  try {
    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: hadTrial ? {} : { trial_period_days: 7 },
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/subscribe`,
    };

    if (customerId) {
      sessionParams.customer = customerId;
    } else {
      sessionParams.customer_email = normalizedEmail;
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);
    console.log("[checkout] ✅ session created:", checkoutSession.id);
    return json(res, 200, { url: checkoutSession.url });
  } catch (err) {
    console.error("[checkout] Stripe error:", err.message);
    return json(res, 500, { error: "Failed to create checkout session." });
  }
}
