import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";

function statusLabel(dispatch) {
  // dispatches -> timesheets is 1:1 (timesheets.dispatch_id is unique), so
  // PostgREST embeds it as a single object rather than an array.
  const ts = dispatch.timesheets;
  if (!ts) return { text: "No timesheet submitted", tone: "warn" };
  if (ts.status === "pending") return { text: "Pending review", tone: "info" };
  if (ts.status === "approved") return { text: `Approved — ${ts.calculated_hours}h`, tone: "ok" };
  return { text: "Rejected", tone: "bad" };
}

function ReviewPanel({ dispatch, busy, onReview }) {
  const ts = dispatch.timesheets;
  const [notify, setNotify] = useState(true);

  return (
    <tr className="review-panel-row">
      <td colSpan={8}>
        <div className="review-card">
          <div className="review-card-photo">
            {ts.slip_photo_url ? (
              <a href={ts.slip_photo_url} target="_blank" rel="noreferrer">
                <img src={ts.slip_photo_url} alt="Timesheet slip" />
              </a>
            ) : (
              <p className="subtle">Photo unavailable</p>
            )}
          </div>
          <div className="review-card-details">
            <p>
              Typed: {new Date(ts.typed_start_time).toLocaleTimeString()} –{" "}
              {new Date(ts.typed_end_time).toLocaleTimeString()}
              {ts.break_minutes > 0 && ` (${ts.break_minutes} min break)`}
            </p>
            <p>
              <strong>{ts.calculated_hours} hours</strong>
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400, margin: "0.5rem 0" }}>
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: "auto" }} />
              Notify flagger when approved
            </label>
            <div className="review-card-actions">
              <button disabled={busy} onClick={() => onReview(ts.id, "approved", { notify })}>
                Approve
              </button>
              <button disabled={busy} className="button-danger" onClick={() => onReview(ts.id, "rejected")}>
                Reject
              </button>
            </div>
            <p className="subtle">
              Need to correct the typed hours first? Use the <Link to="/approvals">Approval Queue</Link> page.
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const [dispatches, setDispatches] = useState(null);
  const [error, setError] = useState("");
  const [reminderStatus, setReminderStatus] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [reminderBusyId, setReminderBusyId] = useState(null);
  const [reminderSentId, setReminderSentId] = useState(null);

  function load() {
    api
      .get("/api/dispatches?action=list")
      .then((data) => setDispatches(data.dispatches))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function sendRemindersNow() {
    setReminderStatus("Sending...");
    try {
      const result = await api.post("/api/cron/reminders?force=true");
      setReminderStatus(
        result.workersNotified > 0
          ? `Notified ${result.workersNotified} flagger(s) about ${result.dispatchesFlagged} missing timesheet(s).`
          : "No workers currently missing a timesheet."
      );
    } catch (err) {
      setReminderStatus(`Failed: ${err.message}`);
    }
  }

  async function sendReminder(d) {
    setReminderBusyId(d.id);
    setReminderSentId(null);
    setError("");
    try {
      const result = await api.post("/api/dispatches?action=remind", { id: d.id });
      setReminderSentId(d.id);
      if (!result.sent) setError(`${d.worker?.full_name} doesn't have notifications enabled yet — they won't see this until they open the app.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setReminderBusyId(null);
    }
  }

  async function review(timesheet_id, decision, extra = {}) {
    let rejection_reason;
    if (decision === "rejected") {
      rejection_reason = window.prompt("Reason for rejecting this timesheet:");
      if (!rejection_reason) return;
    }
    setBusyId(timesheet_id);
    setError("");
    try {
      await api.post("/api/timesheets?action=review", { timesheet_id, decision, rejection_reason, ...extra });
      setExpandedId(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dispatches</h1>
        <div>
          <button onClick={sendRemindersNow} style={{ marginRight: "0.5rem" }}>
            Send Reminders Now
          </button>
          <Link to="/dispatch/new" className="button">New Dispatch</Link>
        </div>
      </div>
      {reminderStatus && <p className="subtle">{reminderStatus}</p>}

      {error && <p className="error">{error}</p>}
      {!dispatches && !error && <p>Loading...</p>}

      {dispatches && dispatches.length === 0 && <p>No dispatches yet.</p>}

      {dispatches && dispatches.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Job #</th>
              <th>Flagger</th>
              <th>Title</th>
              <th>Contractor</th>
              <th>Location</th>
              <th>Start</th>
              <th>Timesheet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((d) => {
              const status = statusLabel(d);
              const isPending = d.timesheets?.status === "pending";
              const isMissing = !d.timesheets;
              const isRejected = d.timesheets?.status === "rejected";
              const isExpanded = expandedId === d.id;
              return (
                <Fragment key={d.id}>
                  <tr>
                    <td>{d.job_number}</td>
                    <td>{d.worker?.full_name}</td>
                    <td>{d.title || "-"}</td>
                    <td>{d.client_company_name || "-"}</td>
                    <td>{d.location}</td>
                    <td>{new Date(d.start_time).toLocaleString()}</td>
                    <td className={`status status-${status.tone}`}>{status.text}</td>
                    <td>
                      <Link to={`/dispatch/${d.id}/edit`}>Edit</Link>
                      {isPending && (
                        <>
                          {" | "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => setExpandedId(isExpanded ? null : d.id)}
                          >
                            {isExpanded ? "Hide" : "Approve"}
                          </button>
                        </>
                      )}
                      {(isMissing || isRejected) && (
                        <>
                          {" | "}
                          <button
                            type="button"
                            className="link-button"
                            disabled={reminderBusyId === d.id}
                            onClick={() => sendReminder(d)}
                          >
                            {reminderBusyId === d.id
                              ? "Sending..."
                              : reminderSentId === d.id
                              ? "Sent"
                              : "Send Reminder"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {isPending && isExpanded && (
                    <ReviewPanel dispatch={d} busy={busyId === d.timesheets.id} onReview={review} />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
