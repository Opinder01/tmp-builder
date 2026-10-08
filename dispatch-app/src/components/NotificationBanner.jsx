import { useState } from "react";
import { enablePushReminders } from "../lib/push.js";

export default function NotificationBanner({ message }) {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (permission === "unsupported" || permission === "granted" || dismissed) return null;

  async function handleEnable() {
    setBusy(true);
    setError("");
    try {
      await enablePushReminders();
      setPermission("granted");
    } catch (err) {
      setError(err.message);
      setPermission(Notification.permission);
    } finally {
      setBusy(false);
    }
  }

  if (permission === "denied") {
    return (
      <div className="dispatch-card" style={{ borderColor: "#f59e0b" }}>
        <p>
          <strong>Notifications are blocked</strong> — you won't be alerted. Enable them in your
          phone's browser settings for this site, then reopen the app.
        </p>
        <button onClick={() => setDismissed(true)}>Dismiss</button>
      </div>
    );
  }

  return (
    <div className="dispatch-card" style={{ borderColor: "#1d4ed8" }}>
      <p>
        <strong>Turn on notifications</strong> {message}
      </p>
      {error && <p className="error">{error}</p>}
      <div className="review-card-actions">
        <button onClick={handleEnable} disabled={busy}>
          {busy ? "Enabling..." : "Enable Notifications"}
        </button>
        <button onClick={() => setDismissed(true)}>Not now</button>
      </div>
    </div>
  );
}
