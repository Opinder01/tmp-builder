import { getSupabaseAdmin } from "./supabase.js";
import { encrypt, decrypt } from "./crypto.js";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function apiBase() {
  return process.env.QBO_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export async function getConnection() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("quickbooks_connection").select("*").eq("id", 1).single();
  return data || null;
}

export async function saveConnection({ realmId, accessToken, refreshToken, expiresIn, refreshExpiresIn, connectedBy }) {
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const { error } = await supabase.from("quickbooks_connection").upsert({
    id: 1,
    realm_id: realmId,
    access_token: encrypt(accessToken),
    refresh_token: encrypt(refreshToken),
    access_token_expires_at: new Date(now + expiresIn * 1000).toISOString(),
    refresh_token_expires_at: new Date(now + refreshExpiresIn * 1000).toISOString(),
    connected_by: connectedBy,
    environment: process.env.QBO_ENVIRONMENT || "sandbox",
  });
  if (error) throw new Error(error.message);
}

async function refreshAccessToken(connection) {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(connection.refresh_token),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`QuickBooks token refresh failed (${res.status}): ${body}`);
  }

  const tokens = await res.json();
  await saveConnection({
    realmId: connection.realm_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    refreshExpiresIn: tokens.x_refresh_token_expires_in,
    connectedBy: connection.connected_by,
  });

  return tokens.access_token;
}

// Returns a valid access token, transparently refreshing if it's within 5
// minutes of expiry. Throws if there's no connection or the refresh token
// itself has expired (the caller should surface "reconnect QuickBooks").
export async function getValidAccessToken() {
  const connection = await getConnection();
  if (!connection) throw new Error("QuickBooks is not connected.");

  if (new Date(connection.refresh_token_expires_at) < new Date()) {
    throw new Error("QuickBooks connection has expired. Please reconnect.");
  }

  const expiresInMs = new Date(connection.access_token_expires_at) - Date.now();
  if (expiresInMs > 5 * 60 * 1000) {
    return { accessToken: decrypt(connection.access_token), realmId: connection.realm_id };
  }

  const accessToken = await refreshAccessToken(connection);
  return { accessToken, realmId: connection.realm_id };
}

// Minimal QBO Accounting API client: qboFetch("/query?query=...") or
// qboFetch("/invoice", { method: "POST", body: {...} }).
export async function qboFetch(path, { method = "GET", body } = {}) {
  const { accessToken, realmId } = await getValidAccessToken();
  const url = `${apiBase()}/v3/company/${realmId}${path}${path.includes("?") ? "&" : "?"}minorversion=65`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fault = data?.Fault?.Error?.[0];
    const message = fault
      ? [fault.Message, fault.Detail].filter(Boolean).join(" — ")
      : JSON.stringify(data);
    throw new Error(`QuickBooks API error (${res.status}): ${message}`);
  }
  return data;
}

export async function qboQuery(query) {
  return qboFetch(`/query?query=${encodeURIComponent(query)}`);
}
