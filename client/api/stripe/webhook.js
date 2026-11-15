import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { planFromPrice } from "../_lib/plan.js";

// ---------------------------------------------------------------------------
// TMP Drawing order helpers
// ---------------------------------------------------------------------------
async function handleTmpDrawingPayment(session, stripe) {
  const orderId      = session.metadata?.order_id;
  const customerName = session.metadata?.customer_name ?? session.customer_details?.name ?? "";
  const email        = session.customer_details?.email ?? session.customer_email ?? "";
  const numDrawings  = parseInt(session.metadata?.num_drawings ?? "1", 10);
  const amountTotal  = session.amount_total ?? 0;

  console.log(`[webhook] TMP drawing paid — order_id=${orderId} email=${email} drawings=${numDrawings}`);

  // 1. Update order status in Supabase
  if (orderId) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data: order } = await supabase
        .from("tmp_drawing_orders")
        .update({
          payment_status:           "paid",
          order_status:             "pending",
          stripe_payment_intent_id: typeof session.payment_intent === "string"
            ? session.payment_intent : session.payment_intent?.id ?? null,
          amount_paid: amountTotal,
        })
        .eq("id", orderId)
        .select()
        .single();

      // 2. Send confirmation email to customer
      if (email) await sendTmpDrawingCustomerEmail({ email, customerName, numDrawings, orderId, amountTotal });

      // 3. Send notification email to admin/drafter
      await sendTmpDrawingAdminEmail({ order: order ?? { customer_name: customerName, customer_email: email, num_drawings: numDrawings, id: orderId }, amountTotal });
    } catch (err) {
      console.error("[webhook] TMP drawing DB update error:", err.message);
    }
  }
}

async function sendTmpDrawingCustomerEmail({ email, customerName, numDrawings, orderId, amountTotal }) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;
  if (!resendKey || !fromEmail) return;

  const resend   = new Resend(resendKey);
  const greeting = customerName ? `Hi ${customerName},` : "Hi there,";
  const drawingText = numDrawings === 1 ? "1 drawing" : `${numDrawings} drawings`;
  const amount   = amountTotal ? `CA$ ${(amountTotal / 100).toFixed(2)}` : `CA$ ${(numDrawings * 200).toFixed(2)}`;
  const subject  = "Your TMP Drawing Order is Confirmed — TMP Builder";

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,-apple-system,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
    <img src="https://tmpbuilder.ca/logo.png" alt="TMP Builder" width="120" style="display:block;margin:0 auto;max-width:120px;"/>
    <div style="font-size:12px;color:#94a3b8;margin-top:8px;">Traffic Management Plan Software</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:36px 40px;">
    <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:600;">${greeting}</p>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
      Your payment has been received and your TMP drawing order is confirmed. Our team (in partnership with <strong>Crown Traffic Management Ltd.</strong>) will begin work on your plan shortly.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;">
      <tr><td style="padding:20px 24px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:16px;">Order Summary</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:14px;color:#64748b;padding:6px 0;">Service</td><td style="font-size:14px;color:#0f172a;font-weight:600;text-align:right;">We Make Your TMP</td></tr>
          <tr><td style="font-size:14px;color:#64748b;padding:6px 0;">Drawings</td><td style="font-size:14px;color:#0f172a;font-weight:600;text-align:right;">${drawingText}</td></tr>
          <tr><td style="font-size:14px;color:#64748b;padding:6px 0;">Amount Paid</td><td style="font-size:14px;color:#0f172a;font-weight:600;text-align:right;">${amount}</td></tr>
          <tr><td style="font-size:14px;color:#64748b;padding:6px 0;">Order ID</td><td style="font-size:12px;color:#94a3b8;text-align:right;">${orderId}</td></tr>
        </table>
      </td></tr>
    </table>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#92400e;line-height:1.6;">
      <strong>What happens next:</strong><br/>
      Our drafting team will review your site details and create your traffic management plan. We'll follow up at this email address if we have any questions, and deliver your completed plan within 3–5 business days.
    </div>
    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
      Questions? Reply to this email or contact us at <a href="mailto:info@tmpbuilder.ca" style="color:#f97316;font-weight:600;text-decoration:none;">info@tmpbuilder.ca</a>
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">TMP Builder · Victoria, BC · Canada · In partnership with Crown Traffic Management Ltd.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  try {
    const result = await resend.emails.send({ from: fromEmail, to: [email], subject, html });
    if (result.error) console.error("[webhook] TMP customer email failed:", JSON.stringify(result.error));
    else console.log("[webhook] ✅ TMP customer confirmation sent to:", email);
  } catch (err) {
    console.error("[webhook] TMP customer email exception:", err.message);
  }
}

async function sendTmpDrawingAdminEmail({ order, amountTotal }) {
  const resendKey  = process.env.RESEND_API_KEY;
  const fromEmail  = process.env.CONTACT_FROM_EMAIL;
  const adminEmail = "info@tmpbuilder.ca";
  if (!resendKey || !fromEmail) return;

  const resend  = new Resend(resendKey);
  const amount  = amountTotal ? `CA$ ${(amountTotal / 100).toFixed(2)}` : `CA$ ${((order.num_drawings ?? 1) * 200).toFixed(2)}`;
  const subject = `New TMP Drawing Order — ${order.customer_name ?? "Customer"} (${order.num_drawings ?? 1} drawing${order.num_drawings === 1 ? "" : "s"})`;

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,-apple-system,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
    <img src="https://tmpbuilder.ca/logo.png" alt="TMP Builder" width="120" style="display:block;margin:0 auto;max-width:120px;"/>
    <div style="font-size:14px;color:#f97316;font-weight:700;margin-top:12px;">NEW TMP DRAWING ORDER</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:36px 40px;">
    <p style="margin:0 0 20px;font-size:15px;color:#0f172a;font-weight:600;">A new drawing order has been placed and paid.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:16px;">Order Details</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:14px;color:#64748b;padding:5px 0;width:40%;">Customer</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.customer_name ?? "—"}</td></tr>
          <tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Email</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.customer_email ?? "—"}</td></tr>
          ${order.customer_phone ? `<tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Phone</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.customer_phone}</td></tr>` : ""}
          ${order.company_name ? `<tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Company</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.company_name}</td></tr>` : ""}
          <tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Site Address</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.site_address ?? "—"}</td></tr>
          <tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Work Type</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.work_type ?? "—"}</td></tr>
          <tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Description</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.work_description ?? "—"}</td></tr>
          <tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Drawings</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.num_drawings ?? 1}</td></tr>
          ${order.special_requirements ? `<tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Special Notes</td><td style="font-size:14px;color:#0f172a;font-weight:600;">${order.special_requirements}</td></tr>` : ""}
          <tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Amount Paid</td><td style="font-size:14px;color:#16a34a;font-weight:700;">${amount}</td></tr>
          <tr><td style="font-size:14px;color:#64748b;padding:5px 0;">Order ID</td><td style="font-size:12px;color:#94a3b8;">${order.id ?? "—"}</td></tr>
        </table>
      </td></tr>
    </table>
    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
      Log in to the <a href="https://tmpbuilder.ca/admin" style="color:#f97316;font-weight:600;text-decoration:none;">admin panel</a> to manage this order.
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">TMP Builder · info@tmpbuilder.ca</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  try {
    const result = await resend.emails.send({ from: fromEmail, to: [adminEmail], subject, html });
    if (result.error) console.error("[webhook] TMP admin email failed:", JSON.stringify(result.error));
    else console.log("[webhook] ✅ TMP admin notification sent to:", adminEmail);
  } catch (err) {
    console.error("[webhook] TMP admin email exception:", err.message);
  }
}

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

  // Look up permanent user_id so subscription ownership is by user_id, not just email
  const normEmail = email.toLowerCase().trim();
  const { data: userRow } = await supabase
    .from("app_users").select("id").eq("email", normEmail).maybeSingle();

  const row = {
    email:                  normEmail,
    user_id:                userRow?.id ?? undefined,
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
async function sendReceiptEmail({ toEmail, customerName, plan, price, amount, currency, invoiceUrl, date, isRenewal }) {
  const resendKey   = process.env.RESEND_API_KEY;
  const fromEmail   = process.env.CONTACT_FROM_EMAIL;
  if (!resendKey || !fromEmail) {
    console.warn("[webhook] Resend not configured — skipping receipt email.");
    return;
  }

  const resend = new Resend(resendKey);

  const planLabel    = plan === "yearly" ? "Annual Plan" : "Monthly Plan";
  // Show the price the subscriber is actually on (older subscribers keep the
  // price they signed up at); fall back to the current list price.
  const planPrice    = price?.unit_amount != null
    ? `${(price.currency ?? "cad").toUpperCase()} $${(price.unit_amount / 100).toFixed(2)} / ${plan === "yearly" ? "year" : "month"}`
    : plan === "yearly" ? "CAD $499.99 / year" : "CAD $49.99 / month";
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

      // Route TMP drawing orders separately
      if (session.metadata?.order_type === "tmp_drawing") {
        await handleTmpDrawingPayment(session, stripe);
        break;
      }

      let sub = session.subscription;
      if (typeof sub === "string") {
        try { sub = await stripe.subscriptions.retrieve(sub); }
        catch (err) { console.warn("[webhook] Could not expand subscription:", err.message); }
      }

      const email          = session.customer_details?.email ?? session.customer_email ?? "";
      const customerName   = session.customer_details?.name ?? "";
      const customerId     = typeof session.customer === "string" ? session.customer : session.customer?.id ?? "";
      const subscriptionId = typeof sub === "object" ? sub?.id : sub ?? "";
      const price         = sub?.items?.data?.[0]?.price ?? null;
      const plan           = planFromPrice(price);
      const trialEnd      = sub?.trial_end
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
          price,
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
      const plan    = planFromPrice(sub.items?.data?.[0]?.price);
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
        let price = null;
        try {
          const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            price = sub.items?.data?.[0]?.price ?? null;
          }
        } catch {}
        const plan = planFromPrice(price);

        if (email) {
          await saveSubscription(email, { subscriptionStatus: "active" });

          const dateStr = new Date(inv.created * 1000).toLocaleDateString("en-CA", {
            year: "numeric", month: "long", day: "numeric",
          });

          await sendReceiptEmail({
            toEmail:      email,
            customerName: customerName,
            plan,
            price,
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
