import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api.js";

export default function QboSettings() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [syncLog, setSyncLog] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  function load() {
    api.get("/api/quickbooks/status").then(setStatus).catch((err) => setError(err.message));
    api
      .get("/api/quickbooks/sync-log?action=list")
      .then((data) => setSyncLog(data.log))
      .catch(() => setSyncLog([]));
  }

  useEffect(load, []);

  async function connect() {
    try {
      const { url } = await api.get("/api/quickbooks/connect");
      window.location.href = url;
    } catch (err) {
      setError(err.message);
    }
  }

  async function retry(timesheetId) {
    setBusyId(timesheetId);
    try {
      await api.post("/api/timesheets?action=retry-sync", { timesheet_id: timesheetId });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1>QuickBooks</h1>

      {params.get("connected") && <p className="status status-ok">Connected successfully.</p>}
      {params.get("error") && <p className="error">Connection failed: {params.get("error")}</p>}
      {error && <p className="error">{error}</p>}

      {!status && <p>Loading...</p>}

      {status && !status.connected && (
        <div>
          <p>QuickBooks is not connected.</p>
          <button onClick={connect}>Connect QuickBooks</button>
        </div>
      )}

      {status && status.connected && (
        <div>
          <p>
            Connected to realm <strong>{status.realmId}</strong> ({status.environment})
          </p>
          <p className="subtle">Connected {new Date(status.connectedAt).toLocaleString()}</p>
          {status.refreshTokenExpired && (
            <p className="error">
              Connection has expired — reconnect below.
            </p>
          )}
          <button onClick={connect}>{status.refreshTokenExpired ? "Reconnect" : "Reconnect"} QuickBooks</button>
        </div>
      )}

      <h2 style={{ marginTop: "2rem" }}>Sync Log</h2>
      {syncLog && syncLog.length === 0 && <p>No syncs yet.</p>}
      {syncLog && syncLog.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Job #</th>
              <th>Target</th>
              <th>Status</th>
              <th>Detail</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {syncLog.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.created_at).toLocaleString()}</td>
                <td>{s.job_number}</td>
                <td>{s.target}</td>
                <td className={`status status-${s.status === "success" ? "ok" : "bad"}`}>{s.status}</td>
                <td>{s.error_message || s.qbo_entity_id}</td>
                <td>
                  {s.status === "failed" && (
                    <button disabled={busyId === s.timesheet_id} onClick={() => retry(s.timesheet_id)}>
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
