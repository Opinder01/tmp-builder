import { requireRole } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { getConnection } from "../_lib/qbo.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

  const connection = await getConnection();
  if (!connection) return json(res, 200, { connected: false });

  return json(res, 200, {
    connected: true,
    environment: connection.environment,
    realmId: connection.realm_id,
    connectedAt: connection.connected_at,
    refreshTokenExpiresAt: connection.refresh_token_expires_at,
    refreshTokenExpired: new Date(connection.refresh_token_expires_at) < new Date(),
  });
}
