import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function Login() {
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email || !password) { setError("Please enter email and password."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading(true);

    let userData = null;

    // ── Step 1: Try Supabase via API (primary source of truth) ────────────────
    try {
      const res = await fetch("/api/auth?action=login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.email) {
        userData = {
          email:       data.email,
          fullName:    data.fullName    || "",
          companyName: data.companyName || "",
          phone:       data.phone       || "",
        };
      } else if (res.status === 401) {
        // Valid response — wrong credentials (don't fall back to localStorage)
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }
      // Any other error (500, network, etc.) → fall through to localStorage
    } catch {
      // Network error — fall through to localStorage fallback
    }

    // ── Step 2: localStorage fallback for accounts created before Supabase ───
    if (!userData) {
      const users = JSON.parse(localStorage.getItem("users") || "[]");
      const found = users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase() && u.password === password
      );
      if (found) {
        // Omit password from the stored session object
        const { password: _pw, ...rest } = found;
        userData = rest;
      }
    }

    if (!userData) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    // ── Step 3: Create session (device limit check) ───────────────────────────
    try {
      const sessionRes = await fetch("/api/auth?action=session", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: userData.email }),
      });
      const sessionData = await sessionRes.json().catch(() => ({}));

      if (!sessionRes.ok) {
        if (sessionData?.code === "MAX_DEVICES_REACHED") {
          setError(sessionData.error);
        } else {
          setError("Login failed. Please try again.");
        }
        setLoading(false);
        return;
      }

      // Store session token for this device
      if (sessionData.sessionToken) {
        localStorage.setItem("sessionToken", sessionData.sessionToken);
      }
    } catch {
      // If session API is unreachable, allow login (graceful degradation)
      console.warn("[Login] session API unreachable — proceeding without session tracking");
    }

    // ── Step 4: Hydrate subscription status ───────────────────────────────────
    let hydratedUser = { ...userData };
    try {
      const res = await fetch(`/api/subscription-status?email=${encodeURIComponent(userData.email)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.subscribed === true) {
          hydratedUser.subscribed           = true;
          hydratedUser.plan                 = data.plan                 ?? userData.plan;
          hydratedUser.stripeCustomerId     = data.stripeCustomerId     ?? userData.stripeCustomerId;
          hydratedUser.stripeSubscriptionId = data.stripeSubscriptionId ?? userData.stripeSubscriptionId;
        }
      }
    } catch {
      // Network error — subscription check done by ProtectedRoute
    }

    localStorage.setItem("loggedInUser", JSON.stringify(hydratedUser));
    navigate("/dashboard");
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    padding: "9px 12px", fontSize: 13,
    border: "1.5px solid #e2e8f0", borderRadius: 8,
    outline: "none", fontFamily: "inherit",
    background: "#f8fafc", color: "#0f172a",
  };

  const EyeIcon = ({ open }) => open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );

  return (
    <AuthLayout title="Sign In">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="email" placeholder="Email Address"
          value={email} onChange={(e) => setEmail(e.target.value)}
          disabled={loading} style={inputStyle}
        />

        <div style={{ position: "relative", width: "100%" }}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={{ ...inputStyle, paddingRight: 36 }}
          />
          <button
            type="button" tabIndex={-1}
            onClick={() => setShowPassword(v => !v)}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", padding: 0,
              color: "#94a3b8", display: "flex", alignItems: "center",
            }}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>

        {error && <p style={{ color: "crimson", margin: 0, fontSize: 12 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "10px", fontSize: 14, fontWeight: 600,
          background: "linear-gradient(135deg,#f97316,#ea580c)",
          color: "#fff", border: "none", borderRadius: 8,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1, marginTop: 4,
        }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
          <a href="/forgot-password" style={{ color: "#f97316" }}>Forgot Password?</a>
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
          New user? <a href="/signup" style={{ color: "#f97316", fontWeight: 600 }}>Create Account</a>
        </p>
      </form>
    </AuthLayout>
  );
}
