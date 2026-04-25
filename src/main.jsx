import { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

function postLog(payload) {
  try {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

window.addEventListener("error", (e) => {
  postLog({ msg: e.message, where: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error?.stack, url: location.href });
});
window.addEventListener("unhandledrejection", (e) => {
  postLog({ msg: String(e.reason?.message || e.reason || "unhandledrejection"), stack: e.reason?.stack, where: "promise", url: location.href });
});

class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    postLog({ msg: String(err?.message || err), stack: err?.stack, where: "react:" + (info?.componentStack || "").split("\n")[1]?.trim(), url: location.href });
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
        background: "#0C0B09", color: "#F0EDE4", fontFamily: "system-ui, sans-serif",
        padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 22, color: "#E84444", letterSpacing: 2, fontWeight: 700 }}>Something broke.</div>
        <div style={{ fontSize: 13, color: "#8A8580", maxWidth: 360 }}>
          The error has been logged. Try reloading — your puzzle progress is server-side and will resume.
        </div>
        <button
          onClick={() => location.reload()}
          style={{
            background: "#E8920A", color: "#1A0A00", border: "none",
            padding: "12px 24px", borderRadius: 8, fontSize: 14, letterSpacing: 1.5,
            cursor: "pointer", fontWeight: 700,
          }}
        >RELOAD</button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
