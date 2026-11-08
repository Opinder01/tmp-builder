import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { fromInputValue, toInputValue, formatDateTime } from "../../lib/tz.js";

const TITLE_OPTIONS = ["TCP", "LCT", "TCS"];

const toDateTimeLocal = toInputValue;

const QBO_LABELS = {
  payroll_time_activity: "payroll time entry",
  vendor_bill: "contractor bill",
  invoice: "customer invoice",
};

// Hours a timesheet form works out to (BC wall-clock inputs), or null if incomplete.
function previewHours(f) {
  if (!f.start || !f.end) return null;
  const ms = new Date(fromInputValue(f.end)) - new Date(fromInputValue(f.start));
  const hours = ms / 3600000 - (Number(f.breakMinutes) || 0) / 60;
  return Number.isNaN(hours) ? null : Math.round(hours * 100) / 100;
}

export default function EditDispatch() {
  const { dispatchId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [workers, setWorkers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [qboItems, setQboItems] = useState([]);
  const [form, setForm] = useState(null);
  // The dispatch's timesheet (if one was submitted) and the admin's edits to it.
  const [ts, setTs] = useState(null);
  const [tsForm, setTsForm] = useState(null);
  const [tsInitial, setTsInitial] = useState(null);
  const [deleteTs, setDeleteTs] = useState(false);
  const [originalWorkerId, setOriginalWorkerId] = useState("");
  const [onReassign, setOnReassign] = useState(""); // "move" | "delete" when the flagger changes
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get("/api/workers?action=list").then((data) => setWorkers(data.workers)).catch((err) => setError(err.message));
    api.get("/api/client-companies?action=list").then((data) => setContractors(data.companies)).catch((err) => setError(err.message));
    api.get("/api/quickbooks/data?resource=items&action=list").then((data) => setQboItems(data.items)).catch(() => setQboItems([]));
    api
      .get(`/api/dispatches?action=get&id=${dispatchId}`)
      .then((data) => {
        const d = data.dispatch;
        setOriginalWorkerId(d.worker_id);
        if (d.timesheets) {
          const t = d.timesheets;
          const snapshot = {
            start: toDateTimeLocal(t.typed_start_time),
            end: toDateTimeLocal(t.typed_end_time),
            breakMinutes: String(t.break_minutes ?? 0),
          };
          setTs(t);
          setTsForm(snapshot);
          setTsInitial(snapshot);
        }
        setForm({
          job_number: d.job_number || "",
          worker_id: d.worker_id,
          title: d.title || "",
          location: d.location,
          start_time: toDateTimeLocal(d.start_time),
          notes: d.notes || "",
          qbo_item_id: d.qbo_item_id || "",
          rate: d.rate ?? "",
          qbo_ot_item_id: d.qbo_ot_item_id || "",
          ot_rate: d.ot_rate ?? "",
          qbo_dt_item_id: d.qbo_dt_item_id || "",
          dt_rate: d.dt_rate ?? "",
          client_company_id: d.client_company_id || "",
        });
      })
      .catch((err) => setError(err.message));
  }, [dispatchId]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Back to wherever the admin opened this page from (the dashboard, the
  // calendar...). "default" key = page was opened directly, nothing to go back to.
  function goBack() {
    if (location.key === "default") navigate("/");
    else navigate(-1);
  }

  const workerChanged = !!form && form.worker_id !== originalWorkerId;
  const tsHoursChanged =
    !!ts && !!tsForm && !!tsInitial &&
    (tsForm.start !== tsInitial.start || tsForm.end !== tsInitial.end || tsForm.breakMinutes !== tsInitial.breakMinutes);
  const tsHours = tsForm ? previewHours(tsForm) : null;
  const tsHoursBad = tsHoursChanged && !deleteTs && (tsHours === null || tsHours <= 0 || tsHours > 24);
  const qboSynced = ts?.qbo_synced || [];

  async function save(notify) {
    setError("");

    if (ts && workerChanged && !deleteTs && !onReassign) {
      setError("This dispatch already has a timesheet — choose whether to move it to the new flagger or delete it.");
      return;
    }
    if (tsHoursBad) {
      setError("Check the timesheet times: the end must be after the start, and the shift can't exceed 24 hours.");
      return;
    }
    // Anything that changes or removes the timesheet is confirmed first.
    const removing = !!ts && (deleteTs || (workerChanged && onReassign === "delete"));
    const touchingTs = !!ts && (removing || tsHoursChanged || workerChanged);
    if (removing && !confirm("Delete this timesheet? The flagger will have to submit a new one. This can't be undone.")) return;
    if (touchingTs && qboSynced.length > 0) {
      const what = qboSynced.map((t) => QBO_LABELS[t] || t).join(", ");
      if (!confirm(
        `This timesheet was already sent to QuickBooks (${what}). Changing it here will NOT update QuickBooks — you'll need to fix that there too. Continue?`
      )) return;
    }

    setSubmitting(true);
    try {
      const selectedItem = qboItems.find((i) => i.id === form.qbo_item_id);
      const selectedOtItem = qboItems.find((i) => i.id === form.qbo_ot_item_id);
      const selectedDtItem = qboItems.find((i) => i.id === form.qbo_dt_item_id);
      const selectedContractor = contractors.find((c) => c.id === form.client_company_id);
      await api.post("/api/dispatches?action=update", {
        id: dispatchId,
        ...form,
        start_time: fromInputValue(form.start_time),
        rate: form.rate ? Number(form.rate) : null,
        ot_rate: form.ot_rate ? Number(form.ot_rate) : null,
        dt_rate: form.dt_rate ? Number(form.dt_rate) : null,
        customer_qbo_id: selectedContractor?.qbo_customer_id || null,
        qbo_customer_name: selectedContractor?.qbo_customer_name || null,
        qbo_item_id: form.qbo_item_id || null,
        qbo_item_name: selectedItem?.name || null,
        qbo_ot_item_id: form.qbo_ot_item_id || null,
        qbo_ot_item_name: selectedOtItem?.name || null,
        qbo_dt_item_id: form.qbo_dt_item_id || null,
        qbo_dt_item_name: selectedDtItem?.name || null,
        client_company_id: form.client_company_id || null,
        client_company_name: selectedContractor?.name || null,
        ...(ts && !deleteTs && tsHoursChanged
          ? {
              timesheet: {
                typed_start_time: fromInputValue(tsForm.start),
                typed_end_time: fromInputValue(tsForm.end),
                break_minutes: Number(tsForm.breakMinutes) || 0,
              },
            }
          : {}),
        delete_timesheet: !!ts && deleteTs,
        timesheet_on_reassign: workerChanged ? onReassign : "",
        notify,
      });
      goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this dispatch? This also removes its timesheet (if any) and can't be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      await api.post("/api/dispatches?action=delete", { id: dispatchId });
      goBack();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (!form) {
    return (
      <div>
        <button type="button" onClick={goBack}>← Back</button>
        <h1>Edit Dispatch</h1>
        {error && <p className="error">{error}</p>}
        {!error && <p>Loading...</p>}
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={goBack}>← Back</button>
      <h1>Edit Dispatch</h1>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="form">
        <label>
          Job number (optional)
          <input value={form.job_number} onChange={(e) => update("job_number", e.target.value)} />
        </label>

        <label>
          Flagger
          <select
            required
            value={form.worker_id}
            onChange={(e) => update("worker_id", e.target.value)}
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name} ({w.worker_type})
              </option>
            ))}
          </select>
          {workerChanged && (
            <span className="subtle">
              Flagger changed. Choose <strong>Save &amp; Notify</strong> to tell the old flagger they're off this
              dispatch and the new one they're on it, or <strong>Save</strong> to change it without telling anyone.
            </span>
          )}
        </label>

        {ts && workerChanged && !deleteTs && (
          <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem" }}>
            <legend>This dispatch already has a timesheet — what should happen to it?</legend>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontWeight: 400 }}>
              <input
                type="radio"
                name="onReassign"
                style={{ width: "auto" }}
                checked={onReassign === "move"}
                onChange={() => setOnReassign("move")}
              />
              <span>Move it to the new flagger (the wrong person was assigned)</span>
            </label>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontWeight: 400 }}>
              <input
                type="radio"
                name="onReassign"
                style={{ width: "auto" }}
                checked={onReassign === "delete"}
                onChange={() => setOnReassign("delete")}
              />
              <span>Delete it (the new flagger submits their own)</span>
            </label>
          </fieldset>
        )}

        <label>
          Title (optional) — role this worker is on for this shift
          <select value={form.title} onChange={(e) => update("title", e.target.value)}>
            <option value="">None</option>
            {TITLE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Contractor (company that hired you for this job — optional)
          <select value={form.client_company_id} onChange={(e) => update("client_company_id", e.target.value)}>
            <option value="">None</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="subtle"><Link to="/contractors">+ Add a new contractor</Link></span>
        </label>

        <label>
          Location
          <input required value={form.location} onChange={(e) => update("location", e.target.value)} />
        </label>

        <label>
          Start time (BC time)
          <input
            required
            type="datetime-local"
            value={form.start_time}
            onChange={(e) => update("start_time", e.target.value)}
          />
        </label>

        <label>
          Notes
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </label>

        {ts && (
          <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem" }}>
            <legend>
              Timesheet — {ts.status} ({ts.calculated_hours}h submitted
              {ts.submitted_at ? ` ${formatDateTime(ts.submitted_at)}` : ""})
            </legend>

            {qboSynced.length > 0 && (
              <p className="error">
                Already sent to QuickBooks ({qboSynced.map((t) => QBO_LABELS[t] || t).join(", ")}). Changing or
                deleting it here does not change QuickBooks — fix it there too.
              </p>
            )}

            {ts.slip_photo_url && (
              <p>
                <a href={ts.slip_photo_url} target="_blank" rel="noreferrer">View slip photo</a>
              </p>
            )}

            {deleteTs ? (
              <p>
                <strong>This timesheet will be deleted when you save.</strong> The flagger will need to submit a new one.{" "}
                <button type="button" className="link-button" onClick={() => setDeleteTs(false)}>Undo</button>
              </p>
            ) : (
              <>
                <label>
                  Start (BC time)
                  <input
                    type="datetime-local"
                    value={tsForm.start}
                    onChange={(e) => setTsForm((f) => ({ ...f, start: e.target.value }))}
                  />
                </label>
                <label>
                  End (BC time)
                  <input
                    type="datetime-local"
                    value={tsForm.end}
                    onChange={(e) => setTsForm((f) => ({ ...f, end: e.target.value }))}
                  />
                </label>
                <label>
                  Break (minutes)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={tsForm.breakMinutes}
                    onChange={(e) => setTsForm((f) => ({ ...f, breakMinutes: e.target.value }))}
                  />
                </label>
                <p className={tsHoursBad ? "error" : "subtle"}>
                  Total: <strong>{tsHours ?? "—"} hours</strong>
                  {tsHoursChanged && ` (was ${ts.calculated_hours}h)`}
                </p>
                <button type="button" className="button-danger" onClick={() => setDeleteTs(true)}>
                  Delete Timesheet
                </button>
              </>
            )}
          </fieldset>
        )}

        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem" }}>
          <legend>Billing (optional — leave blank to skip invoicing for this job)</legend>

          {form.client_company_id && !contractors.find((c) => c.id === form.client_company_id)?.qbo_customer_id && (
            <p className="subtle">
              This contractor isn't linked to a QuickBooks customer yet — set that up on the{" "}
              <Link to="/contractors">Contractors</Link> page to enable invoicing for this job.
            </p>
          )}

          <label>
            Regular rate item
            <select value={form.qbo_item_id} onChange={(e) => update("qbo_item_id", e.target.value)}>
              <option value="">None</option>
              {qboItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Regular rate ($/hour, first 8 hours of the shift)
            <input type="number" step="0.01" min="0" value={form.rate} onChange={(e) => update("rate", e.target.value)} />
          </label>

          <label>
            Overtime rate item
            <select value={form.qbo_ot_item_id} onChange={(e) => update("qbo_ot_item_id", e.target.value)}>
              <option value="">None</option>
              {qboItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Overtime rate ($/hour, hours 8-11)
            <input type="number" step="0.01" min="0" value={form.ot_rate} onChange={(e) => update("ot_rate", e.target.value)} />
          </label>

          <label>
            Doubletime rate item
            <select value={form.qbo_dt_item_id} onChange={(e) => update("qbo_dt_item_id", e.target.value)}>
              <option value="">None</option>
              {qboItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Doubletime rate ($/hour, past 11 hours)
            <input type="number" step="0.01" min="0" value={form.dt_rate} onChange={(e) => update("dt_rate", e.target.value)} />
          </label>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className="review-card-actions">
          <button type="submit" disabled={submitting || deleting}>
            {submitting ? "Saving..." : "Save (don't notify)"}
          </button>
          <button type="button" disabled={submitting || deleting} onClick={() => save(true)}>
            {submitting ? "Saving..." : workerChanged ? "Save & Notify Flaggers" : "Save & Notify Flagger"}
          </button>
          <button type="button" className="button-danger" disabled={submitting || deleting} onClick={handleDelete}>
            {deleting ? "Deleting..." : "Delete Dispatch"}
          </button>
        </div>
        <p className="subtle">
          “Save & Notify” sends a push notification to the flagger about whatever you changed
          {workerChanged ? " — the old flagger is told they're off it, the new one that they're on it" : ""}.
          “Save” changes everything silently.
        </p>
      </form>
    </div>
  );
}
