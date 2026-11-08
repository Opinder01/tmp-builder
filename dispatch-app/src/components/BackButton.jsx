import { useLocation, useNavigate } from "react-router-dom";

// "← Back" to wherever the admin came from. If the page was opened directly
// (nothing earlier in the history), it goes to `fallback` instead.
export function useGoBack(fallback = "/") {
  const navigate = useNavigate();
  const location = useLocation();
  return () => (location.key === "default" ? navigate(fallback) : navigate(-1));
}

export default function BackButton({ fallback = "/" }) {
  const goBack = useGoBack(fallback);
  return (
    <button type="button" onClick={goBack}>
      ← Back
    </button>
  );
}
