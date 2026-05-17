import { useNavigate } from "react-router-dom";
import "./Landing.css";

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="lp-root">

      {/* ── NAV ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-logo">
            <img src="/logo.png" alt="TMP Builder" className="lp-logo-full" />
          </div>
          <div className="lp-nav-links">
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#pricing" className="lp-nav-link">Pricing</a>
            <a href="#contact" className="lp-nav-link">Contact</a>
            <button className="lp-btn-ghost" onClick={() => nav("/login")}>Login</button>
            <button className="lp-btn-primary" onClick={() => nav("/signup")}>Start Free Trial</button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="lp-hero-grid">
        <div className="lp-hero-inner">
          <div className="lp-badge">
            <img src="/bc-flag.png" alt="BC" className="lp-badge-flag" />
            Compliant with BC MOT Standards
          </div>
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
            <div className="lp-proof-stat"><span className="lp-proof-num">BC MOT</span><span className="lp-proof-text">Sign catalog included</span></div>
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
            Designed to help prepare TMPs according to BC Ministry of Transportation
            traffic management requirements and guidelines.
          </p>

          <div className="lp-feat-grid">
            {[
              {
                icon: "⚡",
                title: "Create TMPs Faster",
                desc: "Drag-and-drop signs, cones, barriers, and work areas directly onto a live Google Maps aerial. No CAD software needed.",
              },
              {
                icon: "🇨🇦",
                title: "Built for BC Traffic Control",
                desc: "Pre-loaded Canadian sign catalog (R-, C-, W-series and more) designed for BC Ministry of Transportation requirements.",
              },
              {
                icon: "🛑",
                title: "Full Sign & Cone Toolkit",
                desc: "Place regulatory signs, construction cones, barriers, pedestrian tape, arrow boards, and work area polygons with ease.",
              },
              {
                icon: "📐",
                title: "Measurements & Annotations",
                desc: "Add measurement lines, text labels, rectangles, and tables directly on the plan for professional documentation.",
              },
              {
                icon: "📄",
                title: "Export Clean Professional PDFs",
                desc: "One-click PDF export with title block, north arrow, scale bar, legend, and manifest — ready for submission.",
              },
              {
                icon: "🗺️",
                title: "Live Aerial Map Base",
                desc: "Build your TMP on a real satellite or road map. Zoom, pan, and frame the exact work zone area you need.",
              },
            ].map((f) => (
              <div className="lp-feat-card" key={f.title}>
                <div className="lp-feat-icon">{f.icon}</div>
                <h3 className="lp-feat-title">{f.title}</h3>
                <p className="lp-feat-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="lp-how">
        <div className="lp-section-inner">
          <div className="lp-section-label">How It Works</div>
          <h2 className="lp-section-h2">From address to PDF in minutes</h2>
          <div className="lp-steps">
            {[
              { n: "1", title: "Search your work zone", desc: "Enter the job address and the map flies to the exact location." },
              { n: "2", title: "Place your elements", desc: "Drop signs, cones, barriers, work areas, and annotations onto the aerial map." },
              { n: "3", title: "Fill in the title block", desc: "Add project name, date, author, job location, and your company logo." },
              { n: "4", title: "Export your PDF", desc: "Click Export → Download a clean, professional PDF ready for submission." },
            ].map((s) => (
              <div className="lp-step" key={s.n}>
                <div className="lp-step-num">{s.n}</div>
                <div>
                  <div className="lp-step-title">{s.title}</div>
                  <div className="lp-step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
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

      {/* ── CONTACT ── */}
      <section className="lp-contact" id="contact">
        <div className="lp-section-inner lp-contact-inner">
          <div>
            <div className="lp-section-label">Contact</div>
            <h2 className="lp-section-h2 lp-contact-h2">Need help getting started?</h2>
            <p className="lp-contact-sub">
              Our team is here to help you get up and running quickly.
            </p>
            <div className="lp-contact-links">
              <a href="mailto:info@tmpbuilder.ca" className="lp-contact-link">
                <span className="lp-contact-icon">✉</span> info@tmpbuilder.ca
              </a>
              <a href="https://tmpbuilder.ca" className="lp-contact-link">
                <span className="lp-contact-icon">🌐</span> tmpbuilder.ca
              </a>
            </div>
          </div>
          <div className="lp-contact-cta">
            <p>Ready to try it?</p>
            <button className="lp-btn-cta lp-btn-lg" onClick={() => nav("/signup")}>
              Start Free 7-Day Trial →
            </button>
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
            <a href="mailto:info@tmpbuilder.ca" className="lp-footer-link">Contact</a>
          </div>
          <div className="lp-footer-copy">
            © {new Date().getFullYear()} TMP Builder. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
}
