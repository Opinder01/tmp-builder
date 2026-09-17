import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

function statusTone(status) {
  if (status === "approved") return "ok";
  if (status === "rejected") return "bad";
  return "info";
}

export default function TimesheetHistory() {
  const [timesheets, setTimesheets] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/timesheets?action=mine")
      .then((data) => setTimesheets(data.timesheets))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>My Timesheets</h1>
      {error && <p className="error">{error}</p>}
      {!timesheets && !error && <p>Loading...</p>}
      {timesheets && timesheets.length === 0 && <p>No timesheets submitted yet.</p>}

      {timesheets?.map((t) => (
        <div key={t.id} className="dispatch-card">
          <p>
            <strong>{t.dispatch?.job_number ? `Job ${t.dispatch.job_number}` : t.dispatch?.location}</strong>
            {t.dispatch?.job_number && ` — ${t.dispatch.location}`}
          </p>
          {t.dispatch?.client_company_name && <p className="subtle">Contractor: {t.dispatch.client_company_name}</p>}
          <p className="subtle">{t.dispatch?.start_time && new Date(t.dispatch.start_time).toLocaleDateString()}</p>
          <p>
            {new Date(t.typed_start_time).toLocaleTimeString()} – {new Date(t.typed_end_time).toLocaleTimeString()}
            {t.break_minutes > 0 && ` (${t.break_minutes} min break)`}
          </p>
          <p className={`status status-${statusTone(t.status)}`}>
            {t.status === "approved" && `Approved — ${t.calculated_hours}h`}
            {t.status === "pending" && "Pending review"}
            {t.status === "rejected" && `Rejected${t.rejection_reason ? `: ${t.rejection_reason}` : ""}`}
          </p>
        </div>
      ))}
    </div>
  );
}
