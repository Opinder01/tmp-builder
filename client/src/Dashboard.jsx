import GoogleMapPicker from "./GoogleMapPicker";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";


/* ========= helpers ========= */
function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null");
  } catch {
    return null;
  }
}

function getProjectsKey() {
  const user = getLoggedInUser();
  const email = (user?.email || "anonymous").replace(/[^a-zA-Z0-9@._-]/g, "_");
  return `tmp_projects_v1_${email}`;
}

function getProjects() {
  const key = getProjectsKey();
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function friendlyGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function getProjectId(p) {
  return p.id || p.projectId || p._id || p.name || p.title;
}

/* ========= component ========= */
export default function Dashboard() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = getLoggedInUser();

  const [active, setActive] = useState("home"); // home | new | open | settings
  const [query, setQuery] = useState("");
  const [settingsTab, setSettingsTab] = useState("company"); // company | account
  const [projects, setProjects] = useState([]);
useEffect(() => {
  const sp = new URLSearchParams(loc.search);
  const tab = (sp.get("tab") || "").toLowerCase();

  if (tab === "home" || tab === "new" || tab === "open" || tab === "settings") {
    setActive(tab);
  }
}, [loc.search]);


  useEffect(() => {
  setProjects(getProjects());
}, [active, loc.search]);


  const companyName = user?.companyName || "Your Company";

  const sortedProjects = useMemo(() => {
    const copy = [...projects];
    copy.sort((a, b) => {
      const at = a.updatedAt || a.modifiedAt || a.createdAt || a.date || 0;
      const bt = b.updatedAt || b.modifiedAt || b.createdAt || b.date || 0;
      return new Date(bt).getTime() - new Date(at).getTime();
    });
    return copy;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedProjects;
    return sortedProjects.filter((p) =>
      (p.name || p.title || "").toLowerCase().includes(q)
    );
  }, [sortedProjects, query]);

  const recentProjects = useMemo(() => filteredProjects.slice(0, 5), [filteredProjects]);

  const openProject = (project) => {
    const id = getProjectId(project);
    if (!id) return;
    localStorage.setItem("currentProjectId", String(id));
    localStorage.setItem("currentProjectSnapshot", JSON.stringify(project.snapshot || {}));
    nav("/editor");
  };

  const logout = () => {
    localStorage.removeItem("loggedInUser");
    nav("/login", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      {/* ===== Top Header ===== */}
      <div
        style={{
          padding: "18px 24px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            {friendlyGreeting()}, {companyName}
          </div>
          <div style={{ color: "#475569", marginTop: 4 }}>
            Canada’s First Dedicated TMP Builder
          </div>
        </div>

        {/* ✅ Only Logout in header */}
        <button
          onClick={logout}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      {/* ===== Body Layout: LEFT sidebar + MAIN content ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          minHeight: "calc(100vh - 70px)",
        }}
      >
        {/* ===== LEFT SIDEBAR ===== */}
        <div
          style={{
            borderRight: "1px solid #e5e7eb",
            padding: "18px 14px",
            background: "#fbfdff",
          }}
        >

          {[
            { key: "home", label: "Home" },
            { key: "new", label: "New TMP" },
            { key: "open", label: "Open" },
            { key: "settings", label: "Settings" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActive(item.key)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: active === item.key ? "#0f172a" : "#fff",
                color: active === item.key ? "#fff" : "#0f172a",
                fontWeight: 800,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div style={{ padding: "22px 24px" }}>
          {/* ---- HOME ---- */}
          {active === "home" && (
            <>
              {/* Search bar */}
              <div style={{ maxWidth: 720, marginBottom: 18 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search drawings…"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    outline: "none",
                  }}
                />
              </div>

              {/* Recent Drawings list */}
              <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 16 }}>
                Recent drawings
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", maxWidth: 900 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px 120px",
                    padding: "12px 14px",
                    background: "#f8fafc",
                    fontWeight: 800,
                    color: "#334155",
                    fontSize: 13,
                  }}
                >
                  <div>Name</div>
                  <div>Date modified</div>
                  <div style={{ textAlign: "right" }}>Action</div>
                </div>

                {recentProjects.length === 0 ? (
                  <div style={{ padding: 14, color: "#64748b" }}>
                    No drawings yet.
                  </div>
                ) : (
                  recentProjects.map((p, idx) => (
                    <div
                      key={(getProjectId(p) || idx) + "_recent"}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 180px 120px",
                        padding: "12px 14px",
                        borderTop: "1px solid #e5e7eb",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {p.name || p.title || "Untitled TMP"}
                      </div>
                      <div style={{ color: "#64748b" }}>
                        {formatDate(p.updatedAt || p.modifiedAt || p.createdAt || p.date)}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <button
                          onClick={() => openProject(p)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* ---- NEW TMP (icon only) ---- */}
          {active === "new" && (
  <div style={{ maxWidth: 1100 }}>
    <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>
      New TMP
    </div>
    <div style={{ color: "#64748b", marginBottom: 16 }}>
      Search an address or click on the map to drop a pin, then confirm the location.
    </div>

    <GoogleMapPicker
      onConfirm={(location) => {
        localStorage.setItem("tmp_new_location", JSON.stringify(location));
        nav("/editor"); // next step (we can create /confirm-location later)
      }}
    />
  </div>
)}



          {/* ---- OPEN (all saved files) ---- */}
          {active === "open" && (
            <div style={{ maxWidth: 900 }}>
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
                Open
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px 120px",
                    padding: "12px 14px",
                    background: "#f8fafc",
                    fontWeight: 800,
                    color: "#334155",
                    fontSize: 13,
                  }}
                >
                  <div>Name</div>
                  <div>Date modified</div>
                  <div style={{ textAlign: "right" }}>Action</div>
                </div>

                {sortedProjects.length === 0 ? (
                  <div style={{ padding: 14, color: "#64748b" }}>
                    No saved drawings yet.
                  </div>
                ) : (
                  sortedProjects.map((p, idx) => (
                    <div
                      key={(getProjectId(p) || idx) + "_open"}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 180px 120px",
                        padding: "12px 14px",
                        borderTop: "1px solid #e5e7eb",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {p.name || p.title || "Untitled TMP"}
                      </div>
                      <div style={{ color: "#64748b" }}>
                        {formatDate(p.updatedAt || p.modifiedAt || p.createdAt || p.date)}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <button
                          onClick={() => openProject(p)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ---- SETTINGS ---- */}
          {active === "settings" && (
            <div style={{ maxWidth: 900 }}>
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
                Settings
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <button
                  onClick={() => setSettingsTab("company")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: settingsTab === "company" ? "#0f172a" : "#fff",
                    color: settingsTab === "company" ? "#fff" : "#0f172a",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Company Profile
                </button>

                <button
                  onClick={() => setSettingsTab("account")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: settingsTab === "account" ? "#0f172a" : "#fff",
                    color: settingsTab === "account" ? "#fff" : "#0f172a",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Account
                </button>
              </div>

              {settingsTab === "company" && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>
                    Company Profile
                  </div>
                  <div style={{ color: "#475569", lineHeight: 1.9 }}>
                    <div><b>Company Name:</b> {user?.companyName || "—"}</div>
                    <div><b>Email:</b> {user?.email || "—"}</div>
                    <div><b>Phone:</b> {user?.phone || "—"}</div>
                  </div>
                </div>
              )}

              {settingsTab === "account" && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Account</div>
                  <div style={{ color: "#475569", lineHeight: 1.9 }}>
                    <div><b>User:</b> {user?.fullName || "—"}</div>
                    <div><b>Email:</b> {user?.email || "—"}</div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <button
                      onClick={logout}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
