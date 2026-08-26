import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function Signup() {
  const [fullName,        setFullName]        = useState("");
  const [companyName,     setCompanyName]     = useState("");
  const [phone,           setPhone]           = useState("");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState("");
  const [loading,         setLoading]         = useState(false);
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!fullName || !companyName || !phone || !email || !password || !confirmPassword) {
      setError("Please fill all fields."); return;
    }
    if (!email.includes("@")) { setError("Please enter a valid email."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth?action=register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password, fullName, companyName, phone }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Failed to create account. Please try again.");
        return;
      }

      // Save user info to localStorage (no password stored)
      const newUser = { fullName, companyName, phone, email: email.toLowerCase() };
      localStorage.setItem("loggedInUser", JSON.stringify(newUser));

      navigate("/subscribe", { replace: true });
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    padding: "9px 12px", fontSize: 13,
    border: "1.5px solid #e2e8f0", borderRadius: 8,
    outline: "none", fontFamily: "inherit",
    background: "#f8fafc", color: "#0f172a",
  };

  const pwWrap = { position: "relative", width: "100%" };
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
    <AuthLayout title="Create Account">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <input placeholder="Full Name"    value={fullName}    onChange={(e) => setFullName(e.target.value)}    style={inputStyle} disabled={loading} />
        <input placeholder="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} disabled={loading} />
        <input type="tel" placeholder="Phone Number"   value={phone} onChange={(e) => setPhone(e.target.value)}   style={inputStyle} disabled={loading} />
        <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} disabled={loading} />

        {/* Password */}
        <div style={pwWrap}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: 36 }}
            disabled={loading}
          />
          <button type="button" style={eyeBtn} onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
            <EyeIcon open={showPassword} />
          </button>
        </div>

        {/* Confirm Password */}
        <div style={pwWrap}>
          <input
            type={showConfirm ? "text" : "password"}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: 36 }}
            disabled={loading}
          />
          <button type="button" style={eyeBtn} onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
            <EyeIcon open={showConfirm} />
          </button>
        </div>

        {error && <p style={{ color: "crimson", margin: 0, fontSize: 12 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "10px", fontSize: 14, fontWeight: 600,
          background: "linear-gradient(135deg,#f97316,#ea580c)",
          color: "#fff", border: "none", borderRadius: 8,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1, marginTop: 2,
        }}>
          {loading ? "Creating account…" : "Create Account"}
        </button>

        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "#f97316", fontWeight: 600 }}>Sign In</a>
        </p>
      </form>
    </AuthLayout>
  );
}
