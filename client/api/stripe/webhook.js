import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase admin client — uses SERVICE_ROLE_KEY so it bypasses RLS.
// Never expose this key to the browser.
// ---------------------------------------------------------------------------
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set.");
  return createClient(url, key);
}

/**
 * Upsert a subscription record keyed by email.
 * If a row with that email already exists it is updated (idempotent).
 */
async function saveSubscription(email, record) {
  if (!email) {
    console.warn("[webhook] saveSubscription called with empty email — skipping.");
    return;
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    console.error("[webhook] ❌ Supabase client init failed:", err.message);
    console.error("[webhook]    Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
    return;
  }

  // Only write the 4 columns that exist in the subscriptions table.
  // Do NOT include status / trial_ends_at / updated_at — those columns
  // don't exist and will cause the upsert to fail silently.
  const row = {
    email:                  email.toLowerCase(),
    stripe_customer_id:     record.customerId     ?? undefined,
    stripe_subscription_id: record.subscriptionId ?? undefined,
    plan:                   record.plan            ?? undefined,
  };

  // Remove undefined keys so we don't overwrite existing good data with null
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

  console.log("[webhook] ⬆️  Upserting row to Supabase:", JSON.stringify(row));

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "email" })
    .select();

  if (error) {
    console.error("[webhook] ❌ Supabase upsert FAILED:");
    console.error("           code   :", error.code);
    console.error("           message:", error.message);
    console.error("           details:", error.details);
    console.error("           hint   :", error.hint);
  } else {
    console.log("[webhook] ✅ Supabase upsert OK — row saved:", JSON.stringify(data?.[0] ?? row));
  }
}

// ---------------------------------------------------------------------------

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  console.log(`[webhook] 📬 HIT — method=${req.method} url=${req.url}`);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const secretKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log("[webhook] 🔑 STRIPE_SECRET_KEY    :", secretKey  ? `set (${secretKey.slice(0,14)}...)` : "❌ NOT SET");
  console.log("[webhook] 🔑 STRIPE_WEBHOOK_SECRET:", webhookSecret && webhookSecret !== "whsec_REPLACE_ME_AFTER_SETUP" ? `set (${webhookSecret.slice(0,14)}...)` : "⚠️  not set / placeholder");
  console.log("[webhook] 🔑 SUPABASE_URL          :", process.env.SUPABASE_URL         ? `set (${process.env.SUPABASE_URL.slice(0,30)}...)` : "❌ NOT SET");
  console.log("[webhook] 🔑 SUPABASE_SERVICE_KEY  :", process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "❌ NOT SET");

  if (!secretKey) return json(res, 500, { error: "Stripe not configured." });

  const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

  let event;

  if (webhookSecret && webhookSecret !== "whsec_REPLACE_ME_AFTER_SETUP") {
    try {
      const rawBody = await getRawBody(req);
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      console.log("[webhook] ✅ Signature verified");
    } catch (err) {
      console.error("[webhook] ❌ Signature verification failed:", err.message);
      return json(res, 400, { error: `Webhook error: ${err.message}` });
    }
  } else {
    console.warn("[webhook] ⚠️  No webhook secret — accepting without signature verification (dev only).");
    const body = req.body || {};
    event = { type: body.type, data: body.data };
  }

  console.log(`[webhook] 📦 Event type: ${event?.type ?? "unknown"}`);

  // -------------------------------------------------------------------------
  // Event handlers — structure unchanged, only saveSubscription() changed
  // -------------------------------------------------------------------------
  switch (event.type) {

    case "checkout.session.completed": {
      const session = event.data.object;

      let sub = session.subscription;
      if (typeof sub === "string") {
        try { sub = await stripe.subscriptions.retrieve(sub); }
        catch (err) { console.warn("[webhook] Could not expand subscription:", err.message); }
      }

      const email        = session.customer_details?.email ?? session.customer_email ?? "";
      const customerId   = typeof session.customer === "string" ? session.customer : session.customer?.id ?? "";
      const subscriptionId = typeof sub === "object" ? sub?.id : sub ?? "";
      const priceId      = sub?.items?.data?.[0]?.price?.id ?? null;
      const plan         = priceId === process.env.STRIPE_PRICE_YEARLY ? "yearly" : "monthly";
      const trialEnd     = sub?.trial_end
        ? new Date(sub.trial_end * 1000).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      console.log(
        `[webhook] checkout.session.completed — email=${email}` +
        ` customerId=${customerId} subscriptionId=${subscriptionId}` +
        ` plan=${plan} trialEndsAt=${trialEnd}`
      );

      await saveSubscription(email, {
        customerId, subscriptionId, plan,
        subscriptionStatus: "trial",
        trialEndsAt: trialEnd,
      });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      let email = "";
      try { const c = await stripe.customers.retrieve(sub.customer); email = c.email ?? ""; } catch {}

      const status = sub.status;
      console.log(`[webhook] subscription.updated — ${sub.id} status=${status} email=${email}`);

      await saveSubscription(email, {
        subscriptionId: sub.id,
        customerId: sub.customer,
        subscriptionStatus: (status === "active" || status === "trialing") ? status : "inactive",
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      let email = "";
      try { const c = await stripe.customers.retrieve(sub.customer); email = c.email ?? ""; } catch {}

      console.log(`[webhook] subscription.deleted — ${sub.id} email=${email}`);

      await saveSubscription(email, {
        subscriptionId: sub.id,
        customerId: sub.customer,
        subscriptionStatus: "inactive",
      });
      break;
    }

    case "customer.subscription.trial_will_end": {
      const sub = event.data.object;
      console.log(`[webhook] trial_will_end — sub=${sub.id} ends=${new Date(sub.trial_end * 1000).toISOString()}`);
      break;
    }

    case "invoice.payment_succeeded": {
      const inv = event.data.object;
      console.log(`[webhook] payment_succeeded — invoice=${inv.id} customer=${inv.customer}`);

      if (inv.billing_reason === "subscription_cycle" || inv.billing_reason === "subscription_update") {
        let email = "";
        try { const c = await stripe.customers.retrieve(inv.customer); email = c.email ?? ""; } catch {}
        if (email) await saveSubscription(email, { subscriptionStatus: "active" });
      }
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object;
      console.log(`[webhook] payment_failed — invoice=${inv.id} customer=${inv.customer}`);
      break;
    }

    default:
      break;
  }

  return json(res, 200, { received: true });
}
