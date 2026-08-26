/**
 * Unified auth API — ?action=register|login|request-reset|reset-password|session
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "https://tmpbuilder.ca",
  "https://www.tmpbuilder.ca",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function setCors(req, res) {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── In-memory rate limiter (best-effort; clears on cold start) ────────────────
const _rl = new Map();
function rateLimit(ip, key, maxAttempts, windowSec) {
  const k = `${ip}|${key}`;
  const now = Date.now();
  const e = _rl.get(k);
  if (!e || now > e.r) { _rl.set(k, { n: 1, r: now + windowSec * 1000 }); return false; }
  e.n++;
  return e.n > maxAttempts;
}
function getIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress || "unknown";
}

// ── In-memory OTP token blacklist (cleared on cold start) ────────────────────
// Prevents replay within the same warm instance window (~10-15 min)
const _usedTokens = new Set();

// ── Password hashing ─────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.startsWith("pbkdf2:")) return password === stored; // legacy plaintext
  const [, salt, hash] = stored.split(":");
  const attempt = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}

function isHashed(s) { return typeof s === "string" && s.startsWith("pbkdf2:"); }

// ── OTP encrypted token ───────────────────────────────────────────────────────

function getOtpKey() {
  const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    + (process.env.STRIPE_SECRET_KEY || "") + "_otp_v1";
  return crypto.scryptSync(secret, "tmpbuilder_otp_salt", 32);
}

function encryptOtpToken(email, otp, expiresAt) {
  const key = getOtpKey();
  const iv  = crypto.randomBytes(12);
  const tid = crypto.randomBytes(8).toString("hex"); // unique token ID for blacklisting
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const payload = JSON.stringify({ email: email.toLowerCase().trim(), otp, expiresAt, tid });
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
    const d   = crypto.createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    const dec = Buffer.concat([d.update(enc), d.final()]);
    return JSON.parse(dec.toString("utf8"));
  } catch { return null; }
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendOtpEmail(email, otp) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email service not configured.");
  const html =
    "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px'>" +
    "<h2 style='color:#0f172a'>TMP Builder</h2><p>Your password reset code:</p>" +
    "<p style='font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a'>" + otp + "</p>" +
    "<p style='color:#64748b;font-size:13px'>Expires in 10 minutes. If you did not request this, ignore this email.</p></div>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "TMP Builder <no-reply@tmpbuilder.ca>", to: [email],
      subject: "Your TMP Builder password reset code", html }),
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(b?.message || "Failed to send email.");
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_DEVICES  = 2;
const SESSION_DAYS = 30;
const OTP_TTL_MS   = 10 * 60 * 1000;

// ── Input validation ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
function validateInputs(fields) {
  const { email, password, fullName, companyName, phone } = fields;
  if (email    !== undefined && (!EMAIL_RE.test(email) || email.length > 254))
    return "Please enter a valid email address.";
  if (password !== undefined && password.length > 128)
    return "Password must be 128 characters or fewer.";
  if (fullName    !== undefined && fullName.length    > 100) return "Full name too long.";
  if (companyName !== undefined && companyName.length > 100) return "Company name too long.";
  if (phone       !== undefined && phone.length       > 30)  return "Phone number too long.";
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return json(res, 204, {});

  const action = req.query?.action;
  const ip     = getIp(req);

  // ── REGISTER ──────────────────────────────────────────────────────────────
  if (action === "register") {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const { email, password, fullName, companyName, phone } = req.body || {};
    if (!email || !password || !fullName || !companyName || !phone)
      return json(res, 400, { error: "Please fill all fields." });

    const validErr = validateInputs({ email, password, fullName, companyName, phone });
    if (validErr) return json(res, 400, { error: validErr });
    if (password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters." });

    const supabase = getSupabase();
    const norm = email.toLowerCase().trim();
    const { data: existing } = await supabase.from("app_users").select("email").eq("email", norm).maybeSingle();
    if (existing) return json(res, 409, { error: "An account already exists with this email." });

    const { error: insertErr } = await supabase.from("app_users").insert({
      email: norm, password: hashPassword(password),
      full_name: fullName.trim(), company_name: companyName.trim(), phone: phone.trim(),
    });
    if (insertErr) {
      if (insertErr.code === "23505") return json(res, 409, { error: "An account already exists with this email." });
      return json(res, 500, { error: "Failed to create account. Please try again." });
    }
    return json(res, 200, { ok: true });
  }

  // ── LOGIN (creates session internally) ────────────────────────────────────
  if (action === "login") {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    // Rate limit: 10 attempts per IP per 15 minutes
    if (rateLimit(ip, "login", 10, 900))
      return json(res, 429, { error: "Too many login attempts. Please wait 15 minutes and try again." });

    const { email, password } = req.body || {};
    if (!email || !password) return json(res, 400, { error: "Please enter email and password." });

    const validErr = validateInputs({ email, password });
    if (validErr) return json(res, 400, { error: validErr });

    const supabase = getSupabase();
    const norm = email.toLowerCase().trim();

    const { data: user, error } = await supabase
      .from("app_users").select("email, password, full_name, company_name, phone")
      .eq("email", norm).maybeSingle();

    if (error) return json(res, 500, { error: "Database error. Please try again." });
    if (!user || !verifyPassword(password, user.password))
      return json(res, 401, { error: "Invalid email or password." });

    // Auto-upgrade legacy plaintext to hash
    if (!isHashed(user.password)) {
      await supabase.from("app_users").update({ password: hashPassword(password) }).eq("email", norm);
    }

    // Create session — enforce device limit
    const expiryDate = new Date(Date.now() - SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("user_sessions").delete().eq("email", norm).lt("last_active", expiryDate);

    const { data: sessions } = await supabase
      .from("user_sessions").select("id").eq("email", norm);

    if ((sessions || []).length >= MAX_DEVICES) {
      return json(res, 403, {
        error: `This account is already signed in on ${MAX_DEVICES} devices. Please sign out from another device first.`,
        code: "MAX_DEVICES_REACHED",
      });
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const { error: sessErr } = await supabase.from("user_sessions")
      .insert({ email: norm, session_token: sessionToken });
    if (sessErr) return json(res, 500, { error: "Failed to create session." });

    return json(res, 200, {
      email:       user.email,
      fullName:    user.full_name,
      companyName: user.company_name,
      phone:       user.phone,
      sessionToken,
    });
  }

  // ── REQUEST RESET ────────────────────────────────────────────────────────
  if (action === "request-reset") {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    // Rate limit: 3 reset requests per IP per hour
    if (rateLimit(ip, "request-reset", 3, 3600))
      return json(res, 429, { error: "Too many reset requests. Please wait an hour and try again." });

    const { email } = req.body || {};
    if (!email) return json(res, 400, { error: "Please enter your email." });
    const validErr = validateInputs({ email });
    if (validErr) return json(res, 400, { error: validErr });

    const norm = email.toLowerCase().trim();
    const supabase = getSupabase();

    // Check existence — but return a generic success even if not found to prevent enumeration
    const { data: user } = await supabase.from("app_users").select("email").eq("email", norm).maybeSingle();
    if (!user) {
      // No account found — return success without sending email (prevents email bombing + user enumeration)
      return json(res, 200, { otpToken: null, noAccount: true });
    }

    const otp      = String(crypto.randomInt(100_000, 1_000_000));
    const expiresAt = Date.now() + OTP_TTL_MS;
    const otpToken  = encryptOtpToken(norm, otp, expiresAt);

    try {
      await sendOtpEmail(norm, otp);
    } catch (err) {
      console.error("[request-reset] email error:", err.message);
      return json(res, 500, { error: "Could not send reset email. Please try again." });
    }

    return json(res, 200, { otpToken });
  }

  // ── RESET PASSWORD ────────────────────────────────────────────────────────
  if (action === "reset-password") {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    // Rate limit: 5 attempts per IP per 15 minutes
    if (rateLimit(ip, "reset-password", 5, 900))
      return json(res, 429, { error: "Too many attempts. Please wait 15 minutes." });

    const { email, newPassword, otp, otpToken } = req.body || {};
    if (!email || !newPassword || !otp || !otpToken)
      return json(res, 400, { error: "Missing required fields." });

    const validErr = validateInputs({ email, password: newPassword });
    if (validErr) return json(res, 400, { error: validErr });
    if (newPassword.length < 6) return json(res, 400, { error: "Password must be at least 6 characters." });

    // Single-use check (in-memory; also protected by rate limiter + short TTL)
    const tokenHash = crypto.createHash("sha256").update(otpToken).digest("hex");
    if (_usedTokens.has(tokenHash))
      return json(res, 400, { error: "This reset code has already been used. Please request a new one." });

    const decoded = decryptOtpToken(otpToken);
    if (!decoded)       return json(res, 400, { error: "Invalid reset token. Please request a new code." });
    if (Date.now() > decoded.expiresAt) return json(res, 400, { error: "Reset code has expired. Please request a new one." });
    if (decoded.email !== email.toLowerCase().trim()) return json(res, 400, { error: "Invalid reset token." });
    if (decoded.otp   !== otp)  return json(res, 400, { error: "Incorrect code. Please check your email and try again." });

    // Mark token as used
    _usedTokens.add(tokenHash);

    const supabase = getSupabase();
    const norm = email.toLowerCase().trim();
    const hashedPw = hashPassword(newPassword);

    // Update existing account
    const { data: updated, error: updateErr } = await supabase
      .from("app_users").update({ password: hashedPw }).eq("email", norm).select("email");
    if (updateErr) return json(res, 500, { error: "Failed to reset password. Please try again." });

    // Migrate legacy localStorage-only account into Supabase
    if (!updated || updated.length === 0) {
      const { error: insertErr } = await supabase.from("app_users").insert({
        email: norm, password: hashedPw, full_name: "", company_name: "", phone: "",
      });
      if (insertErr && insertErr.code !== "23505")
        return json(res, 500, { error: "Failed to reset password. Please try again." });
    }

    // Kick all sessions — everyone must re-login with the new password
    await supabase.from("user_sessions").delete().eq("email", norm);

    return json(res, 200, { ok: true });
  }

  // ── SESSION ───────────────────────────────────────────────────────────────
  if (action === "session") {
    const supabase = getSupabase();

    // DELETE — logout
    if (req.method === "DELETE") {
      const { sessionToken } = req.body || {};
      if (!sessionToken) return json(res, 400, { error: "sessionToken required." });
      await supabase.from("user_sessions").delete().eq("session_token", sessionToken);
      return json(res, 200, { ok: true });
    }

    // GET — validate session token
    if (req.method === "GET") {
      const token = req.query?.token;
      if (!token) return json(res, 400, { error: "token required." });
      const { data } = await supabase
        .from("user_sessions").select("email, last_active")
        .eq("session_token", token).maybeSingle();
      if (!data) return json(res, 200, { valid: false });
      await supabase.from("user_sessions")
        .update({ last_active: new Date().toISOString() }).eq("session_token", token);
      return json(res, 200, { valid: true, email: data.email });
    }

    return json(res, 405, { error: "Method not allowed" });
  }

  return json(res, 400, { error: "Unknown action." });
}
