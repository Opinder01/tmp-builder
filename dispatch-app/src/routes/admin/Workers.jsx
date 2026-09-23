import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";

export default function Workers() {
  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState("");
  const [resetFor, setResetFor] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api
      .get("/api/workers?action=list")
      .then((data) => setWorkers(data.workers))
      .catch((err) => setError(err.message));
  }, []);

  async function resetPassword(w) {
    if (!confirm(`Reset ${w.full_name}'s password? Their current password will stop working immediately.`)) return;
    setBusyId(w.id);
    setError("");
    try {
      const data = await api.post("/api/workers?action=reset-password", { worker_id: w.id });
      setResetFor({ name: w.full_name, password: data.temporary_password });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Flaggers</h1>
        <Link to="/workers/new" className="button">Add Flagger</Link>
      </div>

      {error && <p className="error">{error}</p>}

      {resetFor && (
        <div className="status status-ok" style={{ marginBottom: "1rem" }}>
          <p>
            New temporary password for {resetFor.name} — share it with them now, it won't be shown
            again:
          </p>
          <input
            readOnly
            value={resetFor.password}
            onClick={(e) => e.target.select()}
            style={{ maxWidth: 220 }}
          />
          <p className="subtle">They'll be asked to set their own password the next time they log in.</p>
          <button type="button" onClick={() => setResetFor(null)}>Dismiss</button>
        </div>
      )}

      {!workers && !error && <p>Loading...</p>}
      {workers && workers.length === 0 && <p>No flaggers yet.</p>}

      {workers && workers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Email</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td>{w.full_name}</td>
                <td>{w.worker_type}</td>
                <td>{w.email}</td>
                <td>
                  <Link to={`/workers/${w.id}`}>View schedule</Link>
                </td>
                <td>
                  <button type="button" disabled={busyId === w.id} onClick={() => resetPassword(w)}>
                    {busyId === w.id ? "Resetting..." : "Reset password"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
