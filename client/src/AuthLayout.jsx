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
        backgroundImage: `linear-gradient(rgba(10,20,40,0.55), rgba(10,20,40,0.45)), url(/auth-bg.jpg)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 32,
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
              filter: "brightness(1.1) contrast(1.15) drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
            }}
          />
        </a>
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "rgba(255,255,255,0.9)",
          padding: 24,
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          backdropFilter: "blur(8px)",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
