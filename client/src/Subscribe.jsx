import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./Subscribe.css";

// ---------- helpers ----------
function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser"));
  } catch {
    return null;
  }
}

function setAuthUser(nextUser) {
  localStorage.setItem("loggedInUser", JSON.stringify(nextUser));
}

/** Pre-fill email, company, and phone from the logged-in account (same as signup fields). */
function contactFormDefaultsFromUser(u) {
  return {
    firstName: "",
    lastName: "",
    email: u?.email || "",
    companyName: u?.companyName || "",
    phoneNumber: u?.phone || "",
    subject: "",
    message: "",
  };
}

// ---------- plans ----------
const PLANS = [
  { id: "monthly", title: "Monthly", price: 69.99,  period: "month" },
  { id: "yearly",  title: "Yearly",  price: 699.99, period: "year", badge: "Save 20.2%" },
];

// ---------- component ----------
export default function Subscribe() {
  const navigate = useNavigate();

  // Read user once on mount — never re-read so guards stay stable across re-renders
  const [user] = useState(() => getAuthUser());

  // ── ALL hooks must come before any conditional return ──────────────────────

  // Redirect already-subscribed users.
  // Checks localStorage first (instant), then calls the API to catch users
  // whose localStorage doesn't have subscribed:true yet (e.g. after a fix
  // deployed while they were already logged in).
  useEffect(() => {
    // If localStorage already says subscribed, redirect immediately
    if (user?.subscribed === true) {
      navigate("/dashboard", { replace: true });
      return;
    }

    // Otherwise, ask the API — catches existing subscribers whose localStorage
    // is stale (webhook was broken, just fixed, etc.)
    if (!user?.email) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    fetch(`/api/subscription-status?email=${encodeURIComponent(user.email)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.subscribed === true) {
          // Update localStorage so ProtectedRoute passes on next navigation
          const updated = {
            ...user,
            subscribed:           true,
            plan:                 data.plan                 ?? user.plan,
            stripeCustomerId:     data.stripeCustomerId     ?? user.stripeCustomerId,
            stripeSubscriptionId: data.stripeSubscriptionId ?? user.stripeSubscriptionId,
          };
          localStorage.setItem("loggedInUser", JSON.stringify(updated));

          // Also update users[] array so future logins work offline
          try {
            const allUsers = JSON.parse(localStorage.getItem("users") || "[]");
            localStorage.setItem(
              "users",
              JSON.stringify(
                allUsers.map((u) =>
                  u.email?.toLowerCase() === user.email?.toLowerCase()
                    ? { ...u, subscribed: true, plan: updated.plan }
                    : u
                )
              )
            );
          } catch { /* non-critical */ }

          navigate("/dashboard", { replace: true });
        }
      })
      .catch(() => { /* ignore — user stays on subscribe page */ })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [contactOpen,    setContactOpen]    = useState(false);
  const [contactStatus,  setContactStatus]  = useState({ type: "", msg: "" });
  const [contactLoading, setContactLoading] = useState(false);
  const [contactTouched, setContactTouched] = useState(false);
  const [contactForm,    setContactForm]    = useState(() => contactFormDefaultsFromUser(getAuthUser()));
  const [checkoutLoading, setCheckoutLoading] = useState(null); // "monthly" | "yearly" | null
  const [checkoutError,   setCheckoutError]   = useState("");

  const contactErrors = useMemo(() => {
    const trim = (v) => String(v ?? "").trim();
    const e = {};
    if (!trim(contactForm.firstName)) e.firstName = "First name is required.";
    if (!trim(contactForm.lastName)) e.lastName = "Last name is required.";
    const email = trim(contactForm.email);
    if (!email) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email.";
    if (!trim(contactForm.subject)) e.subject = "Subject is required.";
    if (!trim(contactForm.message)) e.message = "Message is required.";
    return e;
  }, [contactForm]);

  useEffect(() => {
    if (!contactOpen) return;
    const onKey = (ev) => { if (ev.key === "Escape") setContactOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [contactOpen]);

  // ── End of hooks ───────────────────────────────────────────────────────────

  // Guard: not logged in
  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Please log in</h2>
        <p>You need an account before choosing a plan.</p>
      </div>
    );
  }

  // Guard: render nothing while a redirect is in flight.
  if (user?.subscribed === true) return null;

  const startTrial = async (plan) => {
    setCheckoutError("");
    setCheckoutLoading(plan.id);
    console.log("[Stripe] Button clicked – plan:", plan.id);

    try {
      console.log("[Stripe] Sending POST /api/stripe/create-checkout-session …");
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id }),
      });

      console.log("[Stripe] Response status:", res.status, res.ok ? "OK" : "ERROR");

      // Try to parse JSON; if it fails the server probably returned HTML (wrong route / no API server)
      let data;
      const rawText = await res.text();
      try {
        data = JSON.parse(rawText);
      } catch {
        console.error("[Stripe] Response is not JSON. Raw body:\n", rawText.slice(0, 400));
        throw new Error(
          "API route not found. Make sure you're running `vercel dev` (not `npm run dev`) " +
          "so the /api/ functions are served."
        );
      }

      console.log("[Stripe] Response data:", data);

      if (!res.ok) {
        throw new Error(data?.error || `Server error ${res.status}`);
      }

      if (!data.url) {
        throw new Error("No checkout URL in response: " + JSON.stringify(data));
      }

      console.log("[Stripe] Redirecting to:", data.url);
      window.location.href = data.url;

    } catch (err) {
      console.error("[Stripe] Checkout error:", err);
      setCheckoutError(err?.message || "Something went wrong. Please try again.");
      setCheckoutLoading(null);
    }
  };

  async function submitContact(e) {
    e.preventDefault();
    setContactTouched(true);
    setContactStatus({ type: "", msg: "" });

    if (Object.keys(contactErrors).length) return;

    setContactLoading(true);
    try {
      const payload = {
        firstName: String(contactForm.firstName || "").trim(),
        lastName: String(contactForm.lastName || "").trim(),
        email: String(contactForm.email || "").trim(),
        companyName: String(contactForm.companyName || "").trim(),
        phoneNumber: String(contactForm.phoneNumber || "").trim(),
        subject: String(contactForm.subject || "").trim(),
        message: String(contactForm.message || "").trim(),
      };

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to send message. Please try again.");
      }

      setContactStatus({
        type: "success",
        msg: "Thank you. Your message has been sent successfully.",
      });
      setContactForm(contactFormDefaultsFromUser(user));
    } catch (err) {
      setContactStatus({
        type: "error",
        msg: err?.message || "Failed to send message. Please try again.",
      });
    } finally {
      setContactLoading(false);
    }
  }

  // ---------- UI ----------
  const contactModal =
    contactOpen &&
    createPortal(
      <div
        className="modalOverlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) setContactOpen(false);
        }}
      >
        <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
          <div className="modalTop">
            <div>
              <h2 id="contact-modal-title" className="modalTitle">
                Contact Us
              </h2>
              <p className="modalSub">Tell us what you need and we’ll get back to you.</p>
            </div>
            <button
              type="button"
              className="modalClose"
              onClick={() => setContactOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <form className="contactForm" onSubmit={submitContact}>
            <div className="fieldGrid">
              <label className="field">
                <span>First Name *</span>
                <input
                  value={contactForm.firstName}
                  onChange={(e) => setContactForm((f) => ({ ...f, firstName: e.target.value }))}
                  onBlur={() => setContactTouched(true)}
                />
                {contactTouched && contactErrors.firstName && (
                  <span className="err">{contactErrors.firstName}</span>
                )}
              </label>

              <label className="field">
                <span>Last Name *</span>
                <input
                  value={contactForm.lastName}
                  onChange={(e) => setContactForm((f) => ({ ...f, lastName: e.target.value }))}
                  onBlur={() => setContactTouched(true)}
                />
                {contactTouched && contactErrors.lastName && (
                  <span className="err">{contactErrors.lastName}</span>
                )}
              </label>

              <label className="field fieldFull">
                <span>Email Address *</span>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  onBlur={() => setContactTouched(true)}
                />
                {contactTouched && contactErrors.email && (
                  <span className="err">{contactErrors.email}</span>
                )}
              </label>

              <label className="field">
                <span>Company Name</span>
                <input
                  value={contactForm.companyName}
                  onChange={(e) => setContactForm((f) => ({ ...f, companyName: e.target.value }))}
                />
              </label>

              <label className="field">
                <span>Phone Number</span>
                <input
                  value={contactForm.phoneNumber}
                  onChange={(e) => setContactForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                />
              </label>

              <label className="field fieldFull">
                <span>Subject *</span>
                <input
                  value={contactForm.subject}
                  onChange={(e) => setContactForm((f) => ({ ...f, subject: e.target.value }))}
                  onBlur={() => setContactTouched(true)}
                />
                {contactTouched && contactErrors.subject && (
                  <span className="err">{contactErrors.subject}</span>
                )}
              </label>

              <label className="field fieldFull">
                <span>Message / Description *</span>
                <textarea
                  rows={5}
                  value={contactForm.message}
                  onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                  onBlur={() => setContactTouched(true)}
                />
                {contactTouched && contactErrors.message && (
                  <span className="err">{contactErrors.message}</span>
                )}
              </label>
            </div>

            {contactStatus.type ? (
              <div className={contactStatus.type === "success" ? "notice ok" : "notice bad"}>
                {contactStatus.msg}
              </div>
            ) : null}

            <div className="actionsRow">
              <button
                type="button"
                className="btnGhost"
                onClick={() => setContactOpen(false)}
                disabled={contactLoading}
              >
                Cancel
              </button>
              <button type="submit" className="btnPrimary" disabled={contactLoading}>
                {contactLoading ? "Sending..." : "Send message"}
              </button>
            </div>
          </form>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <div className="subWrap">
        <div className="subInner">
          <div className="subHeader">
            <h1>Choose your plan</h1>
            <p>
              Start your <b>7-day free trial</b>. Cancel anytime.{" "}
              <b>Money-back guarantee:</b> 14 days after first payment.
            </p>
          </div>

          <div className="planGrid">
            {PLANS.map((plan) => (
              <div key={plan.id} className="card">
                <div className="cardTop">
                  <h2 className="cardTitle">{plan.title}</h2>
                  {plan.badge && (
                    <span className="badge">{plan.badge}</span>
                  )}
                </div>

                <div className="priceRow">
                  <div className="price">${plan.price}</div>
                  <div className="per">/ {plan.period} (CAD)</div>
                </div>

                <ul className="list">
                  <li>7-day free trial</li>
                  <li>Full access during trial</li>
                  <li>Money-back guarantee (14 days)</li>
                </ul>

                <button
                  className="cta"
                  onClick={() => startTrial(plan)}
                  disabled={checkoutLoading !== null}
                >
                  {checkoutLoading === plan.id ? "Redirecting…" : "Start free trial"}
                </button>
              </div>
            ))}
          </div>
          {checkoutError && (
            <p style={{ color: "#c0392b", textAlign: "center", marginTop: 12, fontSize: 14 }}>
              {checkoutError}
            </p>
          )}

          <div className="section">
            <h3>Need help?</h3>
            <p>
              Call us: <b>6729225617</b> or{" "}
              <button
                type="button"
                className="contactLink"
                onClick={() => {
                  setContactTouched(false);
                  setContactStatus({ type: "", msg: "" });
                  setContactForm(contactFormDefaultsFromUser(getAuthUser()));
                  setContactOpen(true);
                }}
              >
                Contact Us
              </button>
            </p>
          </div>

          <div className="section faq">
            <h3>FAQ</h3>

            <details>
              <summary>How does the 7-day free trial work?</summary>
              <p>You get full access for 7 days.</p>
            </details>

            <details>
              <summary>When will I be charged?</summary>
              <p>After the trial ends.</p>
            </details>

            <details>
              <summary>Can I cancel anytime?</summary>
              <p>Yes, anytime.</p>
            </details>
          </div>
        </div>
      </div>
      {contactModal}
    </>
  );
}
