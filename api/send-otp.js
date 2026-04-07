/**
 * POST /api/send-otp
 * Body: { email, otp }
 *
 * Sends a 6-digit OTP to the given email via Resend.
 * Requires RESEND_API_KEY in Vercel environment variables.
 * Get a free key at https://resend.com
 */

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
  if (!email || !otp) return json(res, 400, { error: "email and otp are required" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[send-otp] RESEND_API_KEY not set");
    return json(res, 500, { error: "Email service not configured." });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "TMP Builder <noreply@tmpbuilder.ca>",
        to:      [email],
        subject: "Your TMP Builder password reset code",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <div style="font-size:22px;font-weight:900;color:#0f172a;margin-bottom:8px">
              TMP Builder
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
            <p style="font-size:16px;color:#334155">
              You requested a password reset. Use the code below to continue.
              This code expires in <strong>10 minutes</strong>.
            </p>
            <div style="text-align:center;margin:32px 0">
              <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#0f172a">
                ${otp}
              </span>
            </div>
            <p style="font-size:13px;color:#64748b">
              If you didn't request this, you can safely ignore this email.
              Your password will not change.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
            <p style="font-size:12px;color:#94a3b8;margin:0">
              TMP Builder &mdash; Canada's First Dedicated TMP Builder<br/>
              <a href="https://tmpbuilder.ca" style="color:#2563eb">tmpbuilder.ca</a>
            </p>
          </div>
        `,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("[send-otp] Resend error:", JSON.stringify(result));
      return json(res, 500, { error: "Failed to send email." });
    }

    console.log("[send-otp] ✅ OTP email sent to:", email);
    return json(res, 200, { sent: true });
  } catch (err) {
    console.error("[send-otp] unexpected error:", err.message);
    return json(res, 500, { error: "Failed to send email." });
  }
}
