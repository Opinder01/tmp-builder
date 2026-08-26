import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email,           setEmail]           = useState("");
  const [otp,             setOtp]             = useState("");
  const [otpToken,        setOtpToken]        = useState("");   // encrypted server token
  const [otpSent,         setOtpSent]         = useState(false);
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState("");
  const [success,         setSuccess]         = useState("");
  const [redirectToLogin, setRedirectToLogin] = useState(false);
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [sendingOtp,      setSendingOtp]      = useState(false);
  const [resetting,       setResetting]       = useState(false);

  useEffect(() => {
    if (!redirectToLogin) return;
    const t = setTimeout(() => navigate("/login"), 1200);
    return () => clearTimeout(t);
  }, [redirectToLogin, navigate]);

  async function handleSendOtp(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!email) { setError("Please enter your email."); return; }

    setSendingOtp(true);
    try {
      const res = await fetch("/api/auth?action=request-reset", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Error (${res.status})`);

      // noAccount: true means no account found — show same message to prevent email enumeration
      setOtpToken(data.otpToken || "");
      setOtpSent(true);
      setSuccess("If an account exists for that email, a 6-digit code has been sent. It expires in 10 minutes.");
    } catch (err) {
      setError(err.message || "Could not send reset email. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!otpSent)                         { setError("Please send OTP first."); return; }
    if (!otpToken)                        { setError("No account found with that email address."); return; }
    if (!otp)                             { setError("Please enter the OTP."); return; }
    if (!newPassword || !confirmPassword) { setError("Please enter and confirm your new password."); return; }
    if (newPassword.length < 6)           { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword)  { setError("Passwords do not match."); return; }

    setResetting(true);
    try {
      const res = await fetch("/api/auth?action=reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, otp, otpToken, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to reset password. Please try again.");

      setSuccess("Password reset ✅ Redirecting to sign in…");
      setRedirectToLogin(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
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

  const eyeBtn = {
    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer", padding: 0,
    color: "#94a3b8", display: "flex", alignItems: "center",
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
    <AuthLayout title="Reset Password">
      {/* Step 1 */}
      <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <input
          type="email" placeholder="Your email address"
          value={email} onChange={(e) => setEmail(e.target.value)}
          style={inputStyle} disabled={sendingOtp || otpSent}
        />
        <button type="submit" style={btnStyle()} disabled={sendingOtp || otpSent}>
          {sendingOtp ? "Sending…" : otpSent ? "Code Sent ✓" : "Send OTP"}
        </button>
        {otpSent && (
          <button
            type="button"
            onClick={() => { setOtpSent(false); setOtp(""); setOtpToken(""); setSuccess(""); setError(""); }}
            style={{ ...btnStyle("#64748b"), marginTop: -4 }}
          >
            Resend / Change Email
          </button>
        )}
      </form>

      {/* Step 2 */}
      <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
        <input
          placeholder="6-digit OTP" value={otp}
          onChange={(e) => setOtp(e.target.value)} style={inputStyle}
          disabled={!otpSent}
        />

        <div style={{ position: "relative", width: "100%" }}>
          <input
            type={showNew ? "text" : "password"}
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: 36 }}
            disabled={!otpSent}
          />
          <button type="button" style={eyeBtn} onClick={() => setShowNew(v => !v)} tabIndex={-1}>
            <EyeIcon open={showNew} />
          </button>
        </div>

        <div style={{ position: "relative", width: "100%" }}>
          <input
            type={showConfirm ? "text" : "password"}
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: 36 }}
            disabled={!otpSent}
          />
          <button type="button" style={eyeBtn} onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
            <EyeIcon open={showConfirm} />
          </button>
        </div>

        {error   && <p style={{ color: "crimson", margin: 0, fontSize: 12 }}>{error}</p>}
        {success && <p style={{ color: "#16a34a", margin: 0, fontSize: 12 }}>{success}</p>}

        <button type="submit" style={btnStyle("#1e3a5f")} disabled={resetting || !otpSent}>
          {resetting ? "Resetting…" : "Reset Password"}
        </button>

        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
          Back to{" "}
          <a href="/login" style={{ color: "#f97316", fontWeight: 600 }}>Sign In</a>
        </p>
      </form>
    </AuthLayout>
  );
}
