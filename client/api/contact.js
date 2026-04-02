import { Resend } from "resend";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

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

  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!toEmail || !fromEmail || !resendKey) {
    return json(res, 500, {
      error:
        "Server email is not configured. Set RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL.",
    });
  }

  const resend = new Resend(resendKey);

  const emailSubject = "New Contact Form Submission - TMP Builder";
  const bodyText =
    `New contact form submission:\n\n` +
    `First Name: ${fn}\n` +
    `Last Name: ${ln}\n` +
    `Email: ${em}\n` +
    `Company: ${String(companyName || "").trim()}\n` +
    `Phone: ${String(phoneNumber || "").trim()}\n` +
    `Subject: ${sub}\n\n` +
    `Message:\n${msg}\n`;

  try {
    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: em,
      subject: emailSubject,
      text: bodyText,
    });
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: "Failed to send email." });
  }
}

