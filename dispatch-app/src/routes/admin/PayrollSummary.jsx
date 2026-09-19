import { useState } from "react";
import { api } from "../../lib/api.js";

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PayrollSummary() {
  const [from, setFrom] = useState(isoDaysAgo(14));
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    // "to" is exclusive server-side, so bump it one day to make the picked
    // end date inclusive of the whole day.
    const toExclusive = new Date(to);
    toExclusive.setDate(toExclusive.getDate() + 1);
    api
      .get(`/api/timesheets?action=payroll-summary&from=${from}&to=${toExclusive.toISOString().slice(0, 10)}`)
      .then((data) => setSummary(data.summary))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  const totals = (summary || []).reduce(
    (acc, e) => ({
      regular: acc.regular + e.regular,
      overtime: acc.overtime + e.overtime,
      doubletime: acc.doubletime + e.doubletime,
      total: acc.total + e.total,
    }),
    { regular: 0, overtime: 0, doubletime: 0, total: 0 }
  );

  return (
    <div>
      <h1>Payroll Summary</h1>
      <p className="subtle">
        Approved employee hours for a pay period, split into regular/overtime/doubletime — read
        these off into QuickBooks when you run payroll. Contractors aren't included here since
        they're billed separately, not run through payroll.
      </p>

      <div className="form" style={{ maxWidth: 480, flexDirection: "row", alignItems: "flex-end", gap: "1rem" }}>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {summary && summary.length === 0 && <p>No approved hours for employees in this range.</p>}

      {summary && summary.length > 0 && (
        <table style={{ marginTop: "1.5rem" }}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Regular</th>
              <th>Overtime</th>
              <th>Doubletime</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((e) => (
              <tr key={e.worker_id}>
                <td>{e.full_name}</td>
                <td>{e.regular.toFixed(2)}</td>
                <td>{e.overtime.toFixed(2)}</td>
                <td>{e.doubletime.toFixed(2)}</td>
                <td>
                  <strong>{e.total.toFixed(2)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>{totals.regular.toFixed(2)}</strong></td>
              <td><strong>{totals.overtime.toFixed(2)}</strong></td>
              <td><strong>{totals.doubletime.toFixed(2)}</strong></td>
              <td><strong>{totals.total.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
