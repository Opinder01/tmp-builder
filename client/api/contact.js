import { Resend } from "resend";

const ALLOWED_ORIGINS = new Set([
  "https://tmpbuilder.ca", "https://www.tmpbuilder.ca",
  "http://localhost:3000", "http://localhost:5173", "http://localhost:4173",
]);

// In-memory rate limiter (best-effort; clears on cold start)
const _rl = new Map();
function rateLimit(ip, maxAttempts, windowSec) {
  const now = Date.now();
  const e = _rl.get(ip);
  if (!e || now > e.r) { _rl.set(ip, { n: 1, r: now + windowSec * 1000 }); return false; }
  e.n++;
  return e.n > maxAttempts;
}
function getIp(req) {
  return req.headers["x-real-ip"]
    || (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress || "unknown";
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export default async function handler(req, res) {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  // Rate limit: 5 contact form submissions per IP per hour
  const ip = getIp(req);
  if (rateLimit(ip, 5, 3600))
    return json(res, 429, { error: "Too many requests. Please wait before submitting again." });

  const {
    firstName,
    lastName,
    email,
    companyName = "",
    phoneNumber = "",
    subject,
    message,
  } = req.body || {};

  const fn = String(firstName || "").trim();
  const ln = String(lastName || "").trim();
  const em = String(email || "").trim();
  const sub = String(subject || "").trim();
  const msg = String(message || "").trim();

  if (!fn || !ln || !em || !sub || !msg) {
    return json(res, 400, { error: "Missing required fields." });
  }
  if (!isValidEmail(em)) {
    return json(res, 400, { error: "Invalid email address." });
  }
  if (fn.length > 100 || ln.length > 100 || sub.length > 200 || msg.length > 5000) {
    return json(res, 400, { error: "Input too long." });
  }

  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!toEmail || !fromEmail || !resendKey) {
    return json(res, 500, { error: "Email service not configured." });
  }

  const resend = new Resend(resendKey);

  const emailSubject = "New Contact Form Submission - TMP Builder";
  const bodyText =
    `New contact form submission:\n\n` +
    `First Name: ${fn}\n` +
    `Last Name: ${ln}\n` +
    `Email: ${em}\n` +
    `Company: ${String(companyName || "").trim().slice(0, 100)}\n` +
    `Phone: ${String(phoneNumber || "").trim().slice(0, 30)}\n` +
    `Subject: ${sub}\n\n` +
    `Message:\n${msg}\n`;

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to:   [toEmail],
      reply_to: em,
      subject:  emailSubject,
      text:     bodyText,
    });

    if (result.error) {
      console.error("[contact] Resend API error:", JSON.stringify(result.error));
      return json(res, 500, { error: "Failed to send message." });
    }

    console.log("[contact] ✅ email sent, id:", result.data?.id);
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("[contact] unexpected error:", e.message);
    return json(res, 500, { error: "Failed to send message." });
  }
}
