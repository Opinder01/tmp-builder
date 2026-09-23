import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../../lib/api.js";

const TITLE_OPTIONS = ["TCP", "LCT", "TCS"];

function toDateTimeLocal(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditDispatch() {
  const { dispatchId } = useParams();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [qboItems, setQboItems] = useState([]);
  const [form, setForm] = useState(null);
  const [hasTimesheet, setHasTimesheet] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get("/api/workers?action=list").then((data) => setWorkers(data.workers)).catch((err) => setError(err.message));
    api.get("/api/client-companies?action=list").then((data) => setContractors(data.companies)).catch((err) => setError(err.message));
    api.get("/api/quickbooks/data?resource=items&action=list").then((data) => setQboItems(data.items)).catch(() => setQboItems([]));
    api
      .get(`/api/dispatches?action=get&id=${dispatchId}`)
      .then((data) => {
        const d = data.dispatch;
        setHasTimesheet(!!d.timesheets);
        setForm({
          job_number: d.job_number || "",
          worker_id: d.worker_id,
          title: d.title || "",
          location: d.location,
          start_time: toDateTimeLocal(d.start_time),
          notes: d.notes || "",
          qbo_item_id: d.qbo_item_id || "",
          rate: d.rate ?? "",
          qbo_ot_item_id: d.qbo_ot_item_id || "",
          ot_rate: d.ot_rate ?? "",
          qbo_dt_item_id: d.qbo_dt_item_id || "",
          dt_rate: d.dt_rate ?? "",
          client_company_id: d.client_company_id || "",
        });
      })
      .catch((err) => setError(err.message));
  }, [dispatchId]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(notify) {
    setError("");
    setSubmitting(true);
    try {
      const selectedItem = qboItems.find((i) => i.id === form.qbo_item_id);
      const selectedOtItem = qboItems.find((i) => i.id === form.qbo_ot_item_id);
      const selectedDtItem = qboItems.find((i) => i.id === form.qbo_dt_item_id);
      const selectedContractor = contractors.find((c) => c.id === form.client_company_id);
      await api.post("/api/dispatches?action=update", {
        id: dispatchId,
        ...form,
        start_time: new Date(form.start_time).toISOString(),
        rate: form.rate ? Number(form.rate) : null,
        ot_rate: form.ot_rate ? Number(form.ot_rate) : null,
        dt_rate: form.dt_rate ? Number(form.dt_rate) : null,
        customer_qbo_id: selectedContractor?.qbo_customer_id || null,
        qbo_customer_name: selectedContractor?.qbo_customer_name || null,
        qbo_item_id: form.qbo_item_id || null,
        qbo_item_name: selectedItem?.name || null,
        qbo_ot_item_id: form.qbo_ot_item_id || null,
        qbo_ot_item_name: selectedOtItem?.name || null,
        qbo_dt_item_id: form.qbo_dt_item_id || null,
        qbo_dt_item_name: selectedDtItem?.name || null,
        client_company_id: form.client_company_id || null,
        client_company_name: selectedContractor?.name || null,
        notify,
      });
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this dispatch? This also removes its timesheet (if any) and can't be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      await api.post("/api/dispatches?action=delete", { id: dispatchId });
      navigate("/");
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (!form) {
    return (
      <div>
        <h1>Edit Dispatch</h1>
        {error && <p className="error">{error}</p>}
        {!error && <p>Loading...</p>}
      </div>
    );
  }

  return (
    <div>
      <h1>Edit Dispatch</h1>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="form">
        <label>
          Job number (optional)
          <input value={form.job_number} onChange={(e) => update("job_number", e.target.value)} />
        </label>

        <label>
          Flagger
          <select
            required
            disabled={hasTimesheet}
            value={form.worker_id}
            onChange={(e) => update("worker_id", e.target.value)}
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name} ({w.worker_type})
              </option>
            ))}
          </select>
          {hasTimesheet && (
            <span className="subtle">
              A timesheet has already been submitted for this dispatch, so the flagger can't be
              changed — delete and recreate it instead if it was assigned to the wrong person.
            </span>
          )}
        </label>

        <label>
          Title (optional) — role this worker is on for this shift
          <select value={form.title} onChange={(e) => update("title", e.target.value)}>
            <option value="">None</option>
            {TITLE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Contractor (company that hired you for this job — optional)
          <select value={form.client_company_id} onChange={(e) => update("client_company_id", e.target.value)}>
            <option value="">None</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="subtle"><Link to="/contractors">+ Add a new contractor</Link></span>
        </label>

        <label>
          Location
          <input required value={form.location} onChange={(e) => update("location", e.target.value)} />
        </label>

        <label>
          Start time
          <input
            required
            type="datetime-local"
            value={form.start_time}
            onChange={(e) => update("start_time", e.target.value)}
          />
        </label>

        <label>
          Notes
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </label>

        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem" }}>
          <legend>Billing (optional — leave blank to skip invoicing for this job)</legend>

          {form.client_company_id && !contractors.find((c) => c.id === form.client_company_id)?.qbo_customer_id && (
            <p className="subtle">
              This contractor isn't linked to a QuickBooks customer yet — set that up on the{" "}
              <Link to="/contractors">Contractors</Link> page to enable invoicing for this job.
            </p>
          )}

          <label>
            Regular rate item
            <select value={form.qbo_item_id} onChange={(e) => update("qbo_item_id", e.target.value)}>
              <option value="">None</option>
              {qboItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Regular rate ($/hour, first 8 hours of the shift)
            <input type="number" step="0.01" min="0" value={form.rate} onChange={(e) => update("rate", e.target.value)} />
          </label>

          <label>
            Overtime rate item
            <select value={form.qbo_ot_item_id} onChange={(e) => update("qbo_ot_item_id", e.target.value)}>
              <option value="">None</option>
              {qboItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Overtime rate ($/hour, hours 8-11)
            <input type="number" step="0.01" min="0" value={form.ot_rate} onChange={(e) => update("ot_rate", e.target.value)} />
          </label>

          <label>
            Doubletime rate item
            <select value={form.qbo_dt_item_id} onChange={(e) => update("qbo_dt_item_id", e.target.value)}>
              <option value="">None</option>
              {qboItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Doubletime rate ($/hour, past 11 hours)
            <input type="number" step="0.01" min="0" value={form.dt_rate} onChange={(e) => update("dt_rate", e.target.value)} />
          </label>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className="review-card-actions">
          <button type="submit" disabled={submitting || deleting}>
            {submitting ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" disabled={submitting || deleting} onClick={() => save(true)}>
            {submitting ? "Saving..." : "Save & Notify Flagger"}
          </button>
          <button type="button" className="button-danger" disabled={submitting || deleting} onClick={handleDelete}>
            {deleting ? "Deleting..." : "Delete Dispatch"}
          </button>
        </div>
      </form>
    </div>
  );
}
