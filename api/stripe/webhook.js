import Stripe from "stripe";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey) return json(res, 500, { error: "Stripe not configured." });

  const stripe = new Stripe(secretKey);
  let event;

  if (webhookSecret && !webhookSecret.startsWith("whsec_REPLACE_ME")) {
    try {
      const rawBody = await getRawBody(req);
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("[webhook] Signature error:", err.message);
      return json(res, 400, { error: `Webhook error: ${err.message}` });
    }
  } else {
    const body = req.body || {};
    event = { type: body.type, data: body.data };
    console.warn("[webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature check.");
  }

  console.log("[webhook]", event.type);
  return json(res, 200, { received: true });
}
