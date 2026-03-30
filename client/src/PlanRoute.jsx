import { Navigate, Outlet } from "react-router-dom";

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem("authUser") || "null");
  } catch {
    return null;
  }
}

function isTrialActive(user) {
  if (!user?.trialEndsAt) return false;
  return new Date() < new Date(user.trialEndsAt);
}

export default function PlanRoute() {
  const user = getAuthUser();

  // must be logged in first
  if (!user) return <Navigate to="/login" replace />;

  // must have selected plan + active/trial
  const ok =
    user.subscriptionStatus === "active" ||
    (user.subscriptionStatus === "trial" && isTrialActive(user));

  if (!ok) return <Navigate to="/subscribe" replace />;

  return <Outlet />;
}
