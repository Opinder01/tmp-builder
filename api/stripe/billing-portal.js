import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * POST /api/stripe/billing-portal
 * Body: { email }
 *
 * Looks up stripe_customer_id from the subscriptions table,
 * creates a Stripe Billing Portal session, and returns the URL.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const { email } = req.body || {};
  if (!email) return json(res, 400, { error: "email is required" });

  console.log("[billing-portal] request for email:", email);

  // --- Supabase: look up stripe_customer_id ---
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[billing-portal] ❌ Missing Supabase env vars");
    return json(res, 500, { error: "Server configuration error." });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("[billing-portal] Supabase error:", error.message);
    return json(res, 500, { error: "Database error." });
  }

  if (!data?.stripe_customer_id) {
    console.warn("[billing-portal] no stripe_customer_id for email:", email);
    return json(res, 404, { error: "No subscription found for this account." });
  }

  console.log("[billing-portal] found customer:", data.stripe_customer_id);

  // --- Stripe: create billing portal session ---
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json(res, 500, { error: "Stripe not configured." });

  const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   data.stripe_customer_id,
      return_url: process.env.APP_URL
        ? `${process.env.APP_URL}/dashboard`
        : "https://tmpbuilder.ca/dashboard",
    });

    console.log("[billing-portal] ✅ portal session created:", session.url.slice(0, 60));
    return json(res, 200, { url: session.url });
  } catch (err) {
    console.error("[billing-portal] Stripe error:", err.message);
    return json(res, 500, { error: err.message });
  }
}
