import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { generateWorkerSummaryPdf } from "../../lib/pdf/workerSummary.js";

function toDateOnly(isoString) {
  return isoString.slice(0, 10);
}

export default function WorkerSchedule() {
  const { workerId } = useParams();
  const [worker, setWorker] = useState(null);
  const [dispatches, setDispatches] = useState(null);
  const [error, setError] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [rotations, setRotations] = useState({});
  const [generating, setGenerating] = useState(false);

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

  // Both fields are optional: leave both blank for everything, fill just one
  // for an open-ended range, or fill both for a range (or the same date
  // twice for a single day).
  const filteredDispatches = useMemo(() => {
    if (!dispatches) return [];
    return dispatches.filter((d) => {
      const day = toDateOnly(d.start_time);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [dispatches, dateFrom, dateTo]);

  const withPhotos = filteredDispatches.filter((d) => d.timesheets?.slip_photo_url);

  function rotate(dispatchId) {
    setRotations((r) => ({ ...r, [dispatchId]: ((r[dispatchId] || 0) + 90) % 360 }));
  }

  async function downloadPdf() {
    setGenerating(true);
    try {
      await generateWorkerSummaryPdf(worker, filteredDispatches, rotations);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{worker ? worker.full_name : "Worker Schedule"}</h1>
        {worker && dispatches && (
          <button onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? "Hide PDF preview" : "Preview PDF"}
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

      <div className="form" style={{ maxWidth: 480, flexDirection: "row", alignItems: "flex-end", gap: "1rem" }}>
        <label>
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        {(dateFrom || dateTo) && (
          <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}>
            Clear
          </button>
        )}
      </div>
      <p className="subtle">
        Leave blank for everything, set one for an open-ended range, or set both for a range (use
        the same date in both for a single day).
      </p>

      {showPreview && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}>
          <h2 style={{ marginTop: 0 }}>PDF Preview</h2>
          <p className="subtle">
            {filteredDispatches.length} shift(s) in range, {withPhotos.length} with a timesheet
            photo. Rotate any photo that's sideways before downloading — the PDF will include the
            summary table plus one page per photo, at the rotation shown here.
          </p>

          {withPhotos.length === 0 && <p>No timesheet photos in this range.</p>}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            {withPhotos.map((d) => (
              <div key={d.id} style={{ width: 160, textAlign: "center" }}>
                <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                  <img
                    src={d.timesheets.slip_photo_url}
                    alt="Timesheet slip"
                    style={{
                      maxWidth: (rotations[d.id] || 0) % 180 === 0 ? "100%" : "160px",
                      maxHeight: (rotations[d.id] || 0) % 180 === 0 ? "160px" : "100%",
                      transform: `rotate(${rotations[d.id] || 0}deg)`,
                    }}
                  />
                </div>
                <p className="subtle" style={{ margin: "0.4rem 0" }}>
                  Job {d.job_number || "-"} — {new Date(d.start_time).toLocaleDateString()}
                </p>
                <button type="button" onClick={() => rotate(d.id)}>
                  Rotate
                </button>
              </div>
            ))}
          </div>

          <button onClick={downloadPdf} disabled={generating} style={{ marginTop: "1rem" }}>
            {generating ? "Generating..." : "Download PDF"}
          </button>
        </div>
      )}

      {!dispatches && !error && <p>Loading...</p>}
      {dispatches && filteredDispatches.length === 0 && <p>No shifts in this range.</p>}

      {dispatches && filteredDispatches.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Job #</th>
              <th>Date</th>
              <th>Location</th>
              <th>Hours</th>
              <th>Status</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {filteredDispatches.map((d) => {
              const ts = d.timesheets;
              return (
                <tr key={d.id}>
                  <td>{d.job_number}</td>
                  <td>{new Date(d.start_time).toLocaleDateString()}</td>
                  <td>{d.location}</td>
                  <td>{ts?.status === "approved" ? ts.calculated_hours : "-"}</td>
                  <td>{ts ? ts.status : "no timesheet"}</td>
                  <td>
                    {ts?.slip_photo_url ? (
                      <a href={ts.slip_photo_url} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
