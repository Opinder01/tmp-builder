import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import NotificationBanner from "../../components/NotificationBanner.jsx";

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
};

function toDateTimeLocal(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sourceLabel(value) {
  return SOURCES.find((s) => s.value === value)?.label || value;
}

export default function Bookings() {
  const [bookings, setBookings] = useState(null);
  const [contractors, setContractors] = useState([]);
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
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const contractor = contractors.find((c) => c.id === form.client_company_id);
      await api.post(`/api/bookings?action=${editingId ? "update" : "create"}`, {
        id: editingId,
        ...form,
        start_time: new Date(form.start_time).toISOString(),
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

  async function sendReminderNow() {
    setReminderStatus("Sending...");
    try {
      const result = await api.post("/api/cron/booking-reminders");
      setReminderStatus(
        result.bookings === 0
          ? "No undispatched bookings tomorrow, so nothing to send."
          : result.notified > 0
          ? `Reminder sent for ${result.bookings} booking(s) tomorrow.`
          : `${result.bookings} booking(s) tomorrow, but this device isn't set up for notifications yet — tap Enable Notifications above.`
      );
    } catch (err) {
      setReminderStatus(`Failed: ${err.message}`);
    }
  }

  const upcoming = (bookings || []).filter((b) => b.status === "booked");
  const dispatched = (bookings || []).filter((b) => b.status === "dispatched").reverse();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return (
    <div>
      <div className="page-header">
        <h1>Bookings</h1>
        <button onClick={sendReminderNow}>Send tomorrow's reminder now</button>
      </div>
      <p className="subtle">
        Log advance bookings here however they came in. The day before, you'll get a notification
        so you remember to dispatch flaggers. Bookings are only visible to you — flaggers never see them.
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
            Date & start time
            <input required type="datetime-local" value={form.start_time} onChange={(e) => update("start_time", e.target.value)} />
          </label>
          <label>
            Location
            <input required value={form.location} onChange={(e) => update("location", e.target.value)} />
          </label>
          <label>
            Flaggers needed (optional)
            <input type="number" min="1" value={form.flaggers_needed} onChange={(e) => update("flaggers_needed", e.target.value)} />
          </label>
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
                    {new Date(b.start_time).toLocaleString()}
                    {overdue && " (past)"}
                  </td>
                  <td>{b.client_company_name || "-"}</td>
                  <td>{b.location}</td>
                  <td>{b.flaggers_needed ?? "-"}</td>
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
                  <td>{new Date(b.start_time).toLocaleString()}</td>
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
