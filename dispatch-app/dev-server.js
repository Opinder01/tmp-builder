/**
 * dev-server.js — local API server for the api/*.js serverless functions
 *
 * Usage (two terminals):
 *   Terminal 1:  npm run api
 *   Terminal 2:  npm run dev
 *
 * Then open: http://localhost:5173
 * (Vite proxies /api/* -> localhost:3000, see vite.config.js)
 */

import { createServer } from "node:http";

const PORT = 3000;

const routes = {
  "/api/workers": () => import("./api/workers.js"),
  "/api/client-companies": () => import("./api/client-companies.js"),
  "/api/dispatches": () => import("./api/dispatches.js"),
  "/api/timesheets": () => import("./api/timesheets.js"),
  "/api/uploads": () => import("./api/uploads.js"),
  "/api/push": () => import("./api/push.js"),
  "/api/cron/reminders": () => import("./api/cron/reminders.js"),
  "/api/quickbooks/connect": () => import("./api/quickbooks/connect.js"),
  "/api/quickbooks/callback": () => import("./api/quickbooks/callback.js"),
  "/api/quickbooks/status": () => import("./api/quickbooks/status.js"),
  "/api/quickbooks/customers": () => import("./api/quickbooks/customers.js"),
  "/api/quickbooks/items": () => import("./api/quickbooks/items.js"),
  "/api/quickbooks/sync-log": () => import("./api/quickbooks/sync-log.js"),
  "/api/quickbooks/contractor-bill": () => import("./api/quickbooks/contractor-bill.js"),
  "/api/quickbooks/customer-invoice": () => import("./api/quickbooks/customer-invoice.js"),
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  req.query = Object.fromEntries(url.searchParams.entries());

  if (req.method !== "GET" && req.method !== "OPTIONS") {
    const raw = await readBody(req);
    try {
      req.body = raw.length ? JSON.parse(raw.toString()) : {};
    } catch {
      req.body = {};
    }
  }

  const routeLoader = routes[url.pathname];
  if (!routeLoader) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `No handler for ${url.pathname}` }));
    return;
  }

  try {
    const mod = await routeLoader();
    await mod.default(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: err.message }));
    }
  }
});

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[dev-server] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — did you forget --env-file=.env?"
  );
}

server.listen(PORT, () => {
  console.log(`\nLocal API server running at http://localhost:${PORT}`);
  console.log(`   Now run (in another terminal): npm run dev`);
  console.log(`   Then open: http://localhost:5173\n`);
});
