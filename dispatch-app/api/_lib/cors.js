// APP_ORIGIN may be a comma-separated list (e.g. laptop + a phone hitting the
// dev server over the local network) — split on commas, trim whitespace.
const ALLOWED_ORIGINS = new Set(
  [
    ...(process.env.APP_ORIGIN || "").split(",").map((s) => s.trim()),
    "http://localhost:5173",
    "http://localhost:3000",
  ].filter(Boolean)
);

export function setCors(req, res) {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
