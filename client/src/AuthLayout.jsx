import { useEffect, useRef } from "react";

// ── Particle canvas (same as landing hero) ────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf, W, H;

    const COLORS  = ["#f97316", "#38bdf8", "#818cf8", "#34d399", "#fb923c"];
    const COUNT   = 72;
    const MAX_D   = 160;
    const nodes   = [];

    function resize() {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }

    function init() {
      nodes.length = 0;
      for (let i = 0; i < COUNT; i++) {
        nodes.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.55,
          vy: (Math.random() - 0.5) * 0.55,
          r: Math.random() * 2.2 + 1.2,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          pulse: Math.random() * Math.PI * 2,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0,   "#060d1a");
      bg.addColorStop(0.5, "#0d1f3c");
      bg.addColorStop(1,   "#071622");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.x += a.vx; a.y += a.vy; a.pulse += 0.025;
        if (a.x < 0 || a.x > W) a.vx *= -1;
        if (a.y < 0 || a.y > H) a.vy *= -1;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < MAX_D) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(148,163,184,${(1 - d / MAX_D) * 0.35})`;
            ctx.lineWidth = 0.7; ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const p = 1 + Math.sin(n.pulse) * 0.3;
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 6 * p);
        g.addColorStop(0, n.color + "55"); g.addColorStop(1, n.color + "00");
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 6 * p, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * p, 0, Math.PI * 2);
        ctx.fillStyle = n.color; ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    resize(); init(); draw();
    const ro = new ResizeObserver(() => { resize(); init(); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
  );
}

// ── Real sign images scattered in background ──────────────────────────────────
const SIGNS = [
  // sign src, size, top, left/right, animation delay, rotate start
  { src: "/signs/C-001-1.png",   size: 110, top: "8%",  left: "4%",   delay: "0s",    dur: "18s", rot: "-8deg"  },
  { src: "/signs/C-018-1A.png",  size: 100, top: "12%", right: "5%",  delay: "3s",    dur: "22s", rot: "7deg"   },
  { src: "/signs/W-132-1u.svg",  size: 90,  top: "55%", left: "2%",   delay: "1.5s",  dur: "20s", rot: "-5deg"  },
  { src: "/signs/B-C-004-1L.svg",size: 120, top: "60%", right: "3%",  delay: "5s",    dur: "24s", rot: "4deg"   },
  { src: "/signs/B-C-004-1R.svg",size: 120, top: "25%", left: "14%",  delay: "7s",    dur: "19s", rot: "-3deg"  },
  { src: "/signs/R-001.svg",     size: 85,  top: "72%", left: "18%",  delay: "2s",    dur: "21s", rot: "6deg"   },
  { src: "/signs/B-C-002.svg",   size: 95,  top: "38%", right: "10%", delay: "9s",    dur: "17s", rot: "-6deg"  },
  { src: "/signs/W-132-1Tu.svg", size: 88,  top: "80%", right: "16%", delay: "4s",    dur: "23s", rot: "5deg"   },
];

function SignLayer() {
  return (
    <>
      <style>{`
        @keyframes signFloat {
          0%   { transform: translateY(0px)   rotate(var(--r)); }
          50%  { transform: translateY(-18px) rotate(var(--r)); }
          100% { transform: translateY(0px)   rotate(var(--r)); }
        }
      `}</style>

      {SIGNS.map((s, i) => {
        const pos = {};
        if (s.left)  pos.left  = s.left;
        if (s.right) pos.right = s.right;

        return (
          <img
            key={i}
            src={s.src}
            alt=""
            draggable={false}
            style={{
              position:   "absolute",
              top:        s.top,
              ...pos,
              width:      s.size,
              height:     "auto",
              opacity:    0.18,
              zIndex:     1,
              userSelect: "none",
              pointerEvents: "none",
              "--r":      s.rot,
              animation:  `signFloat ${s.dur} ease-in-out ${s.delay} infinite`,
              filter:     "drop-shadow(0 4px 16px rgba(249,115,22,0.25)) brightness(1.1)",
            }}
          />
        );
      })}
    </>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function AuthLayout({ title, children }) {
  return (
    <div style={{
      minHeight: "100vh", width: "100vw", position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", background: "#060d1a",
    }}>

      {/* Layer 1 — animated particle network */}
      <ParticleCanvas />

      {/* Layer 2 — real sign images floating */}
      <SignLayer />

      {/* Layer 3 — logo */}
      <div style={{ position: "absolute", top: 20, left: 28, zIndex: 3, userSelect: "none" }}>
        <a href="/" style={{ display: "inline-block" }}>
          <img src="/logo.png" alt="TMP Builder" style={{
            height: 70, width: "auto", display: "block",
            mixBlendMode: "multiply",
            filter: "brightness(1.15) contrast(1.1) drop-shadow(0 2px 10px rgba(0,0,0,0.6))",
          }} />
        </a>
      </div>

      {/* Layer 4 — auth card */}
      <div style={{
        position: "relative", zIndex: 3, width: "100%", maxWidth: 360,
        background: "rgba(255,255,255,0.94)", padding: "24px 26px 28px",
        borderRadius: 14,
        boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, color: "#0f172a", fontSize: 20 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
