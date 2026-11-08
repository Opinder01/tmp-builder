import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import NotificationBanner from "../../components/NotificationBanner.jsx";
import DateTimeField from "../../components/DateTimeField.jsx";
import { formatDateTime, fromInputValue, startOfDay, todayKey, toInputValue } from "../../lib/tz.js";

const SOURCES = [
  { value: "website", label: "Website" },
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
  { value: "phone", label: "Phone call" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM = {
  client_company_id: "",
  start_time: "",
  location: "",
  flaggers_needed: "",
  source: "phone",
  notes: "",
  worker_ids: [],
  notify_flaggers: false,
};

const toDateTimeLocal = toInputValue;

function sourceLabel(value) {
  return SOURCES.find((s) => s.value === value)?.label || value;
}

export default function Bookings() {
  const [bookings, setBookings] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [workers, setWorkers] = useState([]);
  // Bumped to reset the date/time field when switching between add and edit.
  const [fieldKey, setFieldKey] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reminderStatus, setReminderStatus] = useState("");

  function load() {
    api
      .get("/api/bookings?action=list")
      .then((data) => setBookings(data.bookings))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    api
      .get("/api/client-companies?action=list")
      .then((data) => setContractors(data.companies))
      .catch(() => setContractors([]));
    api
      .get("/api/workers?action=list")
      .then((data) => setWorkers(data.workers))
      .catch(() => setWorkers([]));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startEdit(b) {
    setEditingId(b.id);
    setForm({
      client_company_id: b.client_company_id || "",
      start_time: toDateTimeLocal(b.start_time),
      location: b.location,
      flaggers_needed: b.flaggers_needed ?? "",
      source: b.source,
      notes: b.notes || "",
      worker_ids: b.worker_ids || [],
      notify_flaggers: !!b.notify_flaggers,
    });
    setFieldKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldKey((k) => k + 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.start_time) {
      setError("Pick both a date and a start time (and check the year).");
      return;
    }
    setSubmitting(true);
    try {
      const contractor = contractors.find((c) => c.id === form.client_company_id);
      await api.post(`/api/bookings?action=${editingId ? "update" : "create"}`, {
        id: editingId,
        ...form,
        start_time: fromInputValue(form.start_time),
        worker_ids: form.worker_ids,
        notify_flaggers: form.worker_ids.length > 0 && form.notify_flaggers,
        flaggers_needed: form.flaggers_needed ? Number(form.flaggers_needed) : null,
        client_company_id: form.client_company_id || null,
        client_company_name: contractor?.name || null,
      });
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(b) {
    if (!confirm("Delete this booking?")) return;
    setError("");
    try {
      await api.post("/api/bookings?action=delete", { id: b.id });
      if (editingId === b.id) cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleWorker(id) {
    setForm((f) => ({
      ...f,
      worker_ids: f.worker_ids.includes(id) ? f.worker_ids.filter((x) => x !== id) : [...f.worker_ids, id],
    }));
  }

  function workerName(id) {
    return workers.find((w) => w.id === id)?.full_name || "Unknown";
  }

  async function sendReminderNow() {
    setReminderStatus("Sending...");
    try {
      const result = await api.post("/api/bookings?action=remind");
      setReminderStatus(
        result.bookings === 0
          ? "No undispatched bookings tomorrow, so nothing to send."
          : result.notified > 0
          ? `Reminder sent to you for ${result.bookings} booking(s) tomorrow. (Flaggers you chose to notify only get theirs from the automatic daily reminder.)`
          : `${result.bookings} booking(s) tomorrow, but this device isn't set up for notifications yet — tap Enable Notifications above.`
      );
    } catch (err) {
      setReminderStatus(`Failed: ${err.message}`);
    }
  }

  // Active flaggers, plus any inactive one already on the booking being edited.
  const visibleWorkers = workers.filter((w) => w.active !== false || form.worker_ids.includes(w.id));
  const upcoming = (bookings || []).filter((b) => b.status === "booked");
  const dispatched = (bookings || []).filter((b) => b.status === "dispatched").reverse();
  const startOfToday = new Date(startOfDay(todayKey()));

  return (
    <div>
      <div className="page-header">
        <h1>Bookings</h1>
        <button onClick={sendReminderNow}>Send tomorrow's reminder now</button>
      </div>
      <p className="subtle">
        Log advance bookings here however they came in. The day before, you'll get a notification
        so you remember to dispatch flaggers. You can also pick flaggers for a booking and choose
        whether they get a day-before reminder too. Bookings are only visible to you — flaggers
        never see them or your notes.
      </p>
      {reminderStatus && <p className="subtle">{reminderStatus}</p>}

      <NotificationBanner message="so you get a reminder the day before each booking. Do this on the device you want the reminders on." />

      <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem", marginBottom: "1.5rem", maxWidth: 420 }}>
        <legend>{editingId ? "Edit Booking" : "Add Booking"}</legend>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Contractor
            <select value={form.client_company_id} onChange={(e) => update("client_company_id", e.target.value)}>
              <option value="">Not listed / unknown</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Date & start time (BC time)
            <DateTimeField
              key={fieldKey}
              required
              defaultValue={form.start_time}
              onChange={(v) => update("start_time", v)}
            />
          </label>
          <label>
            Location
            <input required value={form.location} onChange={(e) => update("location", e.target.value)} />
          </label>
          <label>
            Flaggers needed (optional)
            <input type="number" min="1" value={form.flaggers_needed} onChange={(e) => update("flaggers_needed", e.target.value)} />
          </label>
          <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
            <legend>Flaggers (optional)</legend>
            {visibleWorkers.length === 0 && <p className="subtle">No flaggers yet.</p>}
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {visibleWorkers.map((w) => (
                <label key={w.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={form.worker_ids.includes(w.id)}
                    onChange={() => toggleWorker(w.id)}
                  />
                  {w.full_name} ({w.worker_type}){w.active === false ? " — inactive" : ""}
                </label>
              ))}
            </div>
            {form.worker_ids.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontWeight: 400 }}>
                  <input
                    type="radio"
                    name="notifyFlaggers"
                    style={{ width: "auto" }}
                    checked={form.notify_flaggers}
                    onChange={() => update("notify_flaggers", true)}
                  />
                  <span>Notify these flaggers the day before (you get the reminder too)</span>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontWeight: 400 }}>
                  <input
                    type="radio"
                    name="notifyFlaggers"
                    style={{ width: "auto" }}
                    checked={!form.notify_flaggers}
                    onChange={() => update("notify_flaggers", false)}
                  />
                  <span>Don't notify them — only I get the day-before reminder</span>
                </label>
              </div>
            )}
          </fieldset>
          <label>
            How did they book?
            <select value={form.source} onChange={(e) => update("source", e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            Notes (private — never sent to flaggers)
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="review-card-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Save Changes" : "Add Booking"}
            </button>
            {editingId && <button type="button" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </fieldset>

      <h2 className="section-heading">To dispatch</h2>
      {!bookings && !error && <p>Loading...</p>}
      {bookings && upcoming.length === 0 && <p>Nothing waiting to be dispatched.</p>}
      {upcoming.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Contractor</th>
              <th>Location</th>
              <th>Needed</th>
              <th>Flaggers</th>
              <th>Booked via</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((b) => {
              const overdue = new Date(b.start_time) < startOfToday;
              return (
                <tr key={b.id}>
                  <td className={overdue ? "status status-bad" : ""}>
                    {formatDateTime(b.start_time)}
                    {overdue && " (past)"}
                  </td>
                  <td>{b.client_company_name || "-"}</td>
                  <td>{b.location}</td>
                  <td>{b.flaggers_needed ?? "-"}</td>
                  <td>
                    {(b.worker_ids || []).length === 0
                      ? "-"
                      : `${b.worker_ids.map(workerName).join(", ")}${b.notify_flaggers ? " (will be notified)" : ""}`}
                  </td>
                  <td>{sourceLabel(b.source)}</td>
                  <td>{b.notes || "-"}</td>
                  <td>
                    <Link to={`/dispatch/new?booking=${b.id}`}>Dispatch this</Link>
                    {" | "}
                    <button type="button" className="link-button" onClick={() => startEdit(b)}>Edit</button>
                    {" | "}
                    <button type="button" className="link-button" onClick={() => handleDelete(b)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {dispatched.length > 0 && (
        <>
          <h2 className="section-heading">Already dispatched</h2>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Contractor</th>
                <th>Location</th>
                <th>Booked via</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dispatched.map((b) => (
                <tr key={b.id}>
                  <td>{formatDateTime(b.start_time)}</td>
                  <td>{b.client_company_name || "-"}</td>
                  <td>{b.location}</td>
                  <td>{sourceLabel(b.source)}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => handleDelete(b)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
