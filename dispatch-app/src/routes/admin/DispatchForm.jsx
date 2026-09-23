import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { uploadFile } from "../../lib/upload.js";

const TITLE_OPTIONS = ["TCP", "LCT", "TCS"];

export default function DispatchForm() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [qboItems, setQboItems] = useState([]);
  const [form, setForm] = useState({
    job_number: "",
    worker_ids: [],
    location: "",
    start_time: "",
    notes: "",
    qbo_item_id: "",
    rate: "",
    qbo_ot_item_id: "",
    ot_rate: "",
    qbo_dt_item_id: "",
    dt_rate: "",
    client_company_id: "",
  });
  const [titles, setTitles] = useState({});
  const [workerListOpen, setWorkerListOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get("/api/workers?action=list")
      .then((data) => setWorkers(data.workers))
      .catch((err) => setError(err.message));
    api
      .get("/api/client-companies?action=list")
      .then((data) => setContractors(data.companies))
      .catch((err) => setError(err.message));
    // QuickBooks may not be connected yet — that's fine, billing fields are optional.
    api
      .get("/api/quickbooks/data?resource=items&action=list")
      .then((data) => setQboItems(data.items))
      .catch(() => setQboItems([]));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleWorker(workerId) {
    setForm((f) => ({
      ...f,
      worker_ids: f.worker_ids.includes(workerId)
        ? f.worker_ids.filter((id) => id !== workerId)
        : [...f.worker_ids, workerId],
    }));
  }

  function setTitle(workerId, title) {
    setTitles((t) => ({ ...t, [workerId]: title }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      let attachments;
      if (file) {
        const path = await uploadFile("dispatch-attachments", file);
        attachments = [{ storage_path: path, file_name: file.name, content_type: file.type }];
      }
      const selectedItem = qboItems.find((i) => i.id === form.qbo_item_id);
      const selectedOtItem = qboItems.find((i) => i.id === form.qbo_ot_item_id);
      const selectedDtItem = qboItems.find((i) => i.id === form.qbo_dt_item_id);
      const selectedContractor = contractors.find((c) => c.id === form.client_company_id);
      if (form.worker_ids.length === 0) {
        setError("Select at least one worker.");
        setSubmitting(false);
        return;
      }
      await api.post("/api/dispatches?action=create", {
        ...form,
        start_time: new Date(form.start_time).toISOString(),
        rate: form.rate ? Number(form.rate) : null,
        ot_rate: form.ot_rate ? Number(form.ot_rate) : null,
        dt_rate: form.dt_rate ? Number(form.dt_rate) : null,
        // The QuickBooks customer to bill comes from the Contractor's link
        // (set once in Contractors), not chosen per-dispatch.
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
        titles,
        attachments,
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
      <h1>New Dispatch</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Job number (optional)
          <input
            value={form.job_number}
            onChange={(e) => update("job_number", e.target.value)}
          />
        </label>

        <label>
          Flaggers
          <span className="subtle">Select one or more — everyone gets their own dispatch and timesheet for this job.</span>
          <button type="button" onClick={() => setWorkerListOpen((o) => !o)}>
            {form.worker_ids.length === 0
              ? "Select flaggers..."
              : `${form.worker_ids.length} flagger(s) selected — ${workers
                  .filter((w) => form.worker_ids.includes(w.id))
                  .map((w) => w.full_name)
                  .join(", ")}`}
          </button>
          {workerListOpen && (
            <div className="worker-checklist">
              {workers.map((w) => {
                const checked = form.worker_ids.includes(w.id);
                return (
                  <div key={w.id} className="worker-checklist-item">
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleWorker(w.id)} />
                      {w.full_name} ({w.worker_type})
                    </label>
                    <select
                      value={titles[w.id] || ""}
                      onChange={(e) => setTitle(w.id, e.target.value)}
                      style={{ marginLeft: "1.5rem", width: "auto" }}
                    >
                      <option value="">Title (optional)</option>
                      {TITLE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </label>

        <label>
          Contractor (company that hired you for this job — optional)
          <select
            value={form.client_company_id}
            onChange={(e) => update("client_company_id", e.target.value)}
          >
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
          <input
            required
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
          />
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
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </label>

        <label>
          Attachment (optional)
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>

        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem" }}>
          <legend>Billing (optional — leave blank to skip invoicing for this job)</legend>

          {form.client_company_id && !contractors.find((c) => c.id === form.client_company_id)?.qbo_customer_id && (
            <p className="subtle">
              This contractor isn't linked to a QuickBooks customer yet — set that up on the{" "}
              <Link to="/contractors">Contractors</Link> page to enable invoicing for this job.
            </p>
          )}
          {!form.client_company_id && (
            <p className="subtle">Select a Contractor above to bill this job to their linked QuickBooks customer.</p>
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
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.rate}
              onChange={(e) => update("rate", e.target.value)}
            />
          </label>

          <p className="subtle">
            Overtime/doubletime below are optional — only needed if hours past 8 (up to 3h
            overtime) or past 11 (doubletime) on this shift should be billed at a different rate.
          </p>

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
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.ot_rate}
              onChange={(e) => update("ot_rate", e.target.value)}
            />
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
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.dt_rate}
              onChange={(e) => update("dt_rate", e.target.value)}
            />
          </label>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send Dispatch"}
        </button>
      </form>
    </div>
  );
}
