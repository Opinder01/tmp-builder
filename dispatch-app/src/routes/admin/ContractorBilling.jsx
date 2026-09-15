import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ContractorBilling() {
  const [contractors, setContractors] = useState([]);
  const [workerId, setWorkerId] = useState("");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [timesheets, setTimesheets] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [totalHours, setTotalHours] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/api/workers?action=list")
      .then((data) => setContractors(data.workers.filter((w) => w.worker_type === "contractor")))
      .catch((err) => setError(err.message));
  }, []);

  function load() {
    if (!workerId) return;
    setError("");
    setResult(null);
    api
      .get(`/api/quickbooks/data?resource=contractor-bill&action=unbilled&worker_id=${workerId}&from=${from}&to=${to}`)
      .then((data) => {
        setTimesheets(data.timesheets);
        setTotalHours(data.totalHours);
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

  async function createBill() {
    setBusy(true);
    setError("");
    try {
      const data = await api.post("/api/quickbooks/data?resource=contractor-bill&action=create", {
        worker_id: workerId,
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

  const selectedContractor = contractors.find((c) => c.id === workerId);
  const selectedTotal = (timesheets || [])
    .filter((t) => selected.has(t.id))
    .reduce((sum, t) => sum + Number(t.calculated_hours), 0);

  return (
    <div>
      <h1>Contractor Billing</h1>
      <p className="subtle">
        Collect a contractor's approved timesheets for a date range into one QuickBooks Bill —
        run this at month-end (or whenever you settle up).
      </p>

      <div className="form" style={{ maxWidth: 480 }}>
        <label>
          Contractor
          <select value={workerId} onChange={(e) => { setWorkerId(e.target.value); setTimesheets(null); }}>
            <option value="">Select a contractor...</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
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
        <button onClick={load} disabled={!workerId}>Load unbilled timesheets</button>
      </div>

      {error && <p className="error">{error}</p>}
      {result && (
        <p className="status status-ok">
          Bill created for {selectedContractor?.full_name} — {result.timesheetCount} timesheet(s), ${result.totalAmount}.
        </p>
      )}

      {timesheets && timesheets.length === 0 && <p>No unbilled approved timesheets in this range.</p>}

      {timesheets && timesheets.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Job #</th>
                <th>Date</th>
                <th>Location</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                  </td>
                  <td>{t.dispatch.job_number}</td>
                  <td>{new Date(t.dispatch.start_time).toLocaleDateString()}</td>
                  <td>{t.dispatch.location}</td>
                  <td>{t.calculated_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <strong>{selected.size} selected — {selectedTotal} hours</strong>
            {selectedContractor?.contractor_bill_rate != null && (
              <> — est. ${(selectedTotal * selectedContractor.contractor_bill_rate).toFixed(2)}</>
            )}
          </p>
          <button onClick={createBill} disabled={busy || selected.size === 0}>
            {busy ? "Creating Bill..." : `Create Bill for ${selected.size} timesheet(s)`}
          </button>
        </>
      )}
    </div>
  );
}
