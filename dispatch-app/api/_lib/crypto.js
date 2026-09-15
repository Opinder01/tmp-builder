import crypto from "node:crypto";

// Encrypts QuickBooks OAuth tokens at rest, mirroring the AES-256-GCM pattern
// already used for OTP tokens in client/api/auth.js.
function getKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  return crypto.scryptSync(secret, "dispatch_app_token_salt", 32);
}

export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decrypt(token) {
  const key = getKey();
  const buf = Buffer.from(token, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// Stateless, signed short-lived tokens for OAuth `state` params — lets a
// callback endpoint (hit by a raw browser redirect, no Authorization header)
// verify the flow was really initiated by an authenticated admin, without
// needing server-side session storage.
export function signState(payload, ttlMs = 10 * 60 * 1000) {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const body = JSON.stringify({ ...payload, exp: Date.now() + ttlMs });
  const bodyB64 = Buffer.from(body).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(bodyB64).digest("base64url");
  return `${bodyB64}.${sig}`;
}

export function verifyState(token) {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const [bodyB64, sig] = String(token).split(".");
  if (!bodyB64 || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", secret).update(bodyB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  const payload = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
  if (payload.exp < Date.now()) return null;
  return payload;
}
