import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export default function ApprovalQueue() {
  const [timesheets, setTimesheets] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  function load() {
    api
      .get("/api/timesheets?action=pending")
      .then((data) => setTimesheets(data.timesheets))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function review(timesheet_id, decision) {
    let rejection_reason;
    if (decision === "rejected") {
      rejection_reason = window.prompt("Reason for rejecting this timesheet:");
      if (!rejection_reason) return;
    }
    setBusyId(timesheet_id);
    setError("");
    try {
      await api.post("/api/timesheets?action=review", { timesheet_id, decision, rejection_reason });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1>Approval Queue</h1>
      {error && <p className="error">{error}</p>}
      {!timesheets && !error && <p>Loading...</p>}
      {timesheets && timesheets.length === 0 && <p>Nothing pending review.</p>}

      {timesheets?.map((t) => (
        <div key={t.id} className="review-card">
          <div className="review-card-photo">
            {t.slip_photo_url ? (
              <a href={t.slip_photo_url} target="_blank" rel="noreferrer">
                <img src={t.slip_photo_url} alt="Timesheet slip" />
              </a>
            ) : (
              <p className="subtle">Photo unavailable</p>
            )}
          </div>
          <div className="review-card-details">
            <p>
              <strong>{t.worker?.full_name}</strong> — Job {t.dispatch?.job_number} at {t.dispatch?.location}
            </p>
            <p className="subtle">
              Dispatched: {t.dispatch?.start_time && new Date(t.dispatch.start_time).toLocaleString()}
            </p>
            <p>
              Typed: {new Date(t.typed_start_time).toLocaleTimeString()} –{" "}
              {new Date(t.typed_end_time).toLocaleTimeString()}
              {t.break_minutes > 0 && ` (${t.break_minutes} min break)`}
            </p>
            <p>
              <strong>{t.calculated_hours} hours</strong>
            </p>
            <div className="review-card-actions">
              <button disabled={busyId === t.id} onClick={() => review(t.id, "approved")}>
                Approve
              </button>
              <button
                disabled={busyId === t.id}
                className="button-danger"
                onClick={() => review(t.id, "rejected")}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
