import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const { plan, email } = req.body || {};

  if (!plan || !["monthly", "yearly"].includes(plan)) {
    return json(res, 400, { error: 'Invalid plan. Must be "monthly" or "yearly".' });
  }
  if (!email || !email.includes("@")) {
    return json(res, 400, { error: "email is required." });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const secretKey   = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    return json(res, 500, { error: "Stripe secret key not configured." });
  }

  const priceId =
    plan === "monthly"
      ? process.env.STRIPE_PRICE_MONTHLY
      : process.env.STRIPE_PRICE_YEARLY;

  if (!priceId) {
    return json(res, 500, { error: `Price ID for plan "${plan}" not configured.` });
  }

  const appUrl = (process.env.APP_URL || "https://tmpbuilder.ca").replace(/\/$/, "");
  const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

  // ── Find or create a Stripe Customer tied to this account email ─────────────
  // Passing `customer` (a Customer ID) to stripe.checkout.sessions.create()
  // locks the email field as read-only in the Stripe Checkout page, so users
  // cannot change it to a different address. This guarantees the webhook always
  // saves the exact email the user signed up with.
  let customerId = null;

  try {
    // 1. Check Supabase first (fastest path)
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (data?.stripe_customer_id) {
        customerId = data.stripe_customer_id;
        console.log("[checkout] found customer in Supabase:", customerId);
      }
    }

    // 2. Search Stripe by email if not already known
    if (!customerId) {
      const existing = await stripe.customers.search({
        query: `email:"${normalizedEmail}"`,
        limit: 1,
      });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
        console.log("[checkout] found customer in Stripe:", customerId);
      }
    }

    // 3. Create a brand-new Stripe customer if none exists
    if (!customerId) {
      const customer = await stripe.customers.create({ email: normalizedEmail });
      customerId = customer.id;
      console.log("[checkout] created new Stripe customer:", customerId);
    }

    // 4. Persist the customer ID to Supabase for future fast lookups
    if (supabaseUrl && serviceKey && customerId) {
      const supabase = createClient(supabaseUrl, serviceKey);
      await supabase
        .from("subscriptions")
        .upsert(
          { email: normalizedEmail, stripe_customer_id: customerId },
          { onConflict: "email" }
        );
    }
  } catch (err) {
    console.error("[checkout] customer setup error:", err.message);
    // Non-fatal: fall back to customer_email (pre-filled but editable)
  }

  // ── Create the Checkout Session ─────────────────────────────────────────────
  try {
    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/subscribe`,
    };

    if (customerId) {
      // Email is read-only when a Customer ID is provided
      sessionParams.customer = customerId;
    } else {
      // Fallback: pre-fill but still editable
      sessionParams.customer_email = normalizedEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log("[checkout] ✅ session created:", session.id);
    return json(res, 200, { url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe error:", err.message);
    return json(res, 500, { error: err.message || "Failed to create checkout session." });
  }
}
