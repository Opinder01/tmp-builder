import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * GET /api/subscription-status?email=user@example.com
 *
 * 1. Checks the Supabase `subscriptions` table first (fast path).
 *    — A row with NO stripe_subscription_id means customer was created but
 *      never completed checkout → NOT subscribed.
 *    — A row WITH stripe_subscription_id is verified live with Stripe to
 *      confirm the subscription is still active/trialing.
 * 2. If no row (or row has no subscription), searches Stripe directly by email
 *    for an active/trialing subscription (fallback for missed webhooks).
 * 3. On a Stripe hit, backfills Supabase so future checks are fast.
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

  const email = req.query?.email?.toLowerCase?.()?.trim();
  console.log("[subscription-status] request for email:", email || "(none)");

  if (!email) {
    return json(res, 400, { error: "email query parameter is required" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey   = process.env.STRIPE_SECRET_KEY;

  console.log("[subscription-status] SUPABASE_URL:", supabaseUrl ? "set" : "❌ NOT SET");
  console.log("[subscription-status] SERVICE_KEY :", serviceKey  ? "set" : "❌ NOT SET");
  console.log("[subscription-status] STRIPE_KEY  :", stripeKey   ? "set" : "❌ NOT SET");

  if (!supabaseUrl || !serviceKey) {
    console.error("[subscription-status] ❌ Missing Supabase env vars");
    return json(res, 500, { error: "Server configuration error." });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Step 1: check Supabase ────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("subscriptions")
    .select("email, stripe_customer_id, stripe_subscription_id, plan")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[subscription-status] ❌ Supabase error:", error.message);
    return json(res, 500, { error: "Database error." });
  }

  // A row exists AND has a real subscription ID — verify it's still active with Stripe
  if (data?.stripe_subscription_id && stripeKey) {
    console.log("[subscription-status] Supabase row found with subscription:", data.stripe_subscription_id, "— verifying with Stripe…");
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });
      const sub = await stripe.subscriptions.retrieve(data.stripe_subscription_id);

      if (sub.status === "active" || sub.status === "trialing") {
        console.log("[subscription-status] ✅ Stripe subscription is", sub.status);
        return json(res, 200, {
          subscribed:           true,
          hadTrial:             true,
          plan:                 data.plan,
          stripeCustomerId:     data.stripe_customer_id,
          stripeSubscriptionId: data.stripe_subscription_id,
        });
      } else {
        // Subscription exists but is cancelled — not subscribed, but HAS used trial
        console.log("[subscription-status] ⚠️ Stripe subscription status:", sub.status, "— not active, had trial");
        return json(res, 200, { subscribed: false, hadTrial: true });
      }
    } catch (err) {
      // Stripe unreachable — fall back to trusting the Supabase row
      console.warn("[subscription-status] Stripe verify failed:", err.message, "— trusting Supabase row");
      return json(res, 200, {
        subscribed:           true,
        hadTrial:             true,
        plan:                 data.plan,
        stripeCustomerId:     data.stripe_customer_id,
        stripeSubscriptionId: data.stripe_subscription_id,
      });
    }
  }

  // Row exists but NO stripe_subscription_id = customer created, never completed checkout
  if (data && !data.stripe_subscription_id) {
    console.log("[subscription-status] Supabase row found but no subscription ID — user never completed checkout");
    // Fall through to Stripe direct search below (in case webhook was missed)
  }

  if (!data) {
    console.log("[subscription-status] no Supabase row — checking Stripe for:", email);
  }

  // ── Step 2: fallback — search Stripe directly ─────────────────────────────
  if (!stripeKey) {
    console.warn("[subscription-status] STRIPE_SECRET_KEY not set — cannot check Stripe");
    return json(res, 200, { subscribed: false });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });

    const customers = await stripe.customers.search({
      query: `email:"${email}"`,
      limit: 5,
    });

    if (customers.data.length === 0) {
      console.log("[subscription-status] no Stripe customer for:", email);
      return json(res, 200, { subscribed: false });
    }

    // Check each customer's subscriptions for an active/trialing one
    let activeSub  = null;
    let customerId = null;

    for (const customer of customers.data) {
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        status:   "all",
        limit:    10,
      });

      const active = subs.data.find(
        (s) => s.status === "active" || s.status === "trialing"
      );

      if (active) {
        activeSub  = active;
        customerId = customer.id;
        break;
      }
    }

    if (!activeSub) {
      console.log("[subscription-status] Stripe customer exists but no active subscription for:", email);
      return json(res, 200, { subscribed: false });
    }

    const priceItem = activeSub.items?.data?.[0]?.price;
    const plan =
      priceItem?.nickname?.toLowerCase?.().includes("year") ? "yearly" :
      priceItem?.recurring?.interval === "year"             ? "yearly" : "monthly";

    console.log("[subscription-status] ✅ found active Stripe subscription:", activeSub.id, "plan:", plan);

    // Backfill Supabase so future requests skip this Stripe call
    const { error: upsertErr } = await supabase
      .from("subscriptions")
      .upsert(
        {
          email:                  email,
          stripe_customer_id:     customerId,
          stripe_subscription_id: activeSub.id,
          plan:                   plan,
        },
        { onConflict: "email" }
      );

    if (upsertErr) {
      console.warn("[subscription-status] backfill upsert failed:", upsertErr.message);
    } else {
      console.log("[subscription-status] backfilled Supabase for:", email);
    }

    return json(res, 200, {
      subscribed:           true,
      hadTrial:             true,
      plan:                 plan,
      stripeCustomerId:     customerId,
      stripeSubscriptionId: activeSub.id,
    });

  } catch (err) {
    console.error("[subscription-status] Stripe error:", err.message);
    return json(res, 200, { subscribed: false, hadTrial: false });
  }
}
