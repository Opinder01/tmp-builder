import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useMemo } from "react";
import { Zap, MapPin, TriangleAlert, Ruler, FileText, Map } from "lucide-react";
import "./Landing.css";

function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Contact form helpers ──────────────────────────────────────────────────────
const EMPTY_FORM = { firstName: "", lastName: "", email: "", companyName: "", phoneNumber: "", subject: "", message: "" };

function validateContact(f) {
  const trim = (v) => String(v ?? "").trim();
  const e = {};
  if (!trim(f.firstName)) e.firstName = "First name is required.";
  if (!trim(f.lastName))  e.lastName  = "Last name is required.";
  const em = trim(f.email);
  if (!em) e.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) e.email = "Enter a valid email.";
  if (!trim(f.subject)) e.subject = "Subject is required.";
  if (!trim(f.message)) e.message = "Message is required.";
  return e;
}

export default function Landing() {
  const nav = useNavigate();

  // ── Scroll progress bar (direct DOM — no re-render on scroll) ────────────
  const barRef = useRef(null);
  useEffect(() => {
    function onScroll() {
      const el = document.documentElement;
      const scrolled = el.scrollTop || document.body.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      const pct = total > 0 ? (scrolled / total) * 100 : 0;
      if (barRef.current) barRef.current.style.width = pct + "%";
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Contact form state ───────────────────────────────────────────────────
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState({ type: "", msg: "" });

  const errors = useMemo(() => validateContact(form), [form]);

  async function submitContact(e) {
    e.preventDefault();
    setTouched(true);
    setStatus({ type: "", msg: "" });
    if (Object.keys(errors).length) return;
    setLoading(true);
    try {
      const payload = {
        firstName:   form.firstName.trim(),
        lastName:    form.lastName.trim(),
        email:       form.email.trim(),
        companyName: form.companyName.trim(),
        phoneNumber: form.phoneNumber.trim(),
        subject:     form.subject.trim(),
        message:     form.message.trim(),
      };
      const res  = await fetch("/api/contact", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send. Please try again.");
      setStatus({ type: "success", msg: "Message sent! We'll get back to you shortly." });
      setForm(EMPTY_FORM);
      setTouched(false);
    } catch (err) {
      setStatus({ type: "error", msg: err?.message || "Failed to send. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── SCROLL PROGRESS BAR ── */}
      <div ref={barRef} className="lp-scroll-bar" />

      <div className="lp-root">

        {/* ── NAV ── */}
        <nav className="lp-nav">
          <div className="lp-nav-inner">
            <div className="lp-logo">
              <img src="/logo.png" alt="TMP Builder" className="lp-logo-full" />
            </div>
            <div className="lp-nav-links">
              <button className="lp-nav-link" onClick={() => scrollTo("features")}>Features</button>
              <button className="lp-nav-link" onClick={() => scrollTo("contact")}>Contact</button>
              <button className="lp-btn-ghost" onClick={() => nav("/login")}>Login</button>
              <button className="lp-btn-primary" onClick={() => nav("/signup")}>Start Free Trial</button>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-hero-grid">
            <div className="lp-hero-inner">
              <div className="lp-badge">Compliant with BC TMM MOTI Standards</div>
              <h1 className="lp-hero-h1">
                Create Professional<br />
                <span className="lp-accent">Traffic Management Plans</span><br />
                Faster
              </h1>
              <p className="lp-hero-sub">
                BC-based TMP software built for Canadian traffic control companies.
                Place signs, cones, work areas, and export clean PDFs — all in your browser.
              </p>
              <div className="lp-hero-btns">
                <button className="lp-btn-cta lp-btn-lg" onClick={() => nav("/signup")}>
                  Start Free 7-Day Trial →
                </button>
                <button className="lp-btn-ghost lp-btn-lg" onClick={() => nav("/login")}>
                  Login
                </button>
              </div>
            </div>

            {/* decorative map preview */}
            <div className="lp-hero-visual">
              <div className="lp-map-card">
                <div className="lp-map-bar">
                  <span className="lp-dot red" /><span className="lp-dot yellow" /><span className="lp-dot green" />
                  <span className="lp-map-bar-title">TMP Builder — Editor</span>
                </div>
                <div className="lp-map-body">
                  <div className="lp-map-mock">
                    <div className="lp-road lp-road-h" />
                    <div className="lp-road lp-road-v" />
                    <div className="lp-cone" style={{ top: "28%", left: "38%" }} />
                    <div className="lp-cone" style={{ top: "36%", left: "40%" }} />
                    <div className="lp-cone" style={{ top: "44%", left: "42%" }} />
                    <div className="lp-sign-box" style={{ top: "20%", left: "58%" }}>
                      <span>R-001</span>
                    </div>
                    <div className="lp-sign-box" style={{ top: "52%", left: "20%" }}>
                      <span>C-001</span>
                    </div>
                    <div className="lp-work-area" />
                    <div className="lp-title-box">
                      <div className="lp-tb-row"><b>Project:</b> Hwy 1 Resurfacing</div>
                      <div className="lp-tb-row"><b>Date:</b> 2026-05-17</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SOCIAL PROOF ── */}
        <div className="lp-proof-strip">
          <div className="lp-proof-inner">
            <span className="lp-proof-label">Built for BC traffic control professionals</span>
            <div className="lp-proof-stats">
              <div className="lp-proof-stat"><span className="lp-proof-num">100%</span><span className="lp-proof-text">Browser-based — no install</span></div>
              <div className="lp-proof-divider" />
              <div className="lp-proof-stat"><span className="lp-proof-num">BC TMM MOTI</span><span className="lp-proof-text">Sign catalog included</span></div>
              <div className="lp-proof-divider" />
              <div className="lp-proof-stat"><span className="lp-proof-num">PDF</span><span className="lp-proof-text">Submission-ready export</span></div>
              <div className="lp-proof-divider" />
              <div className="lp-proof-stat"><span className="lp-proof-num">7-day</span><span className="lp-proof-text">Free trial, full access</span></div>
            </div>
          </div>
        </div>

        {/* ── FEATURES ── */}
        <section className="lp-features" id="features">
          <div className="lp-section-inner">
            <div className="lp-section-label">Features</div>
            <h2 className="lp-section-h2">Everything you need to create TMPs</h2>
            <p className="lp-section-sub">
              Designed to help prepare TMPs according to BC TMM MOTI (Ministry of Transportation and Infrastructure)
              traffic management requirements and guidelines.
            </p>

            <div className="lp-feat-grid">
              {[
                {
                  icon: <Zap size={26} strokeWidth={2} />,
                  color: "#f97316",
                  title: "Create TMPs Faster",
                  desc: "Drag-and-drop signs, cones, barriers, and work areas directly onto a live Google Maps aerial. No CAD software needed.",
                },
                {
                  icon: <MapPin size={26} strokeWidth={2} />,
                  color: "#0ea5e9",
                  title: "Built for BC Traffic Control",
                  desc: "Pre-loaded Canadian sign catalog (R-, C-, W-series and more) designed for BC TMM MOTI (Ministry of Transportation and Infrastructure) requirements.",
                },
                {
                  icon: <TriangleAlert size={26} strokeWidth={2} />,
                  color: "#ef4444",
                  title: "Full Sign & Cone Toolkit",
                  desc: "Place regulatory signs, construction cones, barriers, pedestrian tape, arrow boards, and work area polygons with ease.",
                },
                {
                  icon: <Ruler size={26} strokeWidth={2} />,
                  color: "#8b5cf6",
                  title: "Measurements & Annotations",
                  desc: "Add measurement lines, text labels, rectangles, and tables directly on the plan for professional documentation.",
                },
                {
                  icon: <FileText size={26} strokeWidth={2} />,
                  color: "#10b981",
                  title: "Export Clean Professional PDFs",
                  desc: "One-click PDF export with title block, north arrow, scale bar, legend, and manifest — ready for submission.",
                },
                {
                  icon: <Map size={26} strokeWidth={2} />,
                  color: "#f59e0b",
                  title: "Live Aerial Map Base",
                  desc: "Build your TMP on a real satellite or road map. Zoom, pan, and frame the exact work zone area you need.",
                },
              ].map((f) => (
                <div className="lp-feat-card" key={f.title}>
                  <div className="lp-feat-icon" style={{ color: f.color, background: f.color + "18" }}>
                    {f.icon}
                  </div>
                  <h3 className="lp-feat-title">{f.title}</h3>
                  <p className="lp-feat-desc">{f.desc}</p>
                </div>
              ))}
            </div>

            {/* CTA after features */}
            <div className="lp-feat-cta">
              <button className="lp-btn-cta lp-btn-lg" onClick={() => nav("/signup")}>
                Start Free 7-Day Trial →
              </button>
            </div>
          </div>
        </section>


        {/* ── PRICING ── */}
        <section className="lp-pricing" id="pricing">
          <div className="lp-section-inner">
            <div className="lp-section-label">Pricing</div>
            <h2 className="lp-section-h2">Simple, transparent pricing</h2>
            <p className="lp-section-sub">7-day free trial on every plan. Money-back guarantee within 14 days of first payment.</p>

            <div className="lp-price-grid">
              <div className="lp-price-card">
                <div className="lp-price-name">Monthly</div>
                <div className="lp-price-amount">$69.99<span>/mo CAD</span></div>
                <ul className="lp-price-list">
                  <li>✓ 7-day free trial</li>
                  <li>✓ Full access during trial</li>
                  <li>✓ Money-back guarantee (14 days)</li>
                  <li>✓ Unlimited TMPs</li>
                  <li>✓ PDF export</li>
                  <li>✓ All sign catalog updates</li>
                </ul>
                <button className="lp-btn-cta lp-btn-block" onClick={() => nav("/signup")}>
                  Start Free Trial
                </button>
              </div>

              <div className="lp-price-card lp-price-card-featured">
                <div className="lp-price-badge">Best Value</div>
                <div className="lp-price-name">Annual</div>
                <div className="lp-price-amount">$699.99<span>/yr CAD</span></div>
                <ul className="lp-price-list">
                  <li>✓ 7-day free trial</li>
                  <li>✓ Full access during trial</li>
                  <li>✓ Money-back guarantee (14 days)</li>
                  <li>✓ Unlimited TMPs</li>
                  <li>✓ PDF export</li>
                  <li>✓ All sign catalog updates</li>
                  <li>✓ Save ~$140 vs monthly</li>
                </ul>
                <button className="lp-btn-cta lp-btn-block" onClick={() => nav("/signup")}>
                  Start Free Trial
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="lp-faq">
          <div className="lp-section-inner">
            <div className="lp-section-label">FAQ</div>
            <h2 className="lp-section-h2">Common questions</h2>
            <div className="lp-faq-grid">
              {[
                {
                  q: "How does the 7-day free trial work?",
                  a: "You get full access to every feature for 7 days — no restrictions. Create real TMPs, export PDFs, and explore the full sign catalog. Your trial starts the moment you sign up.",
                },
                {
                  q: "When will I be charged?",
                  a: "Your first payment is processed after the 7-day trial ends. You'll receive a reminder before you're charged so you can cancel if it's not right for you.",
                },
                {
                  q: "Can I cancel anytime?",
                  a: "Yes, anytime — no questions asked. Cancel from your account dashboard before the trial or billing period ends and you won't be charged.",
                },
                {
                  q: "Is there a money-back guarantee?",
                  a: "Yes. If you're not satisfied within 14 days of your first payment, contact us and we'll issue a full refund.",
                },
                {
                  q: "Do I need to install anything?",
                  a: "No. TMP Builder runs entirely in your browser. No downloads, no plugins, no IT setup required — just log in and start building.",
                },
                {
                  q: "What sign catalog is included?",
                  a: "The full BC TMM MOTI sign catalog including R-series (regulatory), C-series (construction), and W-series (warning) signs. The catalog is kept up to date with MOTI requirements.",
                },
              ].map((item) => (
                <details className="lp-faq-item" key={item.q}>
                  <summary className="lp-faq-q">{item.q}</summary>
                  <p className="lp-faq-a">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CONTACT ── */}
        <section className="lp-contact" id="contact">
          <div className="lp-section-inner">
            <div className="lp-contact-grid">
              {/* Left — info */}
              <div className="lp-contact-info">
                <div className="lp-section-label">Contact</div>
                <h2 className="lp-section-h2 lp-contact-h2">Need help getting started?</h2>
                <p className="lp-contact-sub">
                  Our team is here to help you get up and running quickly. Fill out the form or email us directly.
                </p>
                <div className="lp-contact-links">
                  <a href="mailto:info@tmpbuilder.ca" className="lp-contact-link">
                    <span className="lp-contact-icon">✉</span> info@tmpbuilder.ca
                  </a>
                </div>
              </div>

              {/* Right — contact form */}
              <form className="lp-contact-form" onSubmit={submitContact} noValidate>
                <div className="lp-cf-row">
                  <label className="lp-cf-field">
                    <span>First Name *</span>
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      onBlur={() => setTouched(true)}
                      placeholder="Jane"
                    />
                    {touched && errors.firstName && <span className="lp-cf-err">{errors.firstName}</span>}
                  </label>
                  <label className="lp-cf-field">
                    <span>Last Name *</span>
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      onBlur={() => setTouched(true)}
                      placeholder="Doe"
                    />
                    {touched && errors.lastName && <span className="lp-cf-err">{errors.lastName}</span>}
                  </label>
                </div>
                <label className="lp-cf-field">
                  <span>Email Address *</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    onBlur={() => setTouched(true)}
                    placeholder="jane@company.com"
                  />
                  {touched && errors.email && <span className="lp-cf-err">{errors.email}</span>}
                </label>
                <div className="lp-cf-row">
                  <label className="lp-cf-field">
                    <span>Company Name</span>
                    <input
                      value={form.companyName}
                      onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                      placeholder="ABC Traffic Control"
                    />
                  </label>
                  <label className="lp-cf-field">
                    <span>Phone Number</span>
                    <input
                      value={form.phoneNumber}
                      onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                      placeholder="(604) 555-0100"
                    />
                  </label>
                </div>
                <label className="lp-cf-field">
                  <span>Subject *</span>
                  <input
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    onBlur={() => setTouched(true)}
                    placeholder="Question about the trial"
                  />
                  {touched && errors.subject && <span className="lp-cf-err">{errors.subject}</span>}
                </label>
                <label className="lp-cf-field">
                  <span>Message *</span>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    onBlur={() => setTouched(true)}
                    placeholder="How can we help?"
                  />
                  {touched && errors.message && <span className="lp-cf-err">{errors.message}</span>}
                </label>

                {status.type && (
                  <div className={status.type === "success" ? "lp-cf-notice ok" : "lp-cf-notice err"}>
                    {status.msg}
                  </div>
                )}

                <button type="submit" className="lp-btn-cta lp-btn-block" disabled={loading}>
                  {loading ? "Sending…" : "Send Message →"}
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="lp-footer">
          <div className="lp-footer-inner">
            <div className="lp-footer-brand">
              <img src="/logo.png" alt="TMP Builder" className="lp-logo-full lp-logo-full-footer" />
            </div>
            <div className="lp-footer-meta">
              Victoria, BC · Canada
            </div>
            <div className="lp-footer-links">
              <button className="lp-footer-link" onClick={() => nav("/login")}>Login</button>
              <button className="lp-footer-link" onClick={() => nav("/signup")}>Sign Up</button>
              <button className="lp-footer-link" onClick={() => nav("/privacy")}>Privacy Policy</button>
              <button className="lp-footer-link" onClick={() => nav("/terms")}>Terms of Service</button>
            </div>
            <div className="lp-footer-copy">
              © {new Date().getFullYear()} TMP Builder. All rights reserved.
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
