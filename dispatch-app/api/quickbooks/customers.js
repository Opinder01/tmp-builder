import { requireRole } from "../_lib/auth.js";
import { setCors, json } from "../_lib/cors.js";
import { qboQuery, qboFetch } from "../_lib/qbo.js";

function escapeQboString(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const admin = await requireRole(req, res, "admin");
  if (!admin) return;

  const action = req.query?.action;

  if (action === "search" && req.method === "GET") {
    const term = req.query?.q || "";
    if (!term) return json(res, 400, { error: "q is required" });

    try {
      const data = await qboQuery(
        `SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${escapeQboString(term)}%' MAXRESULTS 20`
      );
      const customers = (data.QueryResponse?.Customer || []).map((c) => ({
        id: c.Id,
        name: c.DisplayName,
      }));
      return json(res, 200, { customers });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  if (action === "create" && req.method === "POST") {
    const { name } = req.body || {};
    if (!name) return json(res, 400, { error: "name is required" });

    try {
      const data = await qboFetch("/customer", { method: "POST", body: { DisplayName: name } });
      return json(res, 201, { customer: { id: data.Customer.Id, name: data.Customer.DisplayName } });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  return json(res, 404, { error: "Unknown action" });
}
