import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

function HeroCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let W, H;
    const COLORS = ["#f97316","#38bdf8","#818cf8","#34d399","#fb923c"];
    const COUNT = 72, MAX_DIST = 160;
    const nodes = [];
    function resize() { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; }
    function initNodes() {
      nodes.length = 0;
      for (let i = 0; i < COUNT; i++) {
        nodes.push({ x: Math.random()*W, y: Math.random()*H, vx: (Math.random()-0.5)*0.55, vy: (Math.random()-0.5)*0.55, r: Math.random()*2.2+1.2, color: COLORS[Math.floor(Math.random()*COLORS.length)], pulse: Math.random()*Math.PI*2 });
      }
    }
    function draw() {
      ctx.clearRect(0,0,W,H);
      const bg = ctx.createLinearGradient(0,0,W,H);
      bg.addColorStop(0,"#060d1a"); bg.addColorStop(0.5,"#0d1f3c"); bg.addColorStop(1,"#071622");
      ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.x += a.vx; a.y += a.vy; a.pulse += 0.025;
        if (a.x < 0 || a.x > W) a.vx *= -1;
        if (a.y < 0 || a.y > H) a.vy *= -1;
        for (let j = i+1; j < nodes.length; j++) {
          const b = nodes[j], dx = a.x-b.x, dy = a.y-b.y, dist = Math.sqrt(dx*dx+dy*dy);
          if (dist < MAX_DIST) { ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.strokeStyle = `rgba(148,163,184,${(1-dist/MAX_DIST)*0.35})`; ctx.lineWidth=0.7; ctx.stroke(); }
        }
      }
      for (const n of nodes) {
        const p = 1+Math.sin(n.pulse)*0.3;
        const g = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*6*p);
        g.addColorStop(0,n.color+"55"); g.addColorStop(1,n.color+"00");
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r*6*p,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r*p,0,Math.PI*2); ctx.fillStyle=n.color; ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    resize(); initNodes(); draw();
    const ro = new ResizeObserver(() => { resize(); initNodes(); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

const GOOGLE_REVIEW_URL = "https://g.page/r/CTpVPRRnFdEAEBI/review";

const REVIEWS = [
  {
    name: "Jason M.",
    rating: 5,
    text: "Quick turnaround and the plan was exactly what we needed for our road closure permit. Saved us hours of drafting time.",
  },
  {
    name: "Sarah T.",
    rating: 5,
    text: "Professional quality drawings. The team was responsive and made a revision same-day when we updated the site layout. Highly recommend.",
  },
  {
    name: "Mike D.",
    rating: 5,
    text: "Used this service for three projects now. Fast, affordable, and TMM MOTI 2020 compliant every time. Worth every penny.",
  },
];

function StarRating({ rating }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width="15" height="15" viewBox="0 0 24 24" fill={s <= rating ? "#FBBC04" : "#e2e8f0"}>
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </div>
  );
}

function ReviewCard({ name, rating, text }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#f97316,#ea580c)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
          {name[0]}
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{name}</div>
      </div>
      <StarRating rating={rating} />
      <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>{text}</p>
    </div>
  );
}

export default function WeMakeYourTMP() {
  const nav = useNavigate();
  const [exOpen, setExOpen] = useState(false);
  const exRef = useRef(null);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    if (!exOpen) return;
    const handler = (e) => { if (exRef.current && !exRef.current.contains(e.target)) setExOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exOpen]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Inter,system-ui,-apple-system,Arial,sans-serif" }}>

      {/* Nav */}
      <nav style={{ background: "#0f172a", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => nav("/")} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <img src="/logo.png" alt="TMP Builder" style={{ height: 32 }} />
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => nav("/")} style={{ background: "none", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", padding: "7px 14px", cursor: "pointer", fontSize: 13 }}>
            Home
          </button>
          <button onClick={() => nav("/tmp-order")} style={{ background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none", borderRadius: 8, color: "#fff", padding: "7px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Order Now →
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: "relative", padding: "48px 24px 40px", textAlign: "center", overflow: "hidden" }}>
        <HeroCanvas />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto" }}>
          <h1 style={{ fontSize: "clamp(28px,5vw,46px)", fontWeight: 800, color: "#fff", margin: "0 0 14px", lineHeight: 1.15 }}>
            We Make Your TMP
          </h1>
          <p style={{ fontSize: "clamp(15px,2vw,17px)", color: "#94a3b8", lineHeight: 1.6, margin: "0 0 24px" }}>
            Provide us the job details we will create a Traffic Management Plan for you.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => nav("/tmp-order")}
              style={{ background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none", borderRadius: 8, color: "#fff", padding: "12px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              Order Your TMP
            </button>
            <div ref={exRef} style={{ position: "relative" }}>
              <button
                onClick={() => setExOpen((v) => !v)}
                style={{ background: "transparent", border: "1px solid #38bdf8", borderRadius: 8, color: "#38bdf8", padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                View Example TMPs
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: exOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {exOpen && (
                <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "6px", minWidth: 220, zIndex: 100, boxShadow: "0 -8px 24px rgba(0,0,0,0.4)" }}>
                  {[
                    { label: "Example 1", href: "/example-tmp-1.pdf" },
                    { label: "Example 2", href: "/example-tmp-2.pdf" },
                  ].map((ex) => (
                    <a key={ex.href} href={ex.href} target="_blank" rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 7, color: "#e2e8f0", textDecoration: "none", fontSize: 13, fontWeight: 500 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#334155"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      {ex.label}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <a
              href={GOOGLE_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: "transparent", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", padding: "12px 20px", fontSize: 14, fontWeight: 500, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              ★ Leave a Review
            </a>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <div style={{ background: "#1e293b", padding: "16px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", justifyContent: "center", gap: "32px", flexWrap: "wrap" }}>
          {[
            { num: "CA$200", label: "Per drawing, one-time" },
            { num: "2 days", label: "Turnaround time" },
            { num: "TMM MOTI 2020", label: "Compliant plans" },
            { num: "100%", label: "Satisfaction guarantee" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#f97316" }}>{s.num}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works + What's included side by side */}
      <section style={{ padding: "40px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 32 }}>

          {/* How it works */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>How It Works</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 20px" }}>Three simple steps</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { step: "01", title: "Submit Your Order", desc: "Fill out the order form with your site address, type of work, and any special requirements." },
                { step: "02", title: "Pay Online", desc: "Securely pay CA$200 per drawing through Stripe. No subscription, pay only for what you need." },
                { step: "03", title: "Receive Your TMP", desc: "Our certified engineers create your TMP plan and email it to you within 2 days." },
              ].map((s) => (
                <div key={s.step} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#f97316", opacity: 0.4, lineHeight: 1, minWidth: 32 }}>{s.step}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{s.title}</div>
                    <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55, margin: 0 }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What's included */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>What's Included</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 20px" }}>Professional-grade drawings</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "TMM MOTI 2020 compliant layout",
                "Correct sign placement & spacing",
                "Lane closure diagrams",
                "Work zone boundaries",
                "North arrow & scale bar",
                "Title block & legend",
                "All revisions included",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 14px" }}>
                  <span style={{ color: "#16a34a", fontSize: 14, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: "#334155" }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px" }}>See what a completed TMP looks like:</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Example 1", href: "/example-tmp-1.pdf" },
                  { label: "Example 2", href: "/example-tmp-2.pdf" },
                ].map((ex) => (
                  <a key={ex.href} href={ex.href} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px 14px", fontSize: 12, fontWeight: 600, color: "#0f172a", textDecoration: "none" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    {ex.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing + Reviews side by side */}
      <section style={{ padding: "40px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 32, alignItems: "start" }}>

          {/* Pricing card */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Pricing</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" }}>Simple, flat-rate pricing</h2>
            <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: 12, padding: "24px 28px", color: "#fff", marginBottom: 12 }}>
              <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-1px" }}>CA$200</div>
              <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 16 }}>per drawing, one-time</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {["Professionally drafted", "TMM MOTI 2020 compliant", "Delivered in 2 days", "All revisions included", "PDF format"].map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1" }}>
                    <span style={{ color: "#f97316" }}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => nav("/tmp-order")}
              style={{ width: "100%", background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none", borderRadius: 8, color: "#fff", padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              Order Now →
            </button>
          </div>

          {/* Reviews */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Customer Reviews</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>What our customers say</h2>
            </div>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 16, marginTop: 0 }}>Be the first to leave a review and help others find us.</p>
            <a
              href={GOOGLE_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, color: "#0f172a", textDecoration: "none" }}
            >
              ★ Leave a Review
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: "#0f172a", padding: "20px 24px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
          © {new Date().getFullYear()} TMP Builder · Victoria, BC · Canada
        </p>
      </footer>
    </div>
  );
}
