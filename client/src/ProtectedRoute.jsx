import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const user = JSON.parse(localStorage.getItem("loggedInUser") || "null");

  if (!user) return <Navigate to="/login" replace />;

  const isTrialActive =
    user?.subscriptionStatus === "trial" &&
    user?.trialEndsAt &&
    new Date() < new Date(user.trialEndsAt);

  const isActive = user?.subscriptionStatus === "active";

  if (!user?.plan || (!isTrialActive && !isActive)) {
    return <Navigate to="/subscribe" replace />;
  }

  return children;
}
