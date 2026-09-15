import { requireRole } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { signState } from "../_lib/crypto.js";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return json(res, 500, { error: "QBO_CLIENT_ID / QBO_REDIRECT_URI are not configured." });
  }

  // Redirect back to whichever device/origin actually started this flow
  // (laptop or a phone on the local network), rather than guessing from a
  // single static APP_ORIGIN.
  const returnOrigin = req.headers.origin || process.env.APP_ORIGIN?.split(",")[0]?.trim();
  const state = signState({ adminId: admin.id, returnOrigin });

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  url.searchParams.set("state", state);

  return json(res, 200, { url: url.toString() });
}
