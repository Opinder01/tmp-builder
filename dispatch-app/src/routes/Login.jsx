import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import crownLogo from "../assets/crown-logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    }
    // On success, AuthProvider's onAuthStateChange listener picks up the new
    // session automatically — no need to handle it here.
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={crownLogo} alt="Crown Traffic Management Ltd." className="login-logo" />
        <h1>Welcome to Crown Traffic</h1>
        <p className="login-subtitle">Dispatch &amp; Timesheet Portal</p>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="hint">
          Accounts are created by your admin — there is no public sign-up.
        </p>
      </div>
    </div>
  );
}
