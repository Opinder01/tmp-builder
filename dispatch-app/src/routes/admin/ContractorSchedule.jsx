import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { generateContractorSummaryPdf } from "../../lib/pdf/workerSummary.js";

function toDateOnly(isoString) {
  return isoString.slice(0, 10);
}

export default function ContractorSchedule() {
  const { companyId } = useParams();
  const [company, setCompany] = useState(null);
  const [dispatches, setDispatches] = useState(null);
  const [error, setError] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [rotations, setRotations] = useState({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/api/client-companies?action=list"),
      api.get(`/api/dispatches?action=list&client_company_id=${companyId}`),
    ])
      .then(([companiesData, dispatchesData]) => {
        setCompany(companiesData.companies.find((c) => c.id === companyId) || null);
        setDispatches(dispatchesData.dispatches);
      })
      .catch((err) => setError(err.message));
  }, [companyId]);

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
      await generateContractorSummaryPdf(company, filteredDispatches, rotations);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{company ? company.name : "Contractor Schedule"}</h1>
        {company && dispatches && (
          <button onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? "Hide PDF preview" : "Preview PDF"}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

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
            photo, across {new Set(filteredDispatches.map((d) => d.worker_id)).size} worker(s).
            Rotate any photo that's sideways before downloading.
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
                  Job {d.job_number || "-"} — {d.worker?.full_name}
                  <br />
                  {new Date(d.start_time).toLocaleDateString()}
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
              <th>Worker</th>
              <th>Title</th>
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
                  <td>{d.worker?.full_name}</td>
                  <td>{d.title || "-"}</td>
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
