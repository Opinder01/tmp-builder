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

// ---------- component ----------
export default function Subscribe() {
  const nav = useNavigate();
  const user = getAuthUser();
  const [contactOpen, setContactOpen] = useState(false);
  const [contactStatus, setContactStatus] = useState({ type: "", msg: "" }); // "success" | "error"
  const [contactLoading, setContactLoading] = useState(false);
  const [contactTouched, setContactTouched] = useState(false);
  const [contactForm, setContactForm] = useState(() =>
    contactFormDefaultsFromUser(getAuthUser())
  );

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
    const onKey = (ev) => {
      if (ev.key === "Escape") setContactOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [contactOpen]);

  // 🔒 If already subscribed or on trial → go to dashboard
  if (
    user?.plan &&
    (user.subscriptionStatus === "trial" ||
      user.subscriptionStatus === "active")
  ) {
    nav("/dashboard", { replace: true });
    return null;
  }

  // 🔒 If not logged in (safety)
  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Please log in</h2>
        <p>You need an account before choosing a plan.</p>
      </div>
    );
  }

  // ---------- plans ----------
  const PLANS = [
    {
      id: "monthly",
      title: "Monthly",
      price: 69.99,
      period: "month",
    },
    {
      id: "yearly",
      title: "Yearly",
      price: 699.99,
      period: "year",
      badge: "Save 20.2%",
    },
  ];

  const startTrial = (plan) => {
    const trialEndsAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const updatedUser = {
      ...user,
      plan: plan.id,
      planPrice: plan.price,
      subscriptionStatus: "trial",
      trialEndsAt,
    };

    setAuthUser(updatedUser);
    nav("/dashboard");
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
                >
                  Start free trial
                </button>
              </div>
            ))}
          </div>

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
