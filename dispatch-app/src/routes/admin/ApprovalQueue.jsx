import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { calculateHours } from "../../lib/time.js";

function toDateTimeLocal(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ReviewCard({ t, busy, onReview }) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(toDateTimeLocal(t.typed_start_time));
  const [end, setEnd] = useState(toDateTimeLocal(t.typed_end_time));
  const [breakMinutes, setBreakMinutes] = useState(t.break_minutes || 0);
  const [notify, setNotify] = useState(true);

  const edited = editing && (
    start !== toDateTimeLocal(t.typed_start_time) ||
    end !== toDateTimeLocal(t.typed_end_time) ||
    Number(breakMinutes) !== (t.break_minutes || 0)
  );
  const previewHours = editing ? calculateHours(start, end, breakMinutes) : t.calculated_hours;

  function handleApprove() {
    onReview(t.id, "approved", {
      typed_start_time: editing ? new Date(start).toISOString() : undefined,
      typed_end_time: editing ? new Date(end).toISOString() : undefined,
      break_minutes: editing ? Number(breakMinutes) : undefined,
      notify,
    });
  }

  return (
    <div className="review-card">
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
          <strong>{t.worker?.full_name}</strong> —{" "}
          {t.dispatch?.job_number && `Job ${t.dispatch.job_number} at `}
          {t.dispatch?.location}
        </p>
        <p className="subtle">
          Dispatched: {t.dispatch?.start_time && new Date(t.dispatch.start_time).toLocaleString()}
        </p>

        {!editing && (
          <>
            <p>
              Typed: {new Date(t.typed_start_time).toLocaleTimeString()} –{" "}
              {new Date(t.typed_end_time).toLocaleTimeString()}
              {t.break_minutes > 0 && ` (${t.break_minutes} min break)`}
            </p>
            <p>
              <strong>{t.calculated_hours} hours</strong>
            </p>
            <button type="button" onClick={() => setEditing(true)}>
              Edit hours
            </button>
          </>
        )}

        {editing && (
          <div className="form" style={{ maxWidth: 320, margin: "0.5rem 0" }}>
            <label>
              Start time
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              End time
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label>
              Break (minutes)
              <input
                type="number"
                min="0"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </label>
            <p>
              <strong>{previewHours ?? "—"} hours</strong>
              {edited && <span className="subtle"> (corrected from {t.calculated_hours})</span>}
            </p>
            <button
              type="button"
              onClick={() => {
                setStart(toDateTimeLocal(t.typed_start_time));
                setEnd(toDateTimeLocal(t.typed_end_time));
                setBreakMinutes(t.break_minutes || 0);
                setEditing(false);
              }}
            >
              Cancel edit
            </button>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400, margin: "0.5rem 0" }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: "auto" }} />
          Notify flagger when approved
        </label>

        <div className="review-card-actions">
          <button disabled={busy} onClick={handleApprove}>
            {edited ? "Approve with corrected hours" : "Approve"}
          </button>
          <button disabled={busy} className="button-danger" onClick={() => onReview(t.id, "rejected")}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

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
        <ReviewCard key={t.id} t={t} busy={busyId === t.id} onReview={review} />
      ))}
    </div>
  );
}
