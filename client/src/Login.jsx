import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function Login() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    // Read users from localStorage
    const users = JSON.parse(localStorage.getItem("users") || "[]");

    // Find matching user
    const user = users.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() &&
        u.password === password
    );

    if (!user) {
      setError("Invalid email or password.");
      return;
    }

    setError("");
    setLoading(true);

    // Hydrate subscription status from the API so ProtectedRoute
    // never bounces a subscribed user to /subscribe on first load.
    let hydratedUser = { ...user };
    try {
      const res = await fetch(
        `/api/subscription-status?email=${encodeURIComponent(user.email)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.subscribed === true) {
          hydratedUser.subscribed           = true;
          hydratedUser.plan                 = data.plan                 ?? user.plan;
          hydratedUser.stripeCustomerId     = data.stripeCustomerId     ?? user.stripeCustomerId;
          hydratedUser.stripeSubscriptionId = data.stripeSubscriptionId ?? user.stripeSubscriptionId;

          // Persist into users array so future logins start with subscribed: true
          // even if the API is temporarily unavailable.
          try {
            const allUsers = JSON.parse(localStorage.getItem("users") || "[]");
            const updatedUsers = allUsers.map((u) =>
              u.email?.toLowerCase() === hydratedUser.email?.toLowerCase()
                ? { ...u, subscribed: true, plan: hydratedUser.plan }
                : u
            );
            localStorage.setItem("users", JSON.stringify(updatedUsers));
          } catch {
            // non-critical
          }
        }
      }
    } catch {
      // Network error — ProtectedRoute will retry and fall back to localStorage
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

  const btnStyle = {
    width: "100%", padding: "10px", fontSize: 14, fontWeight: 600,
    background: "linear-gradient(135deg,#f97316,#ea580c)",
    color: "#fff", border: "none", borderRadius: 8,
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1, marginTop: 4,
  };

  return (
    <AuthLayout title="Sign In">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="email" placeholder="Email Address"
          value={email} onChange={(e) => setEmail(e.target.value)}
          disabled={loading} style={inputStyle}
        />
        <input
          type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          disabled={loading} style={inputStyle}
        />

        {error && <p style={{ color: "crimson", margin: 0, fontSize: 12 }}>{error}</p>}

        <button type="submit" disabled={loading} style={btnStyle}>
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
