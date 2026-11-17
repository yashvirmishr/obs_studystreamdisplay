import { useEffect, useState } from "react";
import { Icon } from "../design/icons";
import { Snackbar } from "../design/primitives/Snackbar";
import {
  api,
  HttpError,
  type IntegrationInfo,
  type TestEventBody,
} from "../services/api";

export default function Integrations() {
  const [items, setItems] = useState<IntegrationInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [seToken, setSeToken] = useState("");
  const [testType, setTestType] = useState<TestEventBody["type"]>("stream.follow");
  const [testName, setTestName] = useState("deep_test_viewer");
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      setItems(await api.integrations.list());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "backend unreachable");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const connect = async (provider: string, name: string) => {
    try {
      if (provider === "streamelements") {
        if (!seToken.trim()) {
          setSnack("Paste your StreamElements JWT first (avatar menu → channel in the SE dashboard).");
          return;
        }
        await api.integrations.connect(provider, { token: seToken.trim() });
        setSeToken(""); // the vault holds it now — nothing lingers in the page
      } else {
        await api.integrations.connect(provider);
      }
      setSnack(`${name} connected.`);
      await load();
    } catch (err) {
      // The backend explains exactly what failed (400 rejected token / 501 not implemented).
      setSnack(err instanceof HttpError ? err.message : "connect failed");
    }
  };

  const disconnect = async (provider: string, name: string) => {
    try {
      await api.integrations.disconnect(provider);
      setSnack(`${name} disconnected.`);
      await load();
    } catch (err) {
      setSnack(err instanceof Error ? err.message : "disconnect failed");
    }
  };

  const sendTest = async () => {
    setSending(true);
    try {
      const body: TestEventBody = { type: testType, username: testName.trim() || "test_user" };
      if (testType === "stream.cheer") body.bits = 100;
      if (testType === "donation.tip") { body.amount = 5; body.currency = "USD"; }
      await api.events.sendTest(body);
      setSnack("Simulated event recorded — it appears in Activity Centre and the Overview feed marked as a simulation.");
    } catch (err) {
      setSnack(err instanceof HttpError ? err.message : "test event failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      <div className="reveal">
        <h2 style={{ fontFamily: "var(--ss-font-display)", fontSize: 34, margin: 0, letterSpacing: "-0.02em" }}>Integrations</h2>
        <p style={{ margin: "6px 0 0", color: "var(--ss-color-text-muted)", fontSize: 13 }}>
          Local-only · tokens belong in the OS credential vault · no provider is ever marked connected without a real handshake
        </p>
      </div>

      {loadError && (
        <div className="card" style={{ borderColor: "rgba(212,107,107,0.4)" }}>
          <p style={{ margin: 0, color: "#e08585", fontSize: 13 }}>Backend unreachable: {loadError}. Start the desktop shell or the backend, then this page will list live provider state.</p>
        </div>
      )}

      <div className="grid-12">
        {(items ?? []).map((item, i) => {
          const connected = item.status === "connected";
          return (
            <section key={item.provider} className="card hoverable integration reveal col-6" style={{ animationDelay: `${i * 70}ms` }}>
              <div className={`brand-disc ${item.provider === "streamelements" ? "se" : item.provider}`} aria-hidden="true">
                {item.provider === "streamelements" ? "SE" : item.provider === "youtube" ? "YT" : item.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 style={{ margin: 0, fontFamily: "var(--ss-font-display)", fontSize: 17 }}>{item.name}</h3>
                  <span className="conn-dot" style={{ background: connected ? "var(--ss-color-status-online)" : "var(--ss-color-status-offline)" }} aria-hidden="true" />
                  <span style={{ fontSize: 11, color: connected ? "var(--ss-color-status-online)" : "var(--ss-color-text-muted)" }}>
                    {connected ? `Connected${item.account_name ? ` · ${item.account_name}` : ""}` : "Disconnected"}
                  </span>
                </div>
                <p style={{ margin: "8px 0 10px", fontSize: 12, lineHeight: 1.6, color: "var(--ss-color-text-muted)" }}>{item.detail}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {item.scopes.map((s) => <code key={s} className="scope-chip">{s}</code>)}
                </div>
                {item.last_error && <p style={{ fontSize: 11, color: "#d9a24e", margin: "-4px 0 10px" }}>Last error: {item.last_error}</p>}
                {item.provider === "streamelements" && !connected && (
                  <div style={{ marginBottom: 12 }}>
                    <input
                      type="password"
                      value={seToken}
                      onChange={(e) => setSeToken(e.target.value)}
                      placeholder="Paste your StreamElements JWT"
                      aria-label="StreamElements JWT"
                      style={{ width: "100%", background: "var(--ss-surface-container)", color: "var(--ss-color-text-primary)", border: "1px solid var(--ss-surface-container-highest)", borderRadius: 12, padding: "9px 12px", fontSize: 12, fontFamily: "var(--ss-font-mono)" }}
                    />
                    <p style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ss-color-text-faint)", margin: "6px 0 0" }}>
                      Copied from the SE dashboard (avatar menu → channel). It goes straight to the Windows Credential Manager — never to SQLite, logs, or this page's storage.
                    </p>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {connected ? (
                    <button className="btn btn-outlined" type="button" onClick={() => void disconnect(item.provider, item.name)}>
                      <Icon name="close" size={16} /> Disconnect
                    </button>
                  ) : (
                    <button className="btn btn-filled" type="button" onClick={() => void connect(item.provider, item.name)}>
                      <Icon name="integrations" size={16} /> {item.provider === "streamelements" ? "Connect with JWT" : "Connect"}
                    </button>
                  )}
                </div>
              </div>
            </section>
          );
        })}
        {items === null && !loadError && <p style={{ color: "var(--ss-color-text-faint)", fontSize: 12 }}>Loading provider registry…</p>}

        {/* ── Synthetic event console (real rows, always marked simulated) ── */}
        <section className="card col-12 reveal" style={{ animationDelay: "280ms" }} aria-label="Send a synthetic event">
          <div className="card-head">
            <div>
              <h3><Icon name="bolt" size={16} /> Synthetic event console</h3>
              <div className="sub">Writes a real row to the events table with is_simulated=true — exercised exactly like a real alert once Phase 6 lands</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <select value={testType} onChange={(e) => setTestType(e.target.value as TestEventBody["type"])}
              aria-label="Event type"
              style={{ background: "var(--ss-surface-container)", color: "var(--ss-color-text-primary)", border: "1px solid var(--ss-surface-container-highest)", borderRadius: 12, padding: "10px 12px", fontSize: 13 }}>
              <option value="stream.follow">stream.follow</option>
              <option value="stream.cheer">stream.cheer (100 bits)</option>
              <option value="stream.subscription">stream.subscription</option>
              <option value="stream.gift_subscription">stream.gift_subscription ×5</option>
              <option value="stream.raid">stream.raid (25 viewers)</option>
              <option value="donation.tip">donation.tip ($5.00 USD)</option>
            </select>
            <input value={testName} onChange={(e) => setTestName(e.target.value)} aria-label="Username"
              style={{ background: "var(--ss-surface-container)", color: "var(--ss-color-text-primary)", border: "1px solid var(--ss-surface-container-highest)", borderRadius: 12, padding: "10px 12px", fontSize: 13, width: 220 }} />
            <button className="btn btn-filled" type="button" disabled={sending} onClick={() => void sendTest()}>
              <Icon name="bolt" size={16} filled /> {sending ? "Sending…" : "Send synthetic event"}
            </button>
          </div>
        </section>

        <section className="card col-12 reveal" style={{ animationDelay: "320ms", borderStyle: "dashed" }}>
          <div className="card-head">
            <div>
              <h3><Icon name="shield" size={16} /> Integration rules (enforced)</h3>
              <div className="sub">From docs/ARCHITECTURE.md — not aspirations</div>
            </div>
          </div>
          <div className="kv">
            <dt>Public exposure</dt><dd>forbidden · backend binds 127.0.0.1 exclusively</dd>
            <dt>Kick events</dt><dd>official API is webhook-only → StreamElements Astro is the local-only path (verified 2026-11-14)</dd>
            <dt>OAuth tokens</dt><dd>OS credential vault — never in SQLite, logs, or this window</dd>
            <dt>Simulated events</dt><dd>is_simulated=true end to end · never merged silently into real history</dd>
          </div>
        </section>
      </div>

      {snack && <Snackbar message={snack} onDismiss={() => setSnack(null)} />}
    </div>
  );
}
