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

  return (
    <AuthLayout title="Sign In">
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        <br /><br />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
        <br /><br />

        {error && (
          <p style={{ color: "crimson", marginTop: 0 }}>{error}</p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <p style={{ marginTop: 16 }}>
          <a href="/forgot-password">Forgot Password?</a>
        </p>

        <p>
          New user? <a href="/signup">Create Account</a>
        </p>
      </form>
    </AuthLayout>
  );
}
