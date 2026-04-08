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
 * 1. Looks up stripe_customer_id from Supabase subscriptions table.
 * 2. If not found there, searches Stripe directly by email (fallback for
 *    accounts where the webhook didn't save the customer ID).
 * 3. Creates a Stripe Billing Portal session and returns the URL.
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

  const normalizedEmail = email.toLowerCase().trim();
  console.log("[billing-portal] request for email:", normalizedEmail);

  // --- Stripe init ---
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json(res, 500, { error: "Stripe not configured." });
  const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

  // --- Step 1: try Supabase for stripe_customer_id ---
  let customerId = null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) {
      console.error("[billing-portal] Supabase error:", error.message);
    } else if (data?.stripe_customer_id) {
      customerId = data.stripe_customer_id;
      console.log("[billing-portal] found customer ID in Supabase:", customerId);
    } else {
      console.warn("[billing-portal] no stripe_customer_id in Supabase for:", normalizedEmail);
    }
  } else {
    console.error("[billing-portal] Missing Supabase env vars — skipping DB lookup");
  }

  // --- Step 2: fallback — search Stripe by email ---
  if (!customerId) {
    console.log("[billing-portal] searching Stripe for customer with email:", normalizedEmail);
    try {
      const customers = await stripe.customers.search({
        query: `email:"${normalizedEmail}"`,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log("[billing-portal] found customer in Stripe search:", customerId);

        // Backfill Supabase so future lookups are fast
        if (supabaseUrl && serviceKey) {
          const supabase = createClient(supabaseUrl, serviceKey);
          const { error: upsertErr } = await supabase
            .from("subscriptions")
            .upsert(
              { email: normalizedEmail, stripe_customer_id: customerId },
              { onConflict: "email" }
            );
          if (upsertErr) {
            console.warn("[billing-portal] backfill upsert failed:", upsertErr.message);
          } else {
            console.log("[billing-portal] backfilled stripe_customer_id in Supabase");
          }
        }
      } else {
        console.warn("[billing-portal] no Stripe customer found for email:", normalizedEmail);
      }
    } catch (stripeSearchErr) {
      console.error("[billing-portal] Stripe search error:", stripeSearchErr.message);
    }
  }

  if (!customerId) {
    return json(res, 404, {
      error: "No subscription found for this account. Please contact support.",
    });
  }

  // --- Step 3: create billing portal session ---
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: process.env.APP_URL
        ? `${process.env.APP_URL}/dashboard`
        : "https://tmpbuilder.ca/dashboard",
    });

    console.log("[billing-portal] ✅ portal session created:", session.url.slice(0, 60));
    return json(res, 200, { url: session.url });
  } catch (err) {
    console.error("[billing-portal] Stripe portal error:", err.message);
    return json(res, 500, { error: err.message });
  }
}
