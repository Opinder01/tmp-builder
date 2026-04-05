/**
 * dev-server.js — local API server for Stripe endpoints
 *
 * Usage (two terminals):
 *   Terminal 1:  node dev-server.js
 *   Terminal 2:  npm run dev
 *
 * Then open: http://localhost:5173
 *
 * The Vite dev server (port 5173) already proxies /api/* → localhost:3000,
 * so this server handles all serverless-function calls locally.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Stripe from "stripe";

// ── Load .env ──────────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(join(__dir, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  console.warn("[dev-server] No .env file found — using existing env vars.");
}

const PORT = 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:5173`).replace(/\/$/, "");

// ── Helpers ────────────────────────────────────────────────────────────────
function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(typeof c === "string" ? Buffer.from(c) : c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Request handler ────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // CORS — allow Vite dev server (localhost:5173) to call this server
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, stripe-signature");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url?.split("?")[0];

  // ── POST /api/stripe/create-checkout-session ───────────────────────────
  if (url === "/api/stripe/create-checkout-session") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey || secretKey === "sk_test_REPLACE_ME") {
      return sendJson(res, 500, {
        error: "STRIPE_SECRET_KEY is not set. Edit client/.env and replace sk_test_REPLACE_ME with your real Stripe test key.",
      });
    }

    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw.toString());
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }

    const { plan } = body;
    if (!plan || !["monthly", "yearly"].includes(plan)) {
      return sendJson(res, 400, { error: 'plan must be "monthly" or "yearly"' });
    }

    const priceId =
      plan === "monthly"
        ? process.env.STRIPE_PRICE_MONTHLY
        : process.env.STRIPE_PRICE_YEARLY;

    if (!priceId) {
      return sendJson(res, 500, { error: `STRIPE_PRICE_${plan.toUpperCase()} is not set in .env` });
    }

    try {
      const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { trial_period_days: 7 },
        success_url: `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/subscribe`,
      });
      return sendJson(res, 200, { url: session.url });
    } catch (err) {
      console.error("[Stripe]", err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // ── POST /api/stripe/webhook ───────────────────────────────────────────
  if (url === "/api/stripe/webhook") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey) return sendJson(res, 500, { error: "Stripe not configured" });

    const rawBody = await readBody(req);
    const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

    let event;
    if (webhookSecret && !webhookSecret.startsWith("whsec_REPLACE_ME")) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, req.headers["stripe-signature"], webhookSecret);
      } catch (err) {
        return sendJson(res, 400, { error: `Webhook error: ${err.message}` });
      }
    } else {
      try { event = JSON.parse(rawBody.toString()); } catch { event = {}; }
      console.warn("[dev-server] STRIPE_WEBHOOK_SECRET not set — skipping signature check.");
    }

    console.log("[webhook]", event.type);
    return sendJson(res, 200, { received: true });
  }

  // ── 404 for anything else ──────────────────────────────────────────────
  sendJson(res, 404, { error: `No handler for ${req.method} ${url}` });
});

server.listen(PORT, () => {
  console.log(`\n✅ Local API server running at http://localhost:${PORT}`);
  console.log(`   /api/stripe/create-checkout-session  POST`);
  console.log(`   /api/stripe/webhook                  POST`);
  console.log(`\n   Now run:  npm run dev`);
  console.log(`   Then open: http://localhost:5173\n`);
});
