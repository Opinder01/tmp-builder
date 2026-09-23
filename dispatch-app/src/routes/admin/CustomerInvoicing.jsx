import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { splitShiftHours } from "../../lib/overtime.js";

function estimateAmount(t) {
  const split = splitShiftHours(t.calculated_hours);
  let amount = 0;
  if (t.dispatch.qbo_item_id && t.dispatch.rate != null) amount += split.regular * t.dispatch.rate;
  if (t.dispatch.qbo_ot_item_id && t.dispatch.ot_rate != null) amount += split.overtime * t.dispatch.ot_rate;
  if (t.dispatch.qbo_dt_item_id && t.dispatch.dt_rate != null) amount += split.doubletime * t.dispatch.dt_rate;
  return amount;
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function CustomerInvoicing() {
  const [contractors, setContractors] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [timesheets, setTimesheets] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/api/client-companies?action=list")
      .then((data) => setContractors(data.companies))
      .catch((err) => setError(err.message));
  }, []);

  function load() {
    if (!companyId) return;
    setError("");
    setResult(null);
    api
      .get(`/api/quickbooks/data?resource=customer-invoice&action=unbilled&client_company_id=${companyId}&from=${from}&to=${to}`)
      .then((data) => {
        setTimesheets(data.timesheets);
        setSelected(new Set(data.timesheets.map((t) => t.id)));
      })
      .catch((err) => setError(err.message));
  }

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createInvoice() {
    setBusy(true);
    setError("");
    try {
      const data = await api.post("/api/quickbooks/data?resource=customer-invoice&action=create", {
        client_company_id: companyId,
        timesheet_ids: [...selected],
      });
      setResult(data.result);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedCompany = contractors.find((c) => c.id === companyId);
  const selectedTotal = (timesheets || [])
    .filter((t) => selected.has(t.id))
    .reduce((sum, t) => sum + estimateAmount(t), 0);
  const selectedHours = (timesheets || [])
    .filter((t) => selected.has(t.id))
    .reduce((sum, t) => sum + Number(t.calculated_hours), 0);

  return (
    <div>
      <h1>Customer Invoicing</h1>
      <p className="subtle">
        Collect a contractor's approved, billable shifts for a date range into one QuickBooks
        invoice — run this whenever you're ready to bill them.
      </p>

      <div className="form" style={{ maxWidth: 480 }}>
        <label>
          Contractor
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setTimesheets(null); }}>
            <option value="">Select a contractor...</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.qbo_customer_name ? `(${c.qbo_customer_name})` : "(not linked to QuickBooks)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={load} disabled={!companyId}>Load unbilled shifts</button>
      </div>

      {selectedCompany && !selectedCompany.qbo_customer_id && (
        <p className="error">
          {selectedCompany.name} isn't linked to a QuickBooks customer yet — link one on the
          Contractors page before invoicing them.
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p className="status status-ok">
            Invoice created for {selectedCompany?.name} — {result.timesheetCount} shift(s), ${result.totalAmount}.
          </p>
          {result.skipped?.length > 0 && (
            <div className="status status-warn">
              Not billed (no rate set for that portion):
              <ul>
                {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      {timesheets && timesheets.length === 0 && <p>No unbilled, billable approved shifts in this range.</p>}

      {timesheets && timesheets.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Job #</th>
                <th>Flagger</th>
                <th>Title</th>
                <th>Date</th>
                <th>Location</th>
                <th>Hours (reg / OT / DT)</th>
                <th>Est. amount</th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((t) => {
                const split = splitShiftHours(t.calculated_hours);
                return (
                  <tr key={t.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    </td>
                    <td>{t.dispatch.job_number}</td>
                    <td>{t.worker?.full_name}</td>
                    <td>{t.dispatch.title || "-"}</td>
                    <td>{new Date(t.dispatch.start_time).toLocaleDateString()}</td>
                    <td>{t.dispatch.location}</td>
                    <td>
                      {split.regular}
                      {split.overtime > 0 && ` / ${split.overtime}`}
                      {split.doubletime > 0 && ` / ${split.doubletime}`}
                    </td>
                    <td>${estimateAmount(t).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p>
            <strong>{selected.size} selected — {selectedHours} hours — ${selectedTotal.toFixed(2)}</strong>
          </p>
          <button onClick={createInvoice} disabled={busy || selected.size === 0}>
            {busy ? "Creating Invoice..." : `Create Invoice for ${selected.size} shift(s)`}
          </button>
        </>
      )}
    </div>
  );
}
