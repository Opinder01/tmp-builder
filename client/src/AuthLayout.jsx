import { useEffect, useRef } from "react";

function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let W, H;

    const COLORS   = ["#f97316", "#38bdf8", "#818cf8", "#34d399", "#fb923c"];
    const COUNT    = 72;
    const MAX_DIST = 160;
    const nodes    = [];

    function resize() {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }

    function initNodes() {
      nodes.length = 0;
      for (let i = 0; i < COUNT; i++) {
        nodes.push({
          x:     Math.random() * W,
          y:     Math.random() * H,
          vx:    (Math.random() - 0.5) * 0.55,
          vy:    (Math.random() - 0.5) * 0.55,
          r:     Math.random() * 2.2 + 1.2,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          pulse: Math.random() * Math.PI * 2,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // dark gradient background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0,   "#060d1a");
      bg.addColorStop(0.5, "#0d1f3c");
      bg.addColorStop(1,   "#071622");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // connections + node movement
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.x += a.vx;
        a.y += a.vy;
        a.pulse += 0.025;
        if (a.x < 0 || a.x > W) a.vx *= -1;
        if (a.y < 0 || a.y > H) a.vy *= -1;

        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.35;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(148,163,184,${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      // nodes
      for (const n of nodes) {
        const pulse = 1 + Math.sin(n.pulse) * 0.3;
        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 6 * pulse);
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
    initNodes();
    draw();

    const ro = new ResizeObserver(() => { resize(); initNodes(); });
    ro.observe(canvas);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}

export default function AuthLayout({ title, children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "#060d1a",
      }}
    >
      {/* Live particle network — same as landing page hero */}
      <ParticleCanvas />

      {/* Logo top-left */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 32,
          zIndex: 2,
          userSelect: "none",
        }}
      >
        <a href="/" style={{ display: "inline-block" }}>
          <img
            src="/logo.png"
            alt="TMP Builder"
            style={{
              height: 76,
              width: "auto",
              display: "block",
              mixBlendMode: "multiply",
              filter: "brightness(1.1) contrast(1.15) drop-shadow(0 2px 10px rgba(0,0,0,0.5))",
            }}
          />
        </a>
      </div>

      {/* Auth card */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: 420,
          background: "rgba(255,255,255,0.92)",
          padding: 32,
          borderRadius: 16,
          boxShadow: "0 16px 48px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
          backdropFilter: "blur(12px)",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 20 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
