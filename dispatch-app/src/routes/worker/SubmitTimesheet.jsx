import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { uploadFile } from "../../lib/upload.js";
import { calculateHours } from "../../lib/time.js";

// Combines the dispatch's own date with a plain HH:MM time. If the end time
// is earlier in the day than the start time, assumes the shift ran past
// midnight and rolls the end date forward one day.
function toLocalDateTime(baseDateStr, timeStr) {
  if (!baseDateStr || !timeStr) return "";
  return `${baseDateStr}T${timeStr}`;
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

  const shiftDate = dispatch ? new Date(dispatch.start_time).toISOString().slice(0, 10) : "";
  const overnight = startTimeOfDay && endTimeOfDay && endTimeOfDay < startTimeOfDay;
  const endDate = overnight
    ? new Date(new Date(shiftDate).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : shiftDate;

  const previewHours = calculateHours(
    toLocalDateTime(shiftDate, startTimeOfDay),
    toLocalDateTime(endDate, endTimeOfDay),
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
        typed_start_time: new Date(toLocalDateTime(shiftDate, startTimeOfDay)).toISOString(),
        typed_end_time: new Date(toLocalDateTime(endDate, endTimeOfDay)).toISOString(),
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
        <p className="subtle">
          Job {dispatch.job_number} — {dispatch.location} — {new Date(dispatch.start_time).toLocaleDateString()}
        </p>
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
