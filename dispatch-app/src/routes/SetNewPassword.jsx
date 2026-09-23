import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { api } from "../lib/api.js";
import crownLogo from "../assets/crown-logo.png";

export default function SetNewPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await api.post("/api/account?action=password-changed");
      // AuthProvider's session/profile state doesn't auto-refresh the profile
      // row on its own here, so reload to pick up must_change_password=false.
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={crownLogo} alt="Crown Traffic Management Ltd." className="login-logo" />
        <h1>Set Your Password</h1>
        <p className="login-subtitle">
          For your account's security, please set a new password only you know.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Set Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
