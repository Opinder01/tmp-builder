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
      let nextState = "denied"; // safe default — always overwritten below

      try {
        const raw = localStorage.getItem("loggedInUser");
        const user = raw ? JSON.parse(raw) : null;

        if (!user?.email) {
          nextState = "no-user";
          return; // finally still runs
        }

        const res = await fetch(
          `/api/subscription-status?email=${encodeURIComponent(user.email)}`
        );

        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();

        // Persist fresh data back to localStorage
        const updated = {
          ...user,
          subscribed:           data.subscribed ?? false,
          plan:                 data.plan                 ?? user.plan,
          stripeCustomerId:     data.stripeCustomerId     ?? user.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId ?? user.stripeSubscriptionId,
        };
        localStorage.setItem("loggedInUser", JSON.stringify(updated));

        nextState = data.subscribed === true ? "allowed" : "denied";

      } catch (err) {
        // API unreachable or JSON parse failed — fall back to localStorage
        console.warn("[ProtectedRoute] check failed, using localStorage fallback:", err.message);
        try {
          const raw = localStorage.getItem("loggedInUser");
          const user = raw ? JSON.parse(raw) : null;
          nextState = user?.subscribed === true ? "allowed" : "denied";
        } catch {
          nextState = "denied";
        }
      } finally {
        // Always clears the "checking" state — no infinite loading possible
        if (!cancelled) setAuthState(nextState);
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
