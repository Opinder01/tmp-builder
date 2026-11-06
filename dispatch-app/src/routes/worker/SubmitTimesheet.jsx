import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { uploadFile } from "../../lib/upload.js";
import { calculateHours } from "../../lib/time.js";
import { addDays, dateKey, formatDate, fromInputValue } from "../../lib/tz.js";

// Combines the dispatch's own date with a plain HH:MM time, read as BC time
// (the typed times on a slip are always BC wall-clock times). If the end time
// is earlier in the day than the start time, the shift is assumed to have run
// past midnight and the end date rolls forward one day.
function toBcDateTime(baseDateStr, timeStr) {
  if (!baseDateStr || !timeStr) return "";
  return fromInputValue(`${baseDateStr}T${timeStr}`);
}

export default function SubmitTimesheet() {
  const { dispatchId } = useParams();
  const navigate = useNavigate();
  const [dispatch, setDispatch] = useState(null);
  const [file, setFile] = useState(null);
  const [startTimeOfDay, setStartTimeOfDay] = useState("");
  const [endTimeOfDay, setEndTimeOfDay] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get("/api/dispatches?action=list")
      .then((data) => {
        const d = data.dispatches.find((x) => x.id === dispatchId);
        setDispatch(d || null);
      })
      .catch((err) => setError(err.message));
  }, [dispatchId]);

  const shiftDate = dispatch ? dateKey(dispatch.start_time) : "";
  const overnight = startTimeOfDay && endTimeOfDay && endTimeOfDay < startTimeOfDay;
  const endDate = overnight ? addDays(shiftDate, 1) : shiftDate;

  const previewHours = calculateHours(
    toBcDateTime(shiftDate, startTimeOfDay),
    toBcDateTime(endDate, endTimeOfDay),
    breakMinutes
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!file) {
      setError("Please attach a photo of your timesheet slip.");
      return;
    }
    setSubmitting(true);
    try {
      const path = await uploadFile("timesheet-photos", file);
      await api.post("/api/timesheets?action=submit", {
        dispatch_id: dispatchId,
        slip_photo_path: path,
        typed_start_time: toBcDateTime(shiftDate, startTimeOfDay),
        typed_end_time: toBcDateTime(endDate, endTimeOfDay),
        break_minutes: Number(breakMinutes) || 0,
      });
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Submit Timesheet</h1>
      {dispatch && (
        <>
          <p className="subtle">
            {dispatch.job_number && `Job ${dispatch.job_number} — `}
            {dispatch.location} — {formatDate(dispatch.start_time)}
          </p>
          {dispatch.title && <p className="subtle">Title: {dispatch.title}</p>}
          {dispatch.client_company_name && (
            <p className="subtle">Contractor: {dispatch.client_company_name}</p>
          )}
          {dispatch.colleagues?.length > 0 && (
            <p className="subtle">With: {dispatch.colleagues.map((c) => c.full_name).join(", ")}</p>
          )}
        </>
      )}
      <form onSubmit={handleSubmit} className="form">
        <label>
          Photo of your paper slip
          <input
            required
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>

        <label>
          Start time
          <input
            required
            type="time"
            value={startTimeOfDay}
            onChange={(e) => setStartTimeOfDay(e.target.value)}
          />
        </label>

        <label>
          End time
          <input
            required
            type="time"
            value={endTimeOfDay}
            onChange={(e) => setEndTimeOfDay(e.target.value)}
          />
        </label>

        {overnight && <p className="subtle">Shift crosses midnight — end time counted as the next day.</p>}

        <label>
          Break (minutes)
          <input
            type="number"
            min="0"
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(e.target.value)}
          />
        </label>

        {previewHours !== null && <p>Hours worked: <strong>{previewHours}</strong></p>}

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Timesheet"}
        </button>
      </form>
    </div>
  );
}
