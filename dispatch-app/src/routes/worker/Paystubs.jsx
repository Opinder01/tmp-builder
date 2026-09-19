import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export default function Paystubs() {
  const [paystubs, setPaystubs] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/paystubs?action=list")
      .then((data) => setPaystubs(data.paystubs))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>My Paystubs</h1>
      {error && <p className="error">{error}</p>}
      {!paystubs && !error && <p>Loading...</p>}
      {paystubs && paystubs.length === 0 && <p>No paystubs uploaded yet.</p>}

      {paystubs?.map((p) => (
        <div key={p.id} className="dispatch-card">
          <p>
            <strong>{p.label}</strong>
          </p>
          <p className="subtle">Uploaded {new Date(p.uploaded_at).toLocaleDateString()}</p>
          {p.file_url ? (
            <a href={p.file_url} target="_blank" rel="noreferrer" className="button">
              View / Download
            </a>
          ) : (
            <p className="subtle">File unavailable</p>
          )}
        </div>
      ))}
    </div>
  );
}
