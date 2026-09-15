import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { generateWorkerSummaryPdf } from "../../lib/pdf/workerSummary.js";

export default function WorkerSchedule() {
  const { workerId } = useParams();
  const [worker, setWorker] = useState(null);
  const [dispatches, setDispatches] = useState(null);
  const [error, setError] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    Promise.all([
      api.get("/api/workers?action=list"),
      api.get(`/api/dispatches?action=list&worker_id=${workerId}`),
    ])
      .then(([workersData, dispatchesData]) => {
        const w = workersData.workers.find((w) => w.id === workerId) || null;
        setWorker(w);
        setDispatches(dispatchesData.dispatches);
        if (w) {
          setEditForm({
            phone: w.phone || "",
            job_title: w.job_title || "",
            wage: w.wage ?? "",
            contractor_bill_rate: w.contractor_bill_rate ?? "",
            contracted_hours_per_period: w.contracted_hours_per_period ?? "",
          });
        }
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [workerId]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api.post("/api/workers?action=update", {
        worker_id: workerId,
        phone: editForm.phone,
        job_title: editForm.job_title,
        wage: editForm.wage ? Number(editForm.wage) : null,
        contractor_bill_rate: editForm.contractor_bill_rate ? Number(editForm.contractor_bill_rate) : null,
        contracted_hours_per_period: editForm.contracted_hours_per_period
          ? Number(editForm.contracted_hours_per_period)
          : null,
      });
      setSaved(true);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{worker ? worker.full_name : "Worker Schedule"}</h1>
        {worker && dispatches && (
          <button onClick={() => generateWorkerSummaryPdf(worker, dispatches)}>
            Generate PDF
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {worker && editForm && (
        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem", marginBottom: "1.5rem", maxWidth: 420 }}>
          <legend>Details ({worker.worker_type})</legend>
          <div className="form">
            <label>
              Phone
              <input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            </label>

            {worker.worker_type === "employee" && (
              <>
                <label>
                  Job title
                  <input
                    value={editForm.job_title}
                    onChange={(e) => setEditForm((f) => ({ ...f, job_title: e.target.value }))}
                  />
                </label>
                <label>
                  Wage ($/hour)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.wage}
                    onChange={(e) => setEditForm((f) => ({ ...f, wage: e.target.value }))}
                  />
                </label>
                <label>
                  Contracted hours per pay period
                  <input
                    type="number"
                    min="0"
                    value={editForm.contracted_hours_per_period}
                    onChange={(e) => setEditForm((f) => ({ ...f, contracted_hours_per_period: e.target.value }))}
                  />
                </label>
              </>
            )}

            {worker.worker_type === "contractor" && (
              <label>
                Pay rate ($/hour) — used for their QuickBooks Bill
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.contractor_bill_rate}
                  onChange={(e) => setEditForm((f) => ({ ...f, contractor_bill_rate: e.target.value }))}
                />
              </label>
            )}

            <button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="subtle"> Saved.</span>}
          </div>
        </fieldset>
      )}

      {!dispatches && !error && <p>Loading...</p>}
      {dispatches && dispatches.length === 0 && <p>No shifts for this worker yet.</p>}

      {dispatches && dispatches.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Job #</th>
              <th>Date</th>
              <th>Location</th>
              <th>Hours</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((d) => {
              const ts = d.timesheets;
              return (
                <tr key={d.id}>
                  <td>{d.job_number}</td>
                  <td>{new Date(d.start_time).toLocaleDateString()}</td>
                  <td>{d.location}</td>
                  <td>{ts?.status === "approved" ? ts.calculated_hours : "-"}</td>
                  <td>{ts ? ts.status : "no timesheet"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
