import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import BackButton, { useGoBack } from "../../components/BackButton.jsx";

// Admin edits a contractor (the company that hires Crown for a job).
// Renaming it also renames it on that contractor's existing dispatches and
// bookings, so past shifts don't keep showing the old name.
export default function EditContractor() {
  const { companyId } = useParams();
  const goBack = useGoBack("/contractors");
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/api/client-companies?action=list")
      .then((data) => {
        const c = data.companies.find((x) => x.id === companyId);
        if (!c) {
          setError("Contractor not found.");
          return;
        }
        setOriginal(c);
        setForm({ name: c.name || "", phone: c.phone || "", email: c.email || "", notes: c.notes || "" });
      })
      .catch((err) => setError(err.message));
  }, [companyId]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/api/client-companies?action=update", {
        id: companyId,
        name: form.name,
        phone: form.phone,
        email: form.email,
        notes: form.notes,
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
        <BackButton fallback="/contractors" />
        <h1>Edit Contractor</h1>
        {error && <p className="error">{error}</p>}
        {!error && <p>Loading...</p>}
      </div>
    );
  }

  const renamed = form.name.trim() !== original.name;

  return (
    <div>
      <BackButton fallback="/contractors" />
      <h1>Edit Contractor</h1>
      <form onSubmit={handleSubmit} className="form" style={{ maxWidth: 420 }}>
        <label>
          Company name
          <input required value={form.name} onChange={(e) => update("name", e.target.value)} />
          {renamed && (
            <span className="subtle">
              Saving will also change the name on this contractor's existing dispatches and bookings. The linked
              QuickBooks customer isn't changed.
            </span>
          )}
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
        </label>
        <label>
          Notes
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="review-card-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" disabled={saving} onClick={goBack}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
