import Subscribe from "./Subscribe";
import Success from "./Success";
import CookieBanner from "./CookieBanner";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Landing from "./Landing";
import Login from "./Login";
import Signup from "./Signup";
import ForgotPassword from "./ForgotPassword";
import Dashboard from "./Dashboard";
import Editor from "./Editor";
import ProtectedRoute from "./ProtectedRoute";
import Privacy from "./Privacy";
import Terms from "./Terms";
import Admin from "./Admin";
import WeMakeYourTMP from "./WeMakeYourTMP";
import TMPOrderForm from "./TMPOrderForm";
import TMPOrderSuccess from "./TMPOrderSuccess";

export default function App() {
  return (
    <BrowserRouter>
    <CookieBanner />
    <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/subscribe" element={<Subscribe />} />
        <Route path="/success" element={<Success />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/editor"
          element={
            <ProtectedRoute>
              <Editor />
            </ProtectedRoute>
          }
        />

        <Route path="/admin" element={<Admin />} />

        <Route path="/we-make-your-tmp" element={<WeMakeYourTMP />} />
        <Route path="/tmp-order" element={<TMPOrderForm />} />
        <Route path="/tmp-order-success" element={<TMPOrderSuccess />} />

        {/* Catch-all: any unknown URL → landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
