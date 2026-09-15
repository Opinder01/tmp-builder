import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";

export default function Workers() {
  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/workers?action=list")
      .then((data) => setWorkers(data.workers))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Workers</h1>
        <Link to="/workers/new" className="button">Add Worker</Link>
      </div>

      {error && <p className="error">{error}</p>}
      {!workers && !error && <p>Loading...</p>}
      {workers && workers.length === 0 && <p>No workers yet.</p>}

      {workers && workers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Email</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
