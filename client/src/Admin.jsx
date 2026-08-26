import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "adminAuth";

export default function Admin() {
  const [authed,    setAuthed]    = useState(() => !!sessionStorage.getItem(STORAGE_KEY));
  const [pwInput,   setPwInput]   = useState("");
  const [pwError,   setPwError]   = useState("");
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [deleting,  setDeleting]  = useState(null); // email being deleted
  const [confirmDel, setConfirmDel] = useState(null); // email awaiting confirm
  const [search,    setSearch]    = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const pw = sessionStorage.getItem(STORAGE_KEY);
      const res = await fetch("/api/admin", {
        headers: { "x-admin-password": pw },
      });
      const data = await res.json();
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setError(data?.error || "Failed to load users."); return; }
      setUsers(data.users || []);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) fetchUsers();
  }, [authed, fetchUsers]);

  function handleLogin(e) {
    e.preventDefault();
    if (!pwInput.trim()) { setPwError("Enter the admin password."); return; }
    sessionStorage.setItem(STORAGE_KEY, pwInput);
    setAuthed(true);
    setPwError("");
  }

  async function handleDelete(email) {
    setDeleting(email); setError("");
    try {
      const pw = sessionStorage.getItem(STORAGE_KEY);
      const res = await fetch(`/api/admin?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
        headers: { "x-admin-password": pw },
      });
      const data = await res.json();
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setError(data?.error || "Delete failed."); return; }
      setUsers((prev) => prev.filter((u) => u.email !== email));
    } catch {
      setError("Network error. Delete failed.");
    } finally {
      setDeleting(null);
      setConfirmDel(null);
    }
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthed(false);
    setUsers([]);
    setPwInput("");
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q ||
      u.email?.toLowerCase().includes(q) ||
      u.fullName?.toLowerCase().includes(q) ||
      u.companyName?.toLowerCase().includes(q);
  });

  // ── Login screen ─────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#f1f5f9", fontFamily: "Inter, system-ui, sans-serif",
      }}>
        <div style={{
          background: "#fff", borderRadius: 14, padding: "40px 36px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.10)", width: "100%", maxWidth: 380,
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
            🔒 Admin Panel
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px" }}>
            Enter the admin password to continue.
          </p>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="password"
              placeholder="Admin password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              style={{
                padding: "10px 14px", fontSize: 14, borderRadius: 8,
                border: "1.5px solid #e2e8f0", outline: "none",
                background: "#f8fafc", color: "#0f172a",
              }}
            />
            {pwError && <p style={{ color: "crimson", margin: 0, fontSize: 12 }}>{pwError}</p>}
            <button type="submit" style={{
              padding: "11px", fontSize: 14, fontWeight: 700,
              background: "linear-gradient(135deg,#0f172a,#1e3a5f)",
              color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
            }}>
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Admin dashboard ──────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", background: "#f1f5f9",
      fontFamily: "Inter, system-ui, sans-serif", padding: "32px 24px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
              👥 User Management
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              {users.length} account{users.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={fetchUsers} style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 600,
              background: "#fff", color: "#0f172a",
              border: "1.5px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
            }}>
              ↻ Refresh
            </button>
            <button onClick={logout} style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 600,
              background: "#fff", color: "#64748b",
              border: "1.5px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
            }}>
              Sign Out
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          placeholder="Search by name, email, or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 14px", fontSize: 14, borderRadius: 8,
            border: "1.5px solid #e2e8f0", outline: "none",
            background: "#fff", color: "#0f172a", marginBottom: 16,
          }}
        />

        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 8, padding: "10px 14px",
            color: "#dc2626", fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 14 }}>
            Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 14 }}>
            {search ? "No users match your search." : "No accounts found."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((u) => (
              <div key={u.email} style={{
                background: "#fff", borderRadius: 10, padding: "16px 20px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                border: "1px solid #e2e8f0",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 16, flexWrap: "wrap",
              }}>
                {/* User info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                    {u.fullName || "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "#f97316", fontWeight: 500 }}>{u.email}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {u.companyName || "—"} {u.phone ? `· ${u.phone}` : ""}
                  </div>
                </div>

                {/* Subscription badge */}
                <div style={{ textAlign: "center" }}>
                  {u.hasSubscription ? (
                    <span style={{
                      background: "#dcfce7", color: "#15803d",
                      border: "1px solid #bbf7d0",
                      borderRadius: 20, padding: "4px 12px",
                      fontSize: 12, fontWeight: 700,
                    }}>
                      ✓ {u.plan ? u.plan.charAt(0).toUpperCase() + u.plan.slice(1) : "Subscribed"}
                    </span>
                  ) : (
                    <span style={{
                      background: "#f1f5f9", color: "#94a3b8",
                      border: "1px solid #e2e8f0",
                      borderRadius: 20, padding: "4px 12px",
                      fontSize: 12, fontWeight: 600,
                    }}>
                      No plan
                    </span>
                  )}
                  <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4 }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-CA") : ""}
                  </div>
                </div>

                {/* Delete */}
                <div>
                  {confirmDel === u.email ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Sure?</span>
                      <button
                        onClick={() => handleDelete(u.email)}
                        disabled={deleting === u.email}
                        style={{
                          padding: "6px 12px", fontSize: 12, fontWeight: 700,
                          background: "#dc2626", color: "#fff",
                          border: "none", borderRadius: 6, cursor: "pointer",
                        }}
                      >
                        {deleting === u.email ? "Deleting…" : "Yes, Delete"}
                      </button>
                      <button
                        onClick={() => setConfirmDel(null)}
                        style={{
                          padding: "6px 12px", fontSize: 12,
                          background: "#f1f5f9", color: "#64748b",
                          border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDel(u.email)}
                      style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 600,
                        background: "#fff", color: "#dc2626",
                        border: "1.5px solid #fecaca", borderRadius: 7, cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
