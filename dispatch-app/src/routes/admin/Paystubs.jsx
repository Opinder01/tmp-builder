import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { uploadFile } from "../../lib/upload.js";

export default function Paystubs() {
  const [workers, setWorkers] = useState([]);
  const [workerId, setWorkerId] = useState("");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState(null);
  const [notify, setNotify] = useState(true);
  const [paystubs, setPaystubs] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.get("/api/workers?action=list").then((data) => setWorkers(data.workers)).catch((err) => setError(err.message));
  }, []);

  function loadFor(id) {
    if (!id) {
      setPaystubs(null);
      return;
    }
    api
      .get(`/api/paystubs?action=list&worker_id=${id}`)
      .then((data) => setPaystubs(data.paystubs))
      .catch((err) => setError(err.message));
  }

  function handleWorkerChange(id) {
    setWorkerId(id);
    loadFor(id);
  }

  async function handleUpload(e) {
    e.preventDefault();
    setError("");
    if (!workerId || !label || !file) {
      setError("Select a worker, give it a label, and choose a file.");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadFile("paystubs", file);
      await api.post("/api/paystubs?action=create", {
        worker_id: workerId,
        label,
        storage_path: path,
        file_name: file.name,
        notify,
      });
      setLabel("");
      setFile(null);
      loadFor(workerId);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this paystub? This can't be undone.")) return;
    setBusyId(id);
    try {
      await api.post("/api/paystubs?action=delete", { id });
      loadFor(workerId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1>Paystubs</h1>
      <p className="subtle">
        Upload the paystub PDF you exported from QuickBooks after running payroll — the employee
        will see it in their own Paystub tab.
      </p>

      <form onSubmit={handleUpload} className="form" style={{ maxWidth: 480 }}>
        <label>
          Employee
          <select required value={workerId} onChange={(e) => handleWorkerChange(e.target.value)}>
            <option value="">Select an employee...</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name} ({w.worker_type})
              </option>
            ))}
          </select>
        </label>

        <label>
          Label (e.g. "Sep 1 – Sep 15, 2026")
          <input required value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>

        <label>
          Paystub file
          <input required type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: "auto" }} />
          Notify employee
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={uploading}>
          {uploading ? "Uploading..." : "Upload Paystub"}
        </button>
      </form>

      {workerId && (
        <>
          <h2 style={{ marginTop: "2rem" }}>Previously uploaded</h2>
          {!paystubs && <p>Loading...</p>}
          {paystubs && paystubs.length === 0 && <p>No paystubs uploaded for this employee yet.</p>}
          {paystubs && paystubs.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Uploaded</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paystubs.map((p) => (
                  <tr key={p.id}>
                    <td>{p.label}</td>
                    <td>{new Date(p.uploaded_at).toLocaleDateString()}</td>
                    <td>
                      {p.file_url && (
                        <a href={p.file_url} target="_blank" rel="noreferrer">
                          View
                        </a>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button-danger"
                        disabled={busyId === p.id}
                        onClick={() => handleDelete(p.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
