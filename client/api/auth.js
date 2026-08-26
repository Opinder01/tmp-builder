/**
 * Unified auth API — ?action=register|login|request-reset|reset-password|session
 *
 * Security changes:
 *  - Passwords hashed with PBKDF2 (100k iterations, SHA-512, random salt)
 *  - Legacy plaintext passwords auto-migrated to hash on first successful login
 *  - OTP validated server-side via AES-256-GCM encrypted token (no schema change)
 *  - reset-password requires valid OTP token; clears all sessions on success
 *  - Plaintext password no longer returned or stored on clients
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Password hashing ─────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.startsWith("pbkdf2:")) {
    // Legacy plaintext — direct compare, will be upgraded after login
    return password === stored;
  }
  const [, salt, hash] = stored.split(":");
  const attempt = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}

function isHashed(stored) {
  return typeof stored === "string" && stored.startsWith("pbkdf2:");
}

// ── OTP encrypted token (AES-256-GCM, no DB schema change needed) ───────────

function getOtpKey() {
  const secret =
    (process.env.SUPABASE_SERVICE_ROLE_KEY || "") +
    (process.env.STRIPE_SECRET_KEY || "") +
    "_otp_v1";
  return crypto.scryptSync(secret, "tmpbuilder_otp_salt", 32);
}

function encryptOtpToken(email, otp, expiresAt) {
  const key = getOtpKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const payload = JSON.stringify({ email: email.toLowerCase().trim(), otp, expiresAt });
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function decryptOtpToken(token) {
  try {
    const key = getOtpKey();
    const buf = Buffer.from(token, "base64url");
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString("utf8"));
  } catch {
    return null;
  }
}

// ── Email helper (Resend) ────────────────────────────────────────────────────

async function sendOtpEmail(email, otp) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email service not configured.");
  const html =
    "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px'>" +
    "<h2 style='color:#0f172a'>TMP Builder</h2>" +
    "<p>Your password reset code:</p>" +
    "<p style='font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a'>" + otp + "</p>" +
    "<p style='color:#64748b;font-size:13px'>This code expires in 10 minutes. If you did not request this, ignore this email.</p>" +
    "</div>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "TMP Builder <no-reply@tmpbuilder.ca>",
      to: [email],
      subject: "Your TMP Builder password reset code",
      html,
    }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.message || "Failed to send email.");
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_DEVICES  = 2;
const SESSION_DAYS = 30;
const OTP_TTL_MS   = 10 * 60 * 1000; // 10 minutes

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return json(res, 204, {});

  const action = req.query?.action;

  // ── REGISTER ────────────────────────────────────────────────────────────────
  if (action === "register") {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const { email, password, fullName, companyName, phone } = req.body || {};
    if (!email || !password || !fullName || !companyName || !phone)
      return json(res, 400, { error: "Please fill all fields." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json(res, 400, { error: "Please enter a valid email." });
    if (password.length < 6)
      return json(res, 400, { error: "Password must be at least 6 characters." });

    const supabase = getSupabase();
    const normalizedEmail = email.toLowerCase().trim();

    const { data: existing, error: selectErr } = await supabase
      .from("app_users").select("email").eq("email", normalizedEmail).maybeSingle();
    if (selectErr) {
      console.error("[register] select error:", selectErr);
      return json(res, 500, { error: "Database error. Please try again." });
    }
    if (existing) return json(res, 409, { error: "An account already exists with this email." });

    const { error: insertErr } = await supabase.from("app_users").insert({
      email:        normalizedEmail,
      password:     hashPassword(password),
      full_name:    fullName.trim(),
      company_name: companyName.trim(),
      phone:        phone.trim(),
    });
    if (insertErr) {
      console.error("[register] insert error:", insertErr);
      if (insertErr.code === "23505")
        return json(res, 409, { error: "An account already exists with this email." });
      return json(res, 500, { error: "Failed to create account. Please try again." });
    }
    return json(res, 200, { ok: true });
  }

  // ── LOGIN ────────────────────────────────────────────────────────────────────
  if (action === "login") {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const { email, password } = req.body || {};
    if (!email || !password) return json(res, 400, { error: "Please enter email and password." });

    const supabase = getSupabase();
    const normalizedEmail = email.toLowerCase().trim();

    const { data: user, error } = await supabase
      .from("app_users")
      .select("email, password, full_name, company_name, phone")
      .eq("email", normalizedEmail).maybeSingle();

    if (error) return json(res, 500, { error: "Database error. Please try again." });
    if (!user || !verifyPassword(password, user.password))
      return json(res, 401, { error: "Invalid email or password." });

    // Auto-upgrade legacy plaintext password to hashed (transparent migration)
    if (!isHashed(user.password)) {
      await supabase.from("app_users")
        .update({ password: hashPassword(password) })
        .eq("email", normalizedEmail);
    }

    // Never return the stored password hash to the client
    return json(res, 200, {
      email:       user.email,
      fullName:    user.full_name,
      companyName: user.company_name,
      phone:       user.phone,
    });
  }

  // ── REQUEST RESET (send OTP email) ──────────────────────────────────────────
  if (action === "request-reset") {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const { email } = req.body || {};
    if (!email) return json(res, 400, { error: "Please enter your email." });

    const supabase = getSupabase();
    const normalizedEmail = email.toLowerCase().trim();

    const otp       = String(Math.floor(100_000 + Math.random() * 900_000));
    const expiresAt = Date.now() + OTP_TTL_MS;
    const otpToken  = encryptOtpToken(normalizedEmail, otp, expiresAt);

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (err) {
      console.error("[request-reset] email error:", err.message);
      return json(res, 500, { error: "Could not send reset email. Please try again." });
    }

    // Return the encrypted token — client stores it and sends it back with the OTP they received
    return json(res, 200, { otpToken });
  }

  // ── RESET PASSWORD ───────────────────────────────────────────────────────────
  if (action === "reset-password") {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const { email, newPassword, otp, otpToken } = req.body || {};
    if (!email || !newPassword || !otp || !otpToken)
      return json(res, 400, { error: "Missing required fields." });
    if (newPassword.length < 6)
      return json(res, 400, { error: "Password must be at least 6 characters." });

    // Verify OTP server-side via encrypted token
    const decoded = decryptOtpToken(otpToken);
    if (!decoded)
      return json(res, 400, { error: "Invalid reset token. Please request a new code." });
    if (Date.now() > decoded.expiresAt)
      return json(res, 400, { error: "Reset code has expired. Please request a new one." });
    if (decoded.email !== email.toLowerCase().trim())
      return json(res, 400, { error: "Invalid reset token." });
    if (decoded.otp !== otp)
      return json(res, 400, { error: "Incorrect code. Please check your email and try again." });

    const supabase = getSupabase();
    const normalizedEmail = email.toLowerCase().trim();

    const hashedPw = hashPassword(newPassword);

    // Try to update an existing Supabase account
    const { data: updated, error: updateErr } = await supabase
      .from("app_users")
      .update({ password: hashedPw })
      .eq("email", normalizedEmail)
      .select("email");
    if (updateErr)
      return json(res, 500, { error: "Failed to reset password. Please try again." });

    // Account only in localStorage (legacy) — migrate it into Supabase now
    if (!updated || updated.length === 0) {
      const { error: insertErr } = await supabase.from("app_users").insert({
        email:        normalizedEmail,
        password:     hashedPw,
        full_name:    "",
        company_name: "",
        phone:        "",
      });
      // 23505 = unique violation — race condition, account now exists; that's fine
      if (insertErr && insertErr.code !== "23505")
        return json(res, 500, { error: "Failed to reset password. Please try again." });
    }

    // Invalidate all active sessions so old devices must re-login
    await supabase.from("user_sessions").delete().eq("email", normalizedEmail);

    return json(res, 200, { ok: true });
  }

  // ── SESSION ──────────────────────────────────────────────────────────────────
  if (action === "session") {
    const supabase = getSupabase();

    // POST — create session
    if (req.method === "POST") {
      const { email } = req.body || {};
      if (!email) return json(res, 400, { error: "email required." });
      const normalizedEmail = email.toLowerCase().trim();
      const expiryDate = new Date(Date.now() - SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Clean up expired sessions
      await supabase.from("user_sessions").delete()
        .eq("email", normalizedEmail).lt("last_active", expiryDate);

      // Count active sessions
      const { data: sessions, error: countErr } = await supabase
        .from("user_sessions").select("id, created_at")
        .eq("email", normalizedEmail).order("created_at", { ascending: true });

      if (countErr) return json(res, 500, { error: "Database error." });

      if ((sessions || []).length >= MAX_DEVICES) {
        return json(res, 403, {
          error: `This account is already signed in on ${MAX_DEVICES} devices. Please sign out from another device first.`,
          code: "MAX_DEVICES_REACHED",
        });
      }

      const sessionToken = crypto.randomBytes(32).toString("hex");
      const { error: insertErr } = await supabase
        .from("user_sessions").insert({ email: normalizedEmail, session_token: sessionToken });
      if (insertErr) return json(res, 500, { error: "Failed to create session." });

      return json(res, 200, { sessionToken });
    }

    // DELETE — remove session
    if (req.method === "DELETE") {
      const { sessionToken } = req.body || {};
      if (!sessionToken) return json(res, 400, { error: "sessionToken required." });
      await supabase.from("user_sessions").delete().eq("session_token", sessionToken);
      return json(res, 200, { ok: true });
    }

    // GET — validate session
    if (req.method === "GET") {
      const token = req.query?.token;
      if (!token) return json(res, 400, { error: "token required." });

      const { data, error } = await supabase
        .from("user_sessions").select("email, last_active")
        .eq("session_token", token).maybeSingle();

      if (error || !data) return json(res, 200, { valid: false });

      await supabase.from("user_sessions")
        .update({ last_active: new Date().toISOString() }).eq("session_token", token);

      return json(res, 200, { valid: true, email: data.email });
    }

    return json(res, 405, { error: "Method not allowed" });
  }

  return json(res, 400, { error: "Unknown action." });
}
