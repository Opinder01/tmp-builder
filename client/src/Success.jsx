import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function Success() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function activate() {
      let stripeData = null;

      // Fetch real subscription data from Stripe via our backend
      if (sessionId) {
        try {
          const res = await fetch(
            `/api/stripe/get-session?session_id=${encodeURIComponent(sessionId)}`
          );
          if (res.ok) {
            stripeData = await res.json();
          } else {
            console.warn("[Success] get-session returned", res.status);
          }
        } catch (err) {
          console.warn("[Success] get-session fetch failed:", err.message);
        }
      }

      // Write subscription data into the logged-in user record in localStorage.
      // Falls back to a 7-day trial from now if the API call failed.
      try {
        const raw = localStorage.getItem("loggedInUser");
        if (raw) {
          const user = JSON.parse(raw);
          const trialEndsAt =
            stripeData?.trialEndsAt ??
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

          const updated = {
            ...user,
            // These three fields are what ProtectedRoute checks:
            plan: stripeData?.plan ?? "monthly",
            subscriptionStatus: "trial",
            trialEndsAt,
            // Extra Stripe identifiers — useful for future webhook reconciliation
            stripeSessionId:       sessionId                    ?? undefined,
            stripeCustomerId:      stripeData?.customerId       ?? undefined,
            stripeSubscriptionId:  stripeData?.subscriptionId   ?? undefined,
            stripeEmail:           stripeData?.email            ?? undefined,
          };

          localStorage.setItem("loggedInUser", JSON.stringify(updated));
          console.log(
            "[Success] User activated – plan:", updated.plan,
            "| trial ends:", updated.trialEndsAt
          );
        }
      } catch (err) {
        console.error("[Success] Failed to update localStorage:", err);
      }

      setReady(true);
    }

    activate();
  }, [sessionId]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 56 }}>🎉</div>
      <h1 style={{ margin: 0, fontSize: 28 }}>You're all set!</h1>
      <p style={{ margin: 0, color: "#555", maxWidth: 420 }}>
        Your 7-day free trial has started. No charge until the trial ends.
      </p>
      <button
        onClick={() => nav("/dashboard")}
        disabled={!ready}
        style={{
          marginTop: 8,
          padding: "12px 32px",
          fontSize: 16,
          fontWeight: 600,
          background: ready ? "#2563eb" : "#93c5fd",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: ready ? "pointer" : "default",
          transition: "background 0.2s",
        }}
      >
        {ready ? "Go to Dashboard" : "Activating…"}
      </button>
    </div>
  );
}
