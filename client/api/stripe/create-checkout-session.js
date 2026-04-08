import Stripe from "stripe";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  // CORS for local dev
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

  const secretKey = process.env.STRIPE_SECRET_KEY;
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

  try {
    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscribe`,
    };

    // Pre-fill and lock the email to the logged-in account so the webhook
    // always saves the same email that the user signed up with.
    if (email && typeof email === "string" && email.includes("@")) {
      sessionParams.customer_email = email.toLowerCase().trim();
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return json(res, 200, { url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return json(res, 500, { error: err.message || "Failed to create checkout session." });
  }
}
