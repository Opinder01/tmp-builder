function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return json(res, 400, { error: "email and otp are required" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[send-otp] RESEND_API_KEY not set");
    return json(res, 500, { error: "Email service not configured." });
  }

  const html =
    "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px'>" +
    "<h2 style='color:#0f172a'>TMP Builder</h2>" +
    "<p>Your password reset code:</p>" +
    "<p style='font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a'>" + otp + "</p>" +
    "<p style='color:#64748b;font-size:13px'>This code expires in 10 minutes. If you did not request this, ignore this email.</p>" +
    "</div>";

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TMP Builder <no-reply@tmpbuilder.ca>",
        to: [email],
        subject: "Your TMP Builder password reset code",
        html: html,
      }),
    });

    const result = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("[send-otp] Resend error:", JSON.stringify(result));
      return json(res, 500, { error: "Failed to send email." });
    }

    console.log("[send-otp] sent to:", email);
    return json(res, 200, { sent: true });
  } catch (err) {
    console.error("[send-otp] error:", err.message);
    return json(res, 500, { error: "Failed to send email." });
  }
}
