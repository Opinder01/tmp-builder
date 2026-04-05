import Stripe from "stripe";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * GET /api/stripe/get-session?session_id=cs_xxx
 * Returns real subscription data for a completed Stripe Checkout session.
 * Called by the /success page right after redirect so we can persist
 * the customer ID, subscription ID, plan, and trial-end date to localStorage.
 */
export default async function handler(req, res) {
  // Allow CORS for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const session_id = req.query?.session_id;
  if (!session_id) {
    return json(res, 400, { error: "session_id query parameter is required" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return json(res, 500, { error: "Stripe not configured on server" });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

  try {
    // Expand subscription and customer so we get all fields in one call
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription", "customer"],
    });

    const customer = session.customer;
    const sub = session.subscription;

    const customerId =
      typeof customer === "string" ? customer : customer?.id ?? "";
    const customerEmail =
      session.customer_email ??
      (typeof customer === "object" ? customer?.email : "") ??
      "";
    const subscriptionId =
      typeof sub === "string" ? sub : sub?.id ?? "";

    // subscription object is expanded — extract trial end (Unix timestamp → ISO)
    const trialEndUnix =
      typeof sub === "object" ? sub?.trial_end ?? null : null;
    const trialEndsAt = trialEndUnix
      ? new Date(trialEndUnix * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Determine which plan the customer chose
    const priceId =
      typeof sub === "object"
        ? sub?.items?.data?.[0]?.price?.id ?? null
        : null;
    const plan =
      priceId === process.env.STRIPE_PRICE_YEARLY ? "yearly" : "monthly";

    // Subscription status: "trialing", "active", etc.
    const stripeStatus =
      typeof sub === "object" ? sub?.status ?? "trialing" : "trialing";

    console.log(
      `[get-session] session=${session_id} customer=${customerId}` +
      ` email=${customerEmail} sub=${subscriptionId}` +
      ` plan=${plan} status=${stripeStatus}`
    );

    return json(res, 200, {
      email: customerEmail,
      customerId,
      subscriptionId,
      stripeStatus,   // "trialing" | "active" | "past_due" etc.
      plan,           // "monthly" | "yearly"
      trialEndsAt,
    });
  } catch (err) {
    console.error("[get-session] error:", err.message);
    return json(res, 500, { error: err.message });
  }
}
