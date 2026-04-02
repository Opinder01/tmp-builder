import authBg from "./assets/auth-bg.png";

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
        backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${authBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 30,
          left: 40,
          color: "white",
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: 0.2,
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        TMP Builder
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
