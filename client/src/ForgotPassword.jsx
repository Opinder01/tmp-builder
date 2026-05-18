import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email,           setEmail]           = useState("");
  const [otp,             setOtp]             = useState("");
  const [generatedOtp,    setGeneratedOtp]    = useState("");
  const [otpSent,         setOtpSent]         = useState(false);
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState("");
  const [success,         setSuccess]         = useState("");
  const [redirectToLogin, setRedirectToLogin] = useState(false);

  useEffect(() => {
    if (!redirectToLogin) return;
    const t = setTimeout(() => navigate("/login"), 1200);
    return () => clearTimeout(t);
  }, [redirectToLogin, navigate]);

  async function handleSendOtp(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!email) { setError("Please enter your email."); return; }

    const users = JSON.parse(localStorage.getItem("users") || "[]");
    if (!users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      setError("No account found with this email."); return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    try {
      const res  = await fetch("/api/send-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });
      let data;
      try { data = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok) throw new Error(data?.error || `Server error (${res.status}).`);
      setGeneratedOtp(code);
      setOtpSent(true);
      setSuccess("A 6-digit code has been sent to your email.");
    } catch (err) {
      setError(err.message || "Could not send OTP. Please try again.");
    }
  }

  function handleReset(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!otpSent)                        { setError("Please send OTP first."); return; }
    if (!otp)                            { setError("Please enter the OTP."); return; }
    if (otp !== generatedOtp)            { setError("Invalid OTP."); return; }
    if (!newPassword || !confirmPassword){ setError("Please enter and confirm your new password."); return; }
    if (newPassword.length < 6)          { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }

    const users = JSON.parse(localStorage.getItem("users") || "[]");
    localStorage.setItem("users", JSON.stringify(
      users.map((u) => u.email.toLowerCase() === email.toLowerCase() ? { ...u, password: newPassword } : u)
    ));
    setSuccess("Password reset ✅ Redirecting to sign in…");
    setRedirectToLogin(true);
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    padding: "9px 12px", fontSize: 13,
    border: "1.5px solid #e2e8f0", borderRadius: 8,
    outline: "none", fontFamily: "inherit",
    background: "#f8fafc", color: "#0f172a",
  };

  const btnStyle = (color = "#f97316") => ({
    width: "100%", padding: "10px", fontSize: 14, fontWeight: 600,
    background: `linear-gradient(135deg,${color},${color === "#f97316" ? "#ea580c" : "#0f172a"})`,
    color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
  });

  return (
    <AuthLayout title="Reset Password">
      {/* Step 1 — enter email + send OTP */}
      <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <input
          type="email" placeholder="Your email address"
          value={email} onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" style={btnStyle()}>Send OTP</button>
      </form>

      {/* Step 2 — enter OTP + new password */}
      <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
        <input
          placeholder="6-digit OTP" value={otp}
          onChange={(e) => setOtp(e.target.value)} style={inputStyle}
        />
        <input
          type="password" placeholder="New Password"
          value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password" placeholder="Confirm New Password"
          value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          style={inputStyle}
        />

        {error   && <p style={{ color: "crimson", margin: 0, fontSize: 12 }}>{error}</p>}
        {success && <p style={{ color: "#16a34a", margin: 0, fontSize: 12 }}>{success}</p>}

        <button type="submit" style={btnStyle("#1e3a5f")}>Reset Password</button>

        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
          Back to{" "}
          <a href="/login" style={{ color: "#f97316", fontWeight: 600 }}>Sign In</a>
        </p>
      </form>
    </AuthLayout>
  );
}
