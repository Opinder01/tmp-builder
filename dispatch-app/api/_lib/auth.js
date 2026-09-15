import { getSupabaseAdmin } from "./supabase.js";

// Resolves the calling user's Supabase session from the Authorization header
// and loads their profile row. Returns null if the token is missing/invalid.
export async function getSessionProfile(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile) return null;

  return profile;
}

// Throws-by-response: writes a 401/403 and returns null if the check fails,
// so callers can `if (!profile) return;` immediately after.
export async function requireRole(req, res, role) {
  const profile = await getSessionProfile(req);
  if (!profile) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not authenticated" }));
    return null;
  }
  if (role && profile.role !== role) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Forbidden" }));
    return null;
  }
  return profile;
}
