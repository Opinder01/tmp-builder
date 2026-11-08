import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { formatDateTime, formatTime } from "../../lib/tz.js";

// sessionStorage key holding the dispatch the admin left the dashboard from.
const RETURN_KEY = "dashboardReturn";

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
              Typed: {formatTime(ts.typed_start_time)} –{" "}
              {formatTime(ts.typed_end_time)}
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

// Read-only view of an approved timesheet: fetches the full record (and a
// fresh link to the slip photo) when opened.
function ApprovedPanel({ dispatch }) {
  const [ts, setTs] = useState(null);
  const [error, setError] = useState("");
  const timesheetId = dispatch.timesheets.id;

  useEffect(() => {
    api
      .get(`/api/timesheets?action=detail&timesheet_id=${timesheetId}`)
      .then((data) => setTs(data.timesheet))
      .catch((err) => setError(err.message));
  }, [timesheetId]);

  return (
    <tr className="review-panel-row">
      <td colSpan={8}>
        {error && <p className="error">{error}</p>}
        {!ts && !error && <p>Loading...</p>}
        {ts && (
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
                <strong>{dispatch.worker?.full_name}</strong>
                {dispatch.job_number ? ` — Job ${dispatch.job_number}` : ""}
              </p>
              <p>
                Worked: {formatDateTime(ts.typed_start_time)} – {formatTime(ts.typed_end_time)}
                {ts.break_minutes > 0 && ` (${ts.break_minutes} min break)`}
              </p>
              <p>
                <strong>{ts.calculated_hours} hours</strong>
              </p>
              <p className="subtle">
                {ts.submitted_at && <>Submitted {formatDateTime(ts.submitted_at)}. </>}
                {ts.reviewed_at && (
                  <>
                    Approved {formatDateTime(ts.reviewed_at)}
                    {ts.reviewed_by_name ? ` by ${ts.reviewed_by_name}` : ""}.
                  </>
                )}
              </p>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const [dispatches, setDispatches] = useState(null);
  const [error, setError] = useState("");
  const [reminderStatus, setReminderStatus] = useState("");
  // Dispatch ids whose panel is open -- any number can be open at once.
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  function togglePanel(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
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

  // Coming back from the Edit page: scroll to the dispatch the admin was
  // editing (or the old scroll position if that row no longer exists).
  useEffect(() => {
    if (!dispatches) return;
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null");
      sessionStorage.removeItem(RETURN_KEY);
    } catch {
      return;
    }
    if (!saved) return;
    const row = document.getElementById(`dispatch-${saved.id}`);
    if (row) {
      row.scrollIntoView({ block: "center" });
      row.classList.add("row-return-highlight");
      setTimeout(() => row.classList.remove("row-return-highlight"), 2500);
    } else {
      window.scrollTo(0, saved.scrollY || 0);
    }
  }, [dispatches]);

  function rememberPosition(id) {
    try {
      sessionStorage.setItem(RETURN_KEY, JSON.stringify({ id, scrollY: window.scrollY }));
    } catch {
      // storage unavailable -- Back still works, it just won't restore the spot
    }
  }

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
      // Close just the panel that was reviewed; leave any others open.
      const reviewed = dispatches?.find((d) => d.timesheets?.id === timesheet_id);
      if (reviewed) setExpandedIds((prev) => { const next = new Set(prev); next.delete(reviewed.id); return next; });
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
              const isApproved = d.timesheets?.status === "approved";
              const isMissing = !d.timesheets;
              const isRejected = d.timesheets?.status === "rejected";
              const isExpanded = expandedIds.has(d.id);
              return (
                <Fragment key={d.id}>
                  <tr id={`dispatch-${d.id}`}>
                    <td>{d.job_number}</td>
                    <td>{d.worker?.full_name}</td>
                    <td>{d.title || "-"}</td>
                    <td>{d.client_company_name || "-"}</td>
                    <td>{d.location}</td>
                    <td>{formatDateTime(d.start_time)}</td>
                    <td className={`status status-${status.tone}`}>{status.text}</td>
                    <td>
                      <Link to={`/dispatch/${d.id}/edit`} onClick={() => rememberPosition(d.id)}>Edit</Link>
                      {isPending && (
                        <>
                          {" | "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => togglePanel(d.id)}
                          >
                            {isExpanded ? "Hide" : "Approve"}
                          </button>
                        </>
                      )}
                      {isApproved && (
                        <>
                          {" | "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => togglePanel(d.id)}
                          >
                            {isExpanded ? "Hide" : "View Timesheet"}
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
                  {isApproved && isExpanded && <ApprovedPanel dispatch={d} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
