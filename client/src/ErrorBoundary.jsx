import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep logging for developers; UI shows a minimal message.
    console.error("[ErrorBoundary] Uncaught error:", error);
    console.error("[ErrorBoundary] Component stack:", info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: 16,
          color: "#111827",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Something crashed while loading the app.</div>
        <div style={{ marginBottom: 12, color: "#6B7280" }}>
          Open DevTools Console for details. The error is:
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#F9FAFB",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: 12,
            overflow: "auto",
          }}
        >
          {String(error?.message || error)}
        </pre>
      </div>
    );
  }
}

