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
      position: "fixed", left: 16, right: 16, bottom: 16,
      border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white"
    }}>
      <b>Cookies</b>
      <p style={{ marginTop: 8 }}>
        We use cookies to keep you signed in and to improve your experience.
        You can accept all cookies or reject non-essential cookies.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={acceptAll} style={{ padding: 10, borderRadius: 10, border: "none" }}>Accept</button>
        <button onClick={rejectNonEssential} style={{ padding: 10, borderRadius: 10 }}>
          Reject non-essential
        </button>
        <a href="/privacy" style={{ alignSelf: "center" }}>Privacy & Cookies</a>
      </div>
    </div>
  );
}
