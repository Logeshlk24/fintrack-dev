import { Component } from "react";

// Catches rendering errors so one broken page shows a message instead of a blank screen.
// Your saved data is untouched: this only affects what is drawn.
//   resetKey — when it changes (e.g. the user opens another page) the boundary resets itself
//   onHome   — optional "go back" action (e.g. open the Overview page)
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const btn = { border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
    return (
      <div role="alert" style={{ maxWidth: 460, margin: "10vh auto", padding: "0 16px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", color: "var(--color-text-primary, #111)" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Something went wrong on this page</div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--color-text-secondary, #555)", marginBottom: 16 }}>
          Your data is safe — only this screen failed to draw. Try again, or go back.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => this.setState({ error: null })} style={{ ...btn, background: "#1a6b3c", color: "#fff" }}>Try again</button>
          {this.props.onHome && (
            <button onClick={() => { this.setState({ error: null }); this.props.onHome(); }}
              style={{ ...btn, background: "var(--color-background-secondary, #f0f0f0)", color: "var(--color-text-primary, #111)" }}>Go to Overview</button>
          )}
          <button onClick={() => window.location.reload()}
            style={{ ...btn, background: "var(--color-background-secondary, #f0f0f0)", color: "var(--color-text-primary, #111)" }}>Reload app</button>
        </div>
        <details style={{ marginTop: 18, fontSize: 12, color: "var(--color-text-secondary, #666)", textAlign: "left" }}>
          <summary style={{ cursor: "pointer", textAlign: "center" }}>Technical details</summary>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8 }}>{String(error?.message || error)}</pre>
        </details>
      </div>
    );
  }
}
