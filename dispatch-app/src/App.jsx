import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext.jsx";
import Login from "./routes/Login.jsx";
import SetNewPassword from "./routes/SetNewPassword.jsx";
import AdminLayout from "./routes/admin/AdminLayout.jsx";
import Dashboard from "./routes/admin/Dashboard.jsx";
import DispatchForm from "./routes/admin/DispatchForm.jsx";
import EditDispatch from "./routes/admin/EditDispatch.jsx";
import ApprovalQueue from "./routes/admin/ApprovalQueue.jsx";
import AddWorker from "./routes/admin/AddWorker.jsx";
import Workers from "./routes/admin/Workers.jsx";
import WorkerSchedule from "./routes/admin/WorkerSchedule.jsx";
import QboSettings from "./routes/admin/QboSettings.jsx";
import ClientCompanies from "./routes/admin/ClientCompanies.jsx";
import ContractorSchedule from "./routes/admin/ContractorSchedule.jsx";
import AdminPaystubs from "./routes/admin/Paystubs.jsx";
import PayrollSummary from "./routes/admin/PayrollSummary.jsx";
import CustomerInvoicing from "./routes/admin/CustomerInvoicing.jsx";
import WorkerLayout from "./routes/worker/WorkerLayout.jsx";
import MyDispatches from "./routes/worker/MyDispatches.jsx";
import SubmitTimesheet from "./routes/worker/SubmitTimesheet.jsx";
import TimesheetHistory from "./routes/worker/TimesheetHistory.jsx";
import Profile from "./routes/worker/Profile.jsx";
import WorkerPaystubs from "./routes/worker/Paystubs.jsx";

function Gate() {
  const { session, profile, loading } = useAuth();

  if (loading) return <p>Loading...</p>;
  if (!session) return <Login />;
  if (!profile) return <p>Loading profile...</p>;
  if (profile.must_change_password) return <SetNewPassword />;

  if (profile.role === "admin") {
    return (
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dispatch/new" element={<DispatchForm />} />
          <Route path="/dispatch/:dispatchId/edit" element={<EditDispatch />} />
          <Route path="/approvals" element={<ApprovalQueue />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/workers/new" element={<AddWorker />} />
          <Route path="/workers/:workerId" element={<WorkerSchedule />} />
          <Route path="/quickbooks" element={<QboSettings />} />
          <Route path="/contractors" element={<ClientCompanies />} />
          <Route path="/contractors/:companyId" element={<ContractorSchedule />} />
          <Route path="/paystubs" element={<AdminPaystubs />} />
          <Route path="/payroll-summary" element={<PayrollSummary />} />
          <Route path="/customer-invoicing" element={<CustomerInvoicing />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<WorkerLayout />}>
        <Route path="/" element={<MyDispatches />} />
        <Route path="/timesheet/:dispatchId" element={<SubmitTimesheet />} />
        <Route path="/history" element={<TimesheetHistory />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/paystubs" element={<WorkerPaystubs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}
