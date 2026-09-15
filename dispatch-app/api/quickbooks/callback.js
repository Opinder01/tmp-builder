import { verifyState } from "../_lib/crypto.js";
import { saveConnection } from "../_lib/qbo.js";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function defaultOrigin() {
  return (process.env.APP_ORIGIN || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");
}

function redirectTo(res, path, origin) {
  res.statusCode = 302;
  res.setHeader("Location", `${(origin || defaultOrigin()).replace(/\/$/, "")}${path}`);
  res.end();
}

// Hit directly by the browser as a raw redirect from Intuit — no
// Authorization header is present, so the signed `state` param (created in
// connect.js) is the only thing standing between this endpoint and a forged
// callback. No CORS needed either; this is a top-level navigation, not a fetch.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const { code, state, realmId, error: oauthError } = req.query || {};

  if (oauthError) {
    return redirectTo(res, `/quickbooks?error=${encodeURIComponent(oauthError)}`);
  }

  const statePayload = state ? verifyState(state) : null;
  if (!statePayload) {
    return redirectTo(res, "/quickbooks?error=invalid_state");
  }

  if (!code || !realmId) {
    return redirectTo(res, "/quickbooks?error=missing_code_or_realm");
  }

  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.QBO_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[quickbooks/callback] token exchange failed:", body);
      return redirectTo(res, "/quickbooks?error=token_exchange_failed", statePayload.returnOrigin);
    }

    const tokens = await tokenRes.json();
    await saveConnection({
      realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      refreshExpiresIn: tokens.x_refresh_token_expires_in,
      connectedBy: statePayload.adminId,
    });

    return redirectTo(res, "/quickbooks?connected=1", statePayload.returnOrigin);
  } catch (err) {
    console.error("[quickbooks/callback]", err);
    return redirectTo(res, "/quickbooks?error=unexpected", statePayload.returnOrigin);
  }
}
