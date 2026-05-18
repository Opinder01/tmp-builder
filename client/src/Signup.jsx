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
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    if (!fullName || !companyName || !phone || !email || !password || !confirmPassword) {
      setError("Please fill all fields."); return;
    }
    if (!email.includes("@")) { setError("Please enter a valid email."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    const users = JSON.parse(localStorage.getItem("users") || "[]");
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      setError("Account already exists with this email."); return;
    }

    const newUser = { fullName, companyName, phone, email, password };
    users.push(newUser);
    localStorage.setItem("users", JSON.stringify(users));
    localStorage.setItem("loggedInUser", JSON.stringify(newUser));
    setError("");
    navigate("/subscribe", { replace: true });
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    padding: "9px 12px", fontSize: 13,
    border: "1.5px solid #e2e8f0", borderRadius: 8,
    outline: "none", fontFamily: "inherit",
    background: "#f8fafc", color: "#0f172a",
  };

  return (
    <AuthLayout title="Create Account">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <input placeholder="Full Name"     value={fullName}    onChange={(e) => setFullName(e.target.value)}    style={inputStyle} />
        <input placeholder="Company Name"  value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
        <input type="tel" placeholder="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)}   style={inputStyle} />
        <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />

        {error && <p style={{ color: "crimson", margin: 0, fontSize: 12 }}>{error}</p>}

        <button type="submit" style={{
          width: "100%", padding: "10px", fontSize: 14, fontWeight: 600,
          background: "linear-gradient(135deg,#f97316,#ea580c)",
          color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 2,
        }}>
          Create Account
        </button>

        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "#f97316", fontWeight: 600 }}>Sign In</a>
        </p>
      </form>
    </AuthLayout>
  );
}
