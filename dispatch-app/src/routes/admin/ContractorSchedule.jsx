import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { generateContractorSummaryPdf } from "../../lib/pdf/workerSummary.js";
import PdfPreview, { useShiftSequence } from "../../components/PdfPreview.jsx";
import { dateKey as toDateOnly, formatDate } from "../../lib/tz.js";

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

  const sequence = useShiftSequence(filteredDispatches, `${dateFrom}|${dateTo}`);
  const withPhotos = sequence.ordered.filter((d) => d.timesheets?.slip_photo_url);

  function rotate(dispatchId) {
    setRotations((r) => ({ ...r, [dispatchId]: ((r[dispatchId] || 0) + 90) % 360 }));
  }

  async function downloadPdf() {
    setGenerating(true);
    try {
      await generateContractorSummaryPdf(company, sequence.ordered, rotations);
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
        <PdfPreview
          photos={withPhotos}
          totalShifts={filteredDispatches.length}
          rotations={rotations}
          onRotate={rotate}
          onMoveTo={sequence.moveTo}
          onReset={sequence.reset}
          isCustom={sequence.isCustom}
          onDownload={downloadPdf}
          generating={generating}
          showFlagger={true}
        />
      )}

      {!dispatches && !error && <p>Loading...</p>}
      {dispatches && filteredDispatches.length === 0 && <p>No shifts in this range.</p>}

      {dispatches && filteredDispatches.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Job #</th>
              <th>Flagger</th>
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
                  <td>{formatDate(d.start_time)}</td>
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
