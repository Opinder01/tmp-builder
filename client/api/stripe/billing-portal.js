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

/**
 * POST /api/stripe/billing-portal
 * Requires: Authorization: Bearer <sessionToken>
 *
 * 1. Validates session token — only the logged-in user can access their own portal.
 * 2. Looks up stripe_customer_id from Supabase subscriptions table.
 * 3. Falls back to Stripe customers.list() (avoids query-injection risk of search()).
 * 4. Creates a Stripe Billing Portal session and returns the URL.
 */
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

  const normalizedEmail = session.email;
  console.log("[billing-portal] request for email:", normalizedEmail);

  // ── Stripe init ─────────────────────────────────────────────────────────────
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json(res, 500, { error: "Payment service not configured." });
  const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

  // ── Step 1: look up stripe_customer_id in Supabase ──────────────────────────
  let customerId = null;

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
  }

  // ── Step 2: fallback — list Stripe customers by email ──────────────────────
  // Use customers.list() instead of customers.search() to avoid query-injection risk.
  if (!customerId) {
    console.log("[billing-portal] searching Stripe for customer with email:", normalizedEmail);
    try {
      const customers = await stripe.customers.list({ email: normalizedEmail, limit: 5 });
      const valid = customers.data.find(c => !c.deleted);
      if (valid) {
        customerId = valid.id;
        console.log("[billing-portal] found customer in Stripe list:", customerId);

        // Backfill Supabase so future lookups are fast
        await supabase
          .from("subscriptions")
          .upsert(
            { email: normalizedEmail, stripe_customer_id: customerId },
            { onConflict: "email" }
          );
      } else {
        console.warn("[billing-portal] no Stripe customer found for email:", normalizedEmail);
      }
    } catch (stripeErr) {
      console.error("[billing-portal] Stripe list error:", stripeErr.message);
    }
  }

  if (!customerId) {
    return json(res, 404, {
      error: "No subscription found for this account. Please contact support.",
    });
  }

  // ── Step 3: create billing portal session ────────────────────────────────────
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: process.env.APP_URL
        ? `${process.env.APP_URL}/dashboard`
        : "https://tmpbuilder.ca/dashboard",
    });

    console.log("[billing-portal] ✅ portal session created:", portalSession.url.slice(0, 60));
    return json(res, 200, { url: portalSession.url });
  } catch (err) {
    console.error("[billing-portal] Stripe portal error:", err.message);
    return json(res, 500, { error: "Failed to create billing portal session." });
  }
}
