import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set.");
  return createClient(url, key);
}

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
    return;
  }

  const row = {
    email:                  email.toLowerCase(),
    stripe_customer_id:     record.customerId     ?? undefined,
    stripe_subscription_id: record.subscriptionId ?? undefined,
    plan:                   record.plan            ?? undefined,
  };

  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

  console.log("[webhook] ⬆️  Upserting row to Supabase:", JSON.stringify(row));

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "email" })
    .select();

  if (error) {
    console.error("[webhook] ❌ Supabase upsert FAILED:", error.message);
  } else {
    console.log("[webhook] ✅ Supabase upsert OK:", JSON.stringify(data?.[0] ?? row));
  }
}

// ---------------------------------------------------------------------------
// Receipt email via Resend
// ---------------------------------------------------------------------------
async function sendReceiptEmail({ toEmail, customerName, plan, amount, currency, invoiceUrl, date, isRenewal }) {
  const resendKey   = process.env.RESEND_API_KEY;
  const fromEmail   = process.env.CONTACT_FROM_EMAIL;
  if (!resendKey || !fromEmail) {
    console.warn("[webhook] Resend not configured — skipping receipt email.");
    return;
  }

  const resend = new Resend(resendKey);

  const planLabel    = plan === "yearly" ? "Annual Plan" : "Monthly Plan";
  const planPrice    = plan === "yearly" ? "CAD $699.99 / year" : "CAD $69.99 / month";
  const subject      = isRenewal
    ? `Your TMP Builder payment receipt – ${date}`
    : `Welcome to TMP Builder — your subscription is active`;

  const greeting    = customerName ? `Hi ${customerName},` : "Hi there,";
  const intro       = isRenewal
    ? `Your TMP Builder subscription has been successfully renewed.`
    : `Thank you for subscribing to TMP Builder! Your 7-day free trial has started and your subscription is now active.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,-apple-system,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <img src="https://tmpbuilder.ca/logo.png" alt="TMP Builder" width="120" style="display:block;margin:0 auto;max-width:120px;" />
              <div style="font-size:12px;color:#94a3b8;margin-top:8px;letter-spacing:0.5px;">Traffic Management Plan Software</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px 40px;">
              <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:600;">${greeting}</p>
              <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">${intro}</p>

              <!-- Receipt box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:16px;">Receipt Summary</div>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;color:#64748b;padding:6px 0;">Plan</td>
                        <td style="font-size:14px;color:#0f172a;font-weight:600;text-align:right;">${planLabel}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#64748b;padding:6px 0;">Price</td>
                        <td style="font-size:14px;color:#0f172a;font-weight:600;text-align:right;">${planPrice}</td>
                      </tr>
                      ${amount ? `
                      <tr>
                        <td style="font-size:14px;color:#64748b;padding:6px 0;">Amount Charged</td>
                        <td style="font-size:14px;color:#0f172a;font-weight:600;text-align:right;">${currency?.toUpperCase() ?? "CAD"} $${(amount / 100).toFixed(2)}</td>
                      </tr>` : ""}
                      <tr>
                        <td style="font-size:14px;color:#64748b;padding:6px 0;">Date</td>
                        <td style="font-size:14px;color:#0f172a;font-weight:600;text-align:right;">${date}</td>
                      </tr>
                      ${!isRenewal ? `
                      <tr>
                        <td colspan="2" style="padding-top:14px;">
                          <div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;font-size:13px;color:#15803d;font-weight:600;">
                            ✅ 7-day free trial included — you won't be charged until the trial ends.
                          </div>
                        </td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              ${invoiceUrl ? `
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${invoiceUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">
                  View Invoice →
                </a>
              </div>` : ""}

              <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
                You can manage your subscription, update billing, or cancel anytime from your
                <a href="https://tmpbuilder.ca/dashboard" style="color:#f97316;font-weight:600;text-decoration:none;">account dashboard</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
                TMP Builder · Victoria, BC · Canada<br />
                Questions? Email us at <a href="mailto:info@tmpbuilder.ca" style="color:#f97316;text-decoration:none;">info@tmpbuilder.ca</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from:     fromEmail,
      to:       [toEmail],
      subject,
      html,
    });

    if (result.error) {
      console.error("[webhook] ❌ Receipt email failed:", JSON.stringify(result.error));
    } else {
      console.log("[webhook] ✅ Receipt email sent to:", toEmail, "id:", result.data?.id);
    }
  } catch (err) {
    console.error("[webhook] ❌ Receipt email exception:", err.message);
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

  if (!webhookSecret || webhookSecret === "whsec_REPLACE_ME_AFTER_SETUP") {
    console.error("[webhook] ❌ STRIPE_WEBHOOK_SECRET not configured — refusing request.");
    return json(res, 500, { error: "Webhook not configured." });
  }

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    console.log("[webhook] ✅ Signature verified");
  } catch (err) {
    console.error("[webhook] ❌ Signature verification failed:", err.message);
    return json(res, 400, { error: `Webhook error: ${err.message}` });
  }

  console.log(`[webhook] 📦 Event type: ${event?.type ?? "unknown"}`);

  switch (event.type) {

    case "checkout.session.completed": {
      const session = event.data.object;

      let sub = session.subscription;
      if (typeof sub === "string") {
        try { sub = await stripe.subscriptions.retrieve(sub); }
        catch (err) { console.warn("[webhook] Could not expand subscription:", err.message); }
      }

      const email          = session.customer_details?.email ?? session.customer_email ?? "";
      const customerName   = session.customer_details?.name ?? "";
      const customerId     = typeof session.customer === "string" ? session.customer : session.customer?.id ?? "";
      const subscriptionId = typeof sub === "object" ? sub?.id : sub ?? "";
      const priceId        = sub?.items?.data?.[0]?.price?.id ?? null;
      const plan           = priceId === process.env.STRIPE_PRICE_YEARLY ? "yearly" : "monthly";
      const trialEnd       = sub?.trial_end
        ? new Date(sub.trial_end * 1000).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const dateStr = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

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

      // Send welcome + trial receipt
      if (email) {
        await sendReceiptEmail({
          toEmail:      email,
          customerName: customerName,
          plan,
          amount:       null,   // no charge yet — trial
          currency:     "cad",
          invoiceUrl:   null,
          date:         dateStr,
          isRenewal:    false,
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      let email = "";
      try { const c = await stripe.customers.retrieve(sub.customer); email = c.email ?? ""; } catch {}

      const status  = sub.status;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      const plan    = priceId === process.env.STRIPE_PRICE_YEARLY ? "yearly" : "monthly";
      console.log(`[webhook] subscription.updated — ${sub.id} status=${status} plan=${plan} email=${email}`);

      await saveSubscription(email, {
        subscriptionId: sub.id,
        customerId: sub.customer,
        plan,
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

      // Only send receipt for real charges (not $0 trial invoices)
      if (inv.amount_paid > 0) {
        let email = "";
        let customerName = "";
        try {
          const c  = await stripe.customers.retrieve(inv.customer);
          email    = c.email ?? "";
          customerName = c.name ?? "";
        } catch {}

        // Determine plan from subscription price
        let plan = "monthly";
        try {
          const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            const priceId = sub.items?.data?.[0]?.price?.id ?? null;
            if (priceId === process.env.STRIPE_PRICE_YEARLY) plan = "yearly";
          }
        } catch {}

        if (email) {
          await saveSubscription(email, { subscriptionStatus: "active" });

          const dateStr = new Date(inv.created * 1000).toLocaleDateString("en-CA", {
            year: "numeric", month: "long", day: "numeric",
          });

          await sendReceiptEmail({
            toEmail:      email,
            customerName: customerName,
            plan,
            amount:       inv.amount_paid,
            currency:     inv.currency,
            invoiceUrl:   inv.hosted_invoice_url ?? null,
            date:         dateStr,
            isRenewal:    inv.billing_reason === "subscription_cycle",
          });
        }
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
