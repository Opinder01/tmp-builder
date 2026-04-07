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

      // AbortController gives the API 8 seconds before we fall back to localStorage
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const raw = localStorage.getItem("loggedInUser");
        const user = raw ? JSON.parse(raw) : null;

        if (!user?.email) {
          nextState = "no-user";
          return; // finally still runs
        }

        let data = null;
        try {
          const res = await fetch(
            `/api/subscription-status?email=${encodeURIComponent(user.email)}`,
            { signal: controller.signal }
          );
          if (res.ok) {
            data = await res.json();
          } else {
            console.warn("[ProtectedRoute] API returned", res.status, "— using localStorage fallback");
          }
        } catch (fetchErr) {
          console.warn("[ProtectedRoute] fetch failed or timed out:", fetchErr.message, "— using localStorage fallback");
        }

        if (data !== null) {
          // API succeeded — only upgrade subscribed, never downgrade.
          // If the API says false but localStorage says true, the Supabase webhook
          // is just delayed — trust the local value the user earned at checkout.
          const resolvedSubscribed = data.subscribed === true ? true : (user.subscribed === true);
          const updated = {
            ...user,
            subscribed:           resolvedSubscribed,
            plan:                 data.plan                 ?? user.plan,
            stripeCustomerId:     data.stripeCustomerId     ?? user.stripeCustomerId,
            stripeSubscriptionId: data.stripeSubscriptionId ?? user.stripeSubscriptionId,
          };
          localStorage.setItem("loggedInUser", JSON.stringify(updated));
          console.log("[ProtectedRoute] API subscribed:", data.subscribed, "| local subscribed:", user.subscribed, "| resolved:", resolvedSubscribed);
          nextState = resolvedSubscribed ? "allowed" : "denied";
        } else {
          // API failed / timed out — fall back to localStorage
          nextState = user?.subscribed === true ? "allowed" : "denied";
          console.log("[ProtectedRoute] localStorage fallback → subscribed:", user?.subscribed, "→", nextState);
        }

      } catch (err) {
        // JSON.parse or other unexpected error
        console.warn("[ProtectedRoute] unexpected error:", err.message);
        try {
          const raw = localStorage.getItem("loggedInUser");
          const user = raw ? JSON.parse(raw) : null;
          nextState = user?.subscribed === true ? "allowed" : "denied";
        } catch {
          nextState = "denied";
        }
      } finally {
        clearTimeout(timeoutId);
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
