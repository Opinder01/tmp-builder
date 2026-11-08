import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import BackButton, { useGoBack } from "../../components/BackButton.jsx";

// Admin edits a flagger's details. What's saved here is what the flagger sees
// on their own Profile tab (it reads the same record), the next time the app
// loads for them.
export default function EditWorker() {
  const { workerId } = useParams();
  const goBack = useGoBack("/workers");
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/api/workers?action=list")
      .then((data) => {
        const w = data.workers.find((x) => x.id === workerId);
        if (!w) {
          setError("Flagger not found.");
          return;
        }
        setOriginal(w);
        setForm({
          full_name: w.full_name || "",
          email: w.email || "",
          worker_type: w.worker_type,
          phone: w.phone || "",
          job_title: w.job_title || "",
          wage: w.wage ?? "",
          contracted_hours_per_period: w.contracted_hours_per_period ?? "",
          contractor_bill_rate: w.contractor_bill_rate ?? "",
        });
      })
      .catch((err) => setError(err.message));
  }, [workerId]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const typeChanged = form.worker_type !== original.worker_type;
    if (typeChanged && !confirm(
      `Change ${original.full_name} from ${original.worker_type} to ${form.worker_type}?\n\n` +
      `Their existing approved timesheets will then be counted as ${form.worker_type === "employee" ? "payroll hours" : "contractor billing"} ` +
      `instead. Anything already sent to QuickBooks is not changed. Continue?`
    )) return;
    setSaving(true);
    try {
      await api.post("/api/workers?action=update", {
        worker_id: workerId,
        full_name: form.full_name,
        // Email is deliberately not sent: it's the flagger's login, and changing it is on hold for now.
        worker_type: form.worker_type,
        phone: form.phone,
        // Only the fields that apply to the chosen type are sent; the rest are cleared.
        job_title: form.worker_type === "employee" ? form.job_title : "",
        wage: form.worker_type === "employee" && form.wage !== "" ? Number(form.wage) : null,
        contracted_hours_per_period:
          form.worker_type === "employee" && form.contracted_hours_per_period !== ""
            ? Number(form.contracted_hours_per_period)
            : null,
        contractor_bill_rate:
          form.worker_type === "contractor" && form.contractor_bill_rate !== ""
            ? Number(form.contractor_bill_rate)
            : null,
      });
      goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <div>
        <BackButton fallback="/workers" />
        <h1>Edit Flagger</h1>
        {error && <p className="error">{error}</p>}
        {!error && <p>Loading...</p>}
      </div>
    );
  }

  return (
    <div>
      <BackButton fallback="/workers" />
      <h1>Edit Flagger</h1>
      <form onSubmit={handleSubmit} className="form" style={{ maxWidth: 420 }}>
        <label>
          Full name
          <input required value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />
        </label>

        <label>
          Email (their login — can't be changed here for now)
          <input readOnly disabled value={form.email} />
        </label>

        <label>
          Flagger type
          <select value={form.worker_type} onChange={(e) => update("worker_type", e.target.value)}>
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
          </select>
        </label>

        <label>
          Phone
          <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </label>

        {form.worker_type === "employee" && (
          <>
            <label>
              Job title — shown on their Profile tab
              <input value={form.job_title} onChange={(e) => update("job_title", e.target.value)} />
            </label>
            <label>
              Wage ($/hour) — shown on their Profile tab
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.wage}
                onChange={(e) => update("wage", e.target.value)}
              />
            </label>
            <label>
              Contracted hours per pay period
              <input
                type="number"
                min="0"
                value={form.contracted_hours_per_period}
                onChange={(e) => update("contracted_hours_per_period", e.target.value)}
              />
            </label>
          </>
        )}

        {form.worker_type === "contractor" && (
          <label>
            Pay rate ($/hour) — used for their QuickBooks Bill
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.contractor_bill_rate}
              onChange={(e) => update("contractor_bill_rate", e.target.value)}
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}

        <div className="review-card-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" disabled={saving} onClick={goBack}>
            Cancel
          </button>
        </div>
        <p className="subtle">
          These details show on the flagger's own Profile tab. They see the changes the next time they open
          the app.
        </p>
      </form>
    </div>
  );
}
