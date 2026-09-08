function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// This endpoint has been disabled. Password reset OTPs are now sent
// directly by the auth API (?action=request-reset) which includes
// rate limiting, encryption, and proper validation.
export default function handler(req, res) {
  return json(res, 410, { error: "This endpoint has been removed." });
}
