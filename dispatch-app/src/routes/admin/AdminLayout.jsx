import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext.jsx";
import crownMark from "../../assets/crown-mark.png";

export default function AdminLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div>
      <header className="app-header">
        <div className="app-header-brand">
          <img src={crownMark} alt="" className="header-logo" />
          <div>
            <strong>Crown Traffic Management Ltd.</strong>
            <span className="subtle"> — Admin</span>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/dispatch/new">New Dispatch</NavLink>
          <NavLink to="/approvals">Approvals</NavLink>
          <NavLink to="/workers">Workers</NavLink>
          <NavLink to="/contractors">Contractors</NavLink>
          <NavLink to="/quickbooks">QuickBooks</NavLink>
          <NavLink to="/contractor-billing">Contractor Billing</NavLink>
          <NavLink to="/customer-invoicing">Customer Invoicing</NavLink>
        </nav>
        <div>
          <span className="subtle">{profile.full_name}</span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
