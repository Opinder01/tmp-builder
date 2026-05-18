import { useEffect, useRef } from "react";

// ── Draw helpers ──────────────────────────────────────────────────────────────

function drawCone(ctx, size) {
  const h = size * 2;
  const w = size;

  // body
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.5);
  ctx.lineTo(-w * 0.5, h * 0.45);
  ctx.lineTo( w * 0.5, h * 0.45);
  ctx.closePath();
  ctx.fillStyle = "#f97316";
  ctx.fill();

  // white reflective stripes
  const stripes = [0.0, 0.22];
  for (const t of stripes) {
    const cy    = -h * 0.5 + h * (0.35 + t);
    const hw    = w * (0.22 + t * 0.55);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(-hw, cy, hw * 2, h * 0.09);
    ctx.fillStyle = "#f97316";
    ctx.fillRect(-hw, cy + h * 0.09, hw * 2, h * 0.04);
  }

  // base
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.45, w * 0.65, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWarningDiamond(ctx, size) {
  // orange diamond outline (W-series warning sign style)
  ctx.save();
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth   = size * 0.08;
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.restore();

  // worker silhouette inside
  ctx.fillStyle = "#f97316";
  const s = size * 0.28;
  // head
  ctx.beginPath();
  ctx.arc(0, -s * 1.1, s * 0.38, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.5);
  ctx.lineTo( s * 0.55, -s * 0.5);
  ctx.lineTo( s * 0.3,   s * 0.8);
  ctx.lineTo(-s * 0.3,   s * 0.8);
  ctx.closePath();
  ctx.fill();
  // shovel
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth   = s * 0.22;
  ctx.beginPath();
  ctx.moveTo(s * 0.55, -s * 0.3);
  ctx.lineTo(s * 1.0,   s * 0.9);
  ctx.stroke();
}

function drawArrowBoard(ctx, size, dir) {
  const w = size * 2.2;
  const h = size * 1.1;

  // board frame
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth   = size * 0.07;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.12);
  ctx.stroke();

  // two chevron arrows
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth   = size * 0.13;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  const offsets = [-w * 0.22, w * 0.22];
  for (const ox of offsets) {
    const tip = ox + dir * w * 0.18;
    ctx.beginPath();
    ctx.moveTo(ox - dir * w * 0.09, -h * 0.28);
    ctx.lineTo(tip,                   0);
    ctx.lineTo(ox - dir * w * 0.09,   h * 0.28);
    ctx.stroke();
  }
}

function drawFlagSign(ctx, size) {
  // C-001 style rectangular sign with "TCP" text
  const w = size * 1.6;
  const h = size * 1.0;

  ctx.strokeStyle = "#f97316";
  ctx.lineWidth   = size * 0.07;
  ctx.fillStyle   = "rgba(249,115,22,0.12)";
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.1);
  ctx.fill();
  ctx.stroke();

  // text
  ctx.fillStyle   = "#f97316";
  ctx.font        = `bold ${size * 0.38}px 'Arial Narrow', Arial, sans-serif`;
  ctx.textAlign   = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TCP", 0, -h * 0.12);
  ctx.font = `${size * 0.22}px Arial, sans-serif`;
  ctx.fillText("FLAGGER AHEAD", 0, h * 0.22);
}

// ── Canvas component ──────────────────────────────────────────────────────────

function AuthCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let W, H;

    // ── Particles ──────────────────────────────────────────────────────────
    const P_COLORS  = ["#f97316", "#38bdf8", "#818cf8", "#34d399", "#fb923c"];
    const P_COUNT   = 72;
    const MAX_DIST  = 160;
    const particles = [];

    function initParticles() {
      particles.length = 0;
      for (let i = 0; i < P_COUNT; i++) {
        particles.push({
          x:     Math.random() * W,
          y:     Math.random() * H,
          vx:    (Math.random() - 0.5) * 0.55,
          vy:    (Math.random() - 0.5) * 0.55,
          r:     Math.random() * 2.2 + 1.2,
          color: P_COLORS[Math.floor(Math.random() * P_COLORS.length)],
          pulse: Math.random() * Math.PI * 2,
        });
      }
    }

    // ── Traffic items ──────────────────────────────────────────────────────
    const TYPES   = ["cone", "cone", "cone", "cone", "cone",
                     "arrow", "arrow", "arrow",
                     "diamond", "diamond",
                     "flag", "flag"];
    const traffic = [];

    function initTraffic() {
      traffic.length = 0;
      for (let i = 0; i < TYPES.length; i++) {
        const type = TYPES[i];
        traffic.push({
          type,
          x:       Math.random() * W,
          y:       Math.random() * H,
          vx:      (Math.random() - 0.5) * 0.18,
          vy:      (Math.random() - 0.5) * 0.18,
          size:    type === "cone" ? Math.random() * 10 + 18
                                   : Math.random() * 12 + 28,
          opacity: Math.random() * 0.13 + 0.10,
          dir:     Math.random() > 0.5 ? 1 : -1,
          rot:     0,
          rotV:    (Math.random() - 0.5) * 0.004,
        });
      }
    }

    function resize() {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // background gradient
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0,   "#060d1a");
      bg.addColorStop(0.5, "#0d1f3c");
      bg.addColorStop(1,   "#071622");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ── traffic elements (behind particles) ───────────────────────────
      for (const t of traffic) {
        t.x  += t.vx;
        t.y  += t.vy;
        t.rot += t.rotV;
        if (t.x < -120) t.x = W + 120;
        if (t.x > W + 120) t.x = -120;
        if (t.y < -120) t.y = H + 120;
        if (t.y > H + 120) t.y = -120;

        ctx.save();
        ctx.globalAlpha = t.opacity;
        ctx.translate(t.x, t.y);
        if (t.type !== "cone") ctx.rotate(t.rot);

        if (t.type === "cone")    drawCone(ctx, t.size);
        if (t.type === "arrow")   drawArrowBoard(ctx, t.size, t.dir);
        if (t.type === "diamond") drawWarningDiamond(ctx, t.size);
        if (t.type === "flag")    drawFlagSign(ctx, t.size);

        ctx.restore();
      }

      // ── particles ──────────────────────────────────────────────────────
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        a.x += a.vx;
        a.y += a.vy;
        a.pulse += 0.025;
        if (a.x < 0 || a.x > W) a.vx *= -1;
        if (a.y < 0 || a.y > H) a.vy *= -1;

        for (let j = i + 1; j < particles.length; j++) {
          const b    = particles[j];
          const dx   = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.35;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(148,163,184,${alpha})`;
            ctx.lineWidth   = 0.7;
            ctx.stroke();
          }
        }
      }

      for (const n of particles) {
        const pulse = 1 + Math.sin(n.pulse) * 0.3;
        const grd   = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 6 * pulse);
        grd.addColorStop(0, n.color + "55");
        grd.addColorStop(1, n.color + "00");
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 6 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    initParticles();
    initTraffic();
    draw();

    const ro = new ResizeObserver(() => { resize(); initParticles(); initTraffic(); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
    />
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
      <AuthCanvas />

      {/* Logo */}
      <div style={{ position: "absolute", top: 20, left: 32, zIndex: 2, userSelect: "none" }}>
        <a href="/" style={{ display: "inline-block" }}>
          <img
            src="/logo.png"
            alt="TMP Builder"
            style={{
              height: 76, width: "auto", display: "block",
              mixBlendMode: "multiply",
              filter: "brightness(1.1) contrast(1.15) drop-shadow(0 2px 10px rgba(0,0,0,0.5))",
            }}
          />
        </a>
      </div>

      {/* Auth card */}
      <div style={{
        position: "relative", zIndex: 2, width: "100%", maxWidth: 420,
        background: "rgba(255,255,255,0.93)", padding: 32, borderRadius: 16,
        boxShadow: "0 16px 48px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)",
        backdropFilter: "blur(14px)",
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 20 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
