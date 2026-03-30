import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();

    // Basic validation
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

    // Success login
    setError("");

    // Save logged-in user (simple auth state)
    localStorage.setItem("loggedInUser", JSON.stringify(user));

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
        />
        <br /><br />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br /><br />

        {error && (
          <p style={{ color: "crimson", marginTop: 0 }}>{error}</p>
        )}

        <button type="submit">Sign In</button>

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
