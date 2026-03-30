import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();

    // Basic validation
    if (!fullName || !companyName || !phone || !email || !password || !confirmPassword) {
      setError("Please fill all fields.");
      return;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Local demo storage (no backend yet)
    const users = JSON.parse(localStorage.getItem("users") || "[]");

    const alreadyExists = users.some(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (alreadyExists) {
      setError("Account already exists with this email.");
      return;
    }

    const newUser = {
      fullName,
      companyName,
      phone,
      email,
      password,
    };
    users.push(newUser);

    localStorage.setItem("users", JSON.stringify(users));

    setError("");

    // Auto-login immediately using the same session storage key as Login.jsx.
    localStorage.setItem("loggedInUser", JSON.stringify(newUser));

    // Redirect to subscription flow without requiring manual sign-in again.
    navigate("/subscribe", { replace: true });

    // Optional: clear fields after signup
    setFullName("");
    setCompanyName("");
    setPhone("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <AuthLayout title="Create Account">
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <br /><br />

        <input
          placeholder="Company Name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
        <br /><br />

        <input
          type="tel"
          placeholder="Phone Number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <br /><br />

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

        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <br /><br />

        {error ? (
          <p style={{ color: "crimson", marginTop: 0 }}>{error}</p>
        ) : null}

        <button type="submit">Create Account</button>

        <p style={{ marginTop: 20 }}>
          Already have an account? <a href="/login">Sign In</a>
        </p>
      </form>
    </AuthLayout>
  );
}
