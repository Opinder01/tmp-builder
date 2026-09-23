import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";

export default function AddWorker() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    worker_type: "employee",
    phone: "",
    contracted_hours_per_period: "",
    contractor_bill_rate: "",
    job_title: "",
    wage: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.post("/api/workers?action=create", {
        ...form,
        contracted_hours_per_period: form.contracted_hours_per_period
          ? Number(form.contracted_hours_per_period)
          : null,
        contractor_bill_rate: form.contractor_bill_rate ? Number(form.contractor_bill_rate) : null,
        job_title: form.job_title || null,
        wage: form.wage ? Number(form.wage) : null,
      });
      setCreated({ name: form.full_name, password: data.temporary_password });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div>
        <h1>Add Flagger</h1>
        <p className="status status-ok">{created.name}'s account was created.</p>
        <div className="form" style={{ maxWidth: 420 }}>
          <label>
            Temporary password — share this with {created.name} now, it won't be shown again
            <input readOnly value={created.password} onClick={(e) => e.target.select()} />
          </label>
          <p className="subtle">
            They'll be asked to set their own password the first time they log in — after that,
            this temporary one no longer works.
          </p>
          <button type="button" onClick={() => navigate("/workers")}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Add Flagger</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Full name
          <input required value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />
        </label>

        <label>
          Email
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </label>

        <label>
          Flagger type
          <select value={form.worker_type} onChange={(e) => update("worker_type", e.target.value)}>
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
          </select>
        </label>

        <label>
          Phone (optional)
          <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </label>

        {form.worker_type === "employee" && (
          <>
            <label>
              Job title (optional) — shown on their Profile tab
              <input value={form.job_title} onChange={(e) => update("job_title", e.target.value)} />
            </label>
            <label>
              Wage ($/hour, optional) — shown on their Profile tab
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.wage}
                onChange={(e) => update("wage", e.target.value)}
              />
            </label>
            <label>
              Contracted hours per pay period (optional)
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
            Pay rate ($/hour) — used to compute their QuickBooks Bill amount
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

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create Flagger"}
        </button>
      </form>
    </div>
  );
}
