import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";

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
