import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { enablePushReminders } from "../../lib/push.js";

function statusFor(dispatch) {
  // dispatches -> timesheets is 1:1 (timesheets.dispatch_id is unique), so
  // PostgREST embeds it as a single object rather than an array.
  const ts = dispatch.timesheets;
  if (!ts) return { text: "Timesheet needed", tone: "warn", actionable: true };
  if (ts.status === "pending") return { text: "Submitted — pending review", tone: "info" };
  if (ts.status === "approved") return { text: `Approved — ${ts.calculated_hours}h`, tone: "ok" };
  return { text: `Rejected: ${ts.rejection_reason || ""}`, tone: "bad" };
}

function DispatchCard({ d, status }) {
  return (
    <div className="dispatch-card">
      <p>
        <strong>Job {d.job_number}</strong> — {d.location}
      </p>
      <p className="subtle">{new Date(d.start_time).toLocaleString()}</p>
      {d.notes && <p>{d.notes}</p>}
      <p className={`status status-${status.tone}`}>{status.text}</p>
      {status.actionable && (
        <Link to={`/timesheet/${d.id}`} className="button">
          Submit Timesheet
        </Link>
      )}
    </div>
  );
}

function NotificationBanner() {
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
          <strong>Notifications are blocked</strong> — you won't be alerted when a new dispatch
          comes in. Enable them in your phone's browser settings for this site, then reopen the
          app.
        </p>
        <button onClick={() => setDismissed(true)}>Dismiss</button>
      </div>
    );
  }

  return (
    <div className="dispatch-card" style={{ borderColor: "#1d4ed8" }}>
      <p>
        <strong>Turn on notifications</strong> so you're alerted the moment a new dispatch comes
        in — without them you'll only see it when you open the app.
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

export default function MyDispatches() {
  const [dispatches, setDispatches] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/dispatches?action=list")
      .then((data) => setDispatches(data.dispatches))
      .catch((err) => setError(err.message));
  }, []);

  const needsAction = dispatches?.filter((d) => statusFor(d).actionable) || [];
  const past = dispatches?.filter((d) => !statusFor(d).actionable) || [];

  return (
    <div>
      <h1>My Dispatches</h1>
      <NotificationBanner />
      {error && <p className="error">{error}</p>}
      {!dispatches && !error && <p>Loading...</p>}
      {dispatches && dispatches.length === 0 && <p>No dispatches assigned yet.</p>}

      {needsAction.length > 0 && (
        <>
          <h2 className="section-heading">Needs Timesheet</h2>
          {needsAction.map((d) => (
            <DispatchCard key={d.id} d={d} status={statusFor(d)} />
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="section-heading">Past Dispatches</h2>
          {past.map((d) => (
            <DispatchCard key={d.id} d={d} status={statusFor(d)} />
          ))}
        </>
      )}
    </div>
  );
}
