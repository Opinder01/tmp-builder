import { useEffect, useState } from "react";
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

export default function Dashboard() {
  const [dispatches, setDispatches] = useState(null);
  const [error, setError] = useState("");
  const [reminderStatus, setReminderStatus] = useState("");

  useEffect(() => {
    api
      .get("/api/dispatches?action=list")
      .then((data) => setDispatches(data.dispatches))
      .catch((err) => setError(err.message));
  }, []);

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
              return (
                <tr key={d.id}>
                  <td>{d.job_number}</td>
                  <td>{d.worker?.full_name}</td>
                  <td>{d.title || "-"}</td>
                  <td>{d.client_company_name || "-"}</td>
                  <td>{d.location}</td>
                  <td>{new Date(d.start_time).toLocaleString()}</td>
                  <td className={`status status-${status.tone}`}>{status.text}</td>
                  <td><Link to={`/dispatch/${d.id}/edit`}>Edit</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
