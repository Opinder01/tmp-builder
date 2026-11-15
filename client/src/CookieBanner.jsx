import { useEffect, useState } from "react";

export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem("cookieConsent");
    if (!v) setShow(true);
  }, []);

  const acceptAll = () => {
    localStorage.setItem("cookieConsent", "accepted");
    setShow(false);
  };

  const rejectNonEssential = () => {
    localStorage.setItem("cookieConsent", "rejected");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0,
      background: "#0f172a",
      borderTop: "1px solid #1e293b",
      padding: "16px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 16,
      zIndex: 9999,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
    }}>
      <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", flex: "1 1 300px", lineHeight: 1.5 }}>
        🍪 We use cookies to keep you signed in and improve your experience.{" "}
        <a href="/privacy" style={{ color: "#f97316", textDecoration: "none", fontWeight: 500 }}>Privacy Policy</a>
      </p>
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          onClick={rejectNonEssential}
          style={{
            padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: "transparent", border: "1px solid #334155", color: "#94a3b8", cursor: "pointer",
          }}
        >
          Reject non-essential
        </button>
        <button
          onClick={acceptAll}
          style={{
            padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none", color: "#fff", cursor: "pointer",
          }}
        >
          Accept All
        </button>
      </div>
    </div>
  );
}
