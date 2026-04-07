import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [redirectToLogin, setRedirectToLogin] = useState(false);

  // Navigate to /login 1.2 s after a successful reset — inside useEffect so
  // navigate() is never called during a render or an async gap between renders.
  useEffect(() => {
    if (!redirectToLogin) return;
    const timer = setTimeout(() => navigate("/login"), 1200);
    return () => clearTimeout(timer);
  }, [redirectToLogin, navigate]);

  async function handleSendOtp(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!email) {
      setError("Please enter your email.");
      return;
    }

    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const userExists = users.some(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (!userExists) {
      setError("No account found with this email.");
      return;
    }

    // Generate OTP and send via backend email service
    const code = String(Math.floor(100000 + Math.random() * 900000));

    try {
      const res = await fetch("/api/send-otp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send OTP.");
      setGeneratedOtp(code);
      setOtpSent(true);
      setSuccess("A 6-digit code has been sent to your email address.");
    } catch (err) {
      setError(err.message || "Could not send OTP. Please try again.");
    }
  }

  function handleResetPassword(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!otpSent) {
      setError("Please send OTP first.");
      return;
    }

    if (!otp) {
      setError("Please enter the OTP.");
      return;
    }

    if (otp !== generatedOtp) {
      setError("Invalid OTP.");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError("Please enter new password and confirm password.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Update password in localStorage users
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const updatedUsers = users.map((u) => {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        return { ...u, password: newPassword };
      }
      return u;
    });

    localStorage.setItem("users", JSON.stringify(updatedUsers));

    setSuccess("Password reset ✅ You can sign in now.");
    setRedirectToLogin(true);
  }

  return (
    <AuthLayout title="Forgot Password">
      <form onSubmit={handleSendOtp}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br /><br />
        <button type="submit">Send OTP</button>
      </form>

      <br />

      <form onSubmit={handleResetPassword}>
        <input
          placeholder="Enter OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
        />
        <br /><br />

        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <br /><br />

        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <br /><br />

        {error && <p style={{ color: "crimson", marginTop: 0 }}>{error}</p>}
        {success && <p style={{ color: "green", marginTop: 0 }}>{success}</p>}

        <button type="submit">Reset Password</button>

        <p style={{ marginTop: 16 }}>
          Back to <a href="/login">Sign In</a>
        </p>
      </form>
    </AuthLayout>
  );
}
