import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

/**
 * ProtectedRoute
 *
 * 1. Reads the logged-in user from localStorage.
 * 2. If no user → redirect to /login.
 * 3. Calls /api/subscription-status to get the live status from Supabase.
 * 4. Updates localStorage with the fresh status so the rest of the app stays in sync.
 * 5. Falls back to the localStorage value if the API is unreachable (e.g. offline).
 */
export default function ProtectedRoute({ children }) {
  // "checking" | "allowed" | "denied" | "no-user"
  const [authState, setAuthState] = useState("checking");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const raw = localStorage.getItem("loggedInUser");
      const user = raw ? JSON.parse(raw) : null;

      if (!user?.email) {
        if (!cancelled) setAuthState("no-user");
        return;
      }

      try {
        const res = await fetch(
          `/api/subscription-status?email=${encodeURIComponent(user.email)}`
        );

        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();

        if (cancelled) return;

        // Persist the fresh subscription data back into localStorage
        const updated = {
          ...user,
          subscriptionStatus: data.status,
          plan:               data.plan             ?? user.plan,
          trialEndsAt:        data.trialEndsAt       ?? user.trialEndsAt,
          stripeCustomerId:   data.stripeCustomerId  ?? user.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId ?? user.stripeSubscriptionId,
        };
        localStorage.setItem("loggedInUser", JSON.stringify(updated));

        const isActive = data.status === "active";
        const isTrial  =
          data.status === "trial" &&
          data.trialEndsAt &&
          new Date() < new Date(data.trialEndsAt);

        setAuthState(isActive || isTrial ? "allowed" : "denied");

      } catch (err) {
        // API unreachable — fall back to whatever is in localStorage
        console.warn("[ProtectedRoute] Supabase check failed, using localStorage:", err.message);
        if (cancelled) return;

        const isActive = user.subscriptionStatus === "active";
        const isTrial  =
          user.subscriptionStatus === "trial" &&
          user.trialEndsAt &&
          new Date() < new Date(user.trialEndsAt);

        setAuthState(isActive || isTrial ? "allowed" : "denied");
      }
    }

    verify();
    return () => { cancelled = true; };
  }, []);

  if (authState === "checking") {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", fontFamily: "sans-serif", color: "#555",
      }}>
        Verifying access…
      </div>
    );
  }

  if (authState === "no-user")  return <Navigate to="/login"     replace />;
  if (authState === "denied")   return <Navigate to="/subscribe" replace />;
  return children;
}
