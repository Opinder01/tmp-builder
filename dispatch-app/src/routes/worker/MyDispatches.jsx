import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import NotificationBanner from "../../components/NotificationBanner.jsx";

function statusFor(dispatch) {
  // dispatches -> timesheets is 1:1 (timesheets.dispatch_id is unique), so
  // PostgREST embeds it as a single object rather than an array.
  const ts = dispatch.timesheets;
  if (!ts) return { text: "Timesheet needed", tone: "warn", actionable: true };
  if (ts.status === "pending") return { text: "Submitted — pending review", tone: "info" };
  if (ts.status === "approved") return { text: `Approved — ${ts.calculated_hours}h`, tone: "ok" };
  return { text: `Rejected: ${ts.rejection_reason || ""} — please resubmit`, tone: "bad", actionable: true };
}

function DispatchCard({ d, status }) {
  return (
    <div className="dispatch-card">
      <p>
        <strong>{d.job_number ? `Job ${d.job_number}` : d.location}</strong>
        {d.job_number && ` — ${d.location}`}
      </p>
      {d.title && <p className="subtle">Title: {d.title}</p>}
      {d.client_company_name && <p className="subtle">Contractor: {d.client_company_name}</p>}
      {d.colleagues?.length > 0 && (
        <p className="subtle">With: {d.colleagues.map((c) => c.full_name).join(", ")}</p>
      )}
      <p className="subtle">{new Date(d.start_time).toLocaleString()}</p>
      {d.notes && <p>{d.notes}</p>}
      <p className={`status status-${status.tone}`}>{status.text}</p>
      {status.actionable && (
        <Link to={`/timesheet/${d.id}`} className="button">
          {d.timesheets ? "Resubmit Timesheet" : "Submit Timesheet"}
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

  // Keeps the home-screen icon badge in sync whenever the app is opened —
  // covers submitting a timesheet (count should drop) and opening without a
  // push having fired. The push itself also sets this on arrival.
  useEffect(() => {
    if (!dispatches || !("setAppBadge" in navigator)) return;
    if (needsAction.length > 0) {
      navigator.setAppBadge(needsAction.length).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [dispatches, needsAction.length]);

  return (
    <div>
      <h1>My Dispatches</h1>
      <NotificationBanner message="so you're alerted the moment a new dispatch comes in — without them you'll only see it when you open the app." />
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
