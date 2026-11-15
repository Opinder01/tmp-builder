import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function TMPOrderSuccess() {
  const nav = useNavigate();
  const [params]  = useSearchParams();
  const sessionId = params.get("session_id");
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/tmp-drawing?action=order-status&session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => { if (d.order) setOrder(d.order); })
      .catch(() => {});
  }, [sessionId]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Inter,system-ui,-apple-system,Arial,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>

        {/* Success icon */}
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: "0 0 12px" }}>Order Confirmed!</h1>
        <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.6, margin: "0 0 32px" }}>
          Your payment was successful. Our team will begin drafting your traffic management plan and email it to you within <strong>2 days</strong>.
        </p>

        {order && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 28, textAlign: "left" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>Order Summary</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Customer", order.customer_name],
                ["Email", order.customer_email],
                ["Site", order.site_address],
                ["Work Type", order.work_type],
                ["Drawings", order.num_drawings],
              ].map(([label, val]) => val ? (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "#64748b" }}>{label}</span>
                  <span style={{ color: "#0f172a", fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{val}</span>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px", fontSize: 14, color: "#92400e", lineHeight: 1.6, marginBottom: 28 }}>
          A confirmation email has been sent to your email address. If you have questions, contact us at <strong>info@tmpbuilder.ca</strong>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => nav("/we-make-your-tmp")}
            style={{ background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none", borderRadius: 8, color: "#fff", padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Order Another TMP
          </button>
          <button
            onClick={() => nav("/")}
            style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#334155", padding: "12px 24px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
