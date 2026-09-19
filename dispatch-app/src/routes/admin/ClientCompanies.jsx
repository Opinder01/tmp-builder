import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import CustomerSearch from "../../components/CustomerSearch.jsx";

function LinkQboCustomer({ company, onLinked }) {
  const [editing, setEditing] = useState(false);
  const [customer, setCustomer] = useState(
    company.qbo_customer_id ? { id: company.qbo_customer_id, name: company.qbo_customer_name } : null
  );
  const [saving, setSaving] = useState(false);

  async function save(selected) {
    setCustomer(selected);
    setSaving(true);
    try {
      await api.post("/api/client-companies?action=update", {
        id: company.id,
        qbo_customer_id: selected?.id || null,
        qbo_customer_name: selected?.name || null,
      });
      onLinked();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span>
        {company.qbo_customer_name || <span className="subtle">not linked</span>}{" "}
        <button onClick={() => setEditing(true)}>{company.qbo_customer_name ? "Change" : "Link"}</button>
      </span>
    );
  }

  return (
    <div style={{ minWidth: 220 }}>
      <CustomerSearch selected={customer} onSelect={save} />
      {saving && <span className="subtle"> Saving...</span>}
      <button onClick={() => setEditing(false)} style={{ marginTop: "0.25rem" }}>
        Cancel
      </button>
    </div>
  );
}

export default function ClientCompanies() {
  const [companies, setCompanies] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api
      .get("/api/client-companies?action=list")
      .then((data) => setCompanies(data.companies))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/api/client-companies?action=create", form);
      setForm({ name: "", phone: "", email: "", notes: "" });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Contractors</h1>
      <p className="subtle">
        The companies that hire you for a job. Link each one to a QuickBooks customer once, and
        every dispatch for them can be batched into one invoice later from Customer Invoicing —
        no need to search for the customer again per job.
      </p>

      <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem", marginBottom: "1.5rem", maxWidth: 420 }}>
        <legend>Add Contractor</legend>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Company name
            <input required value={form.name} onChange={(e) => update("name", e.target.value)} />
          </label>
          <label>
            Phone (optional)
            <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </label>
          <label>
            Email (optional)
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </label>
          <label>
            Notes (optional)
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "Add Contractor"}
          </button>
        </form>
      </fieldset>

      {companies && companies.length === 0 && <p>No contractors added yet.</p>}
      {companies && companies.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>QuickBooks customer</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.email}</td>
                <td>
                  <LinkQboCustomer company={c} onLinked={load} />
                </td>
                <td>
                  <Link to={`/contractors/${c.id}`}>View schedule</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
