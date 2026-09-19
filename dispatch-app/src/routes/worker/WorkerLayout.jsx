import { NavLink, Outlet } from "react-router-dom";
import crownLogo from "../../assets/crown-logo.png";

const icons = {
  dispatch: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="13" height="10" rx="1.5" />
      <path d="M16 10h3l2 2.5V17h-5" />
      <circle cx="7.5" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </svg>
  ),
  timesheet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 19.5c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5" />
    </svg>
  ),
  paystub: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v3h3" />
      <path d="M8.5 12h7M8.5 15.5h7M8.5 9h4" />
    </svg>
  ),
};

const tabs = [
  { to: "/", end: true, icon: "dispatch", label: "Dispatch" },
  { to: "/history", icon: "timesheet", label: "Timesheet" },
  { to: "/paystubs", icon: "paystub", label: "Paystub" },
  { to: "/profile", icon: "profile", label: "Profile" },
];

export default function WorkerLayout() {
  return (
    <div className="worker-shell">
      <header className="worker-header">
        <img src={crownLogo} alt="Crown Traffic Management Ltd." className="header-logo-full" />
      </header>

      <main className="worker-main">
        <Outlet />
      </main>

      <nav className="worker-tabbar">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="worker-tab">
            <span className="worker-tab-icon">{icons[tab.icon]}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
