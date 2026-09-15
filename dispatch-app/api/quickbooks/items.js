import { requireRole } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { qboQuery } from "../_lib/qbo.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

  if (req.query?.action === "list" && req.method === "GET") {
    try {
      const data = await qboQuery(
        `SELECT Id, Name FROM Item WHERE Type = 'Service' MAXRESULTS 100`
      );
      const items = (data.QueryResponse?.Item || []).map((i) => ({ id: i.Id, name: i.Name }));
      return json(res, 200, { items });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  return json(res, 404, { error: "Unknown action" });
}
