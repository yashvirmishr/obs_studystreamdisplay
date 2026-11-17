import { useEffect, useState } from "react";
import { Icon, type IconName } from "../design/icons";
import { api } from "../services/api";
import { Snackbar } from "../design/primitives/Snackbar";

type Section = "appearance" | "storage" | "security" | "about";

const NAV: Array<{ id: Section; label: string; icon: IconName }> = [
  { id: "appearance", label: "Appearance", icon: "settings" },
  { id: "storage", label: "Storage", icon: "layers" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "about", label: "About", icon: "overview" },
];

const ACCENTS: Array<{ id: string; label: string; color: string }> = [
  { id: "", label: "Sage", color: "#3d8a66" },
  { id: "ss-accent-teal", label: "Teal", color: "#2f7f7a" },
  { id: "ss-accent-blue", label: "Blue", color: "#3a62a0" },
  { id: "ss-accent-lavender", label: "Lavender", color: "#5e5490" },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("appearance");
  const [accent, setAccent] = useState("");
  const [goalHours, setGoalHours] = useState(5);
  const [goalStatus, setGoalStatus] = useState<string>("");
  const [snack, setSnack] = useState<string | null>(null);

  // Load the real goal from the backend.
  useEffect(() => {
    api.settings.get(["study_goal_hours"])
      .then((s) => { if (s.study_goal_hours) setGoalHours(Number(s.study_goal_hours)); })
      .catch(() => undefined);
  }, []);

  const saveGoal = async (hours: number) => {
    setGoalHours(hours);
    try {
      await api.settings.put({ study_goal_hours: hours });
      setGoalStatus("saved");
      window.setTimeout(() => setGoalStatus(""), 1500);
    } catch {
      setSnack("Backend unreachable — goal not saved.");
    }
  };

  // Apply accent by toggling classes on the ambient root element.
  useEffect(() => {
    const root = document.querySelector(".ss-ambient");
    if (!root) return;
    ["ss-accent-teal", "ss-accent-blue", "ss-accent-lavender"].forEach((c) => root.classList.remove(c));
    if (accent) root.classList.add(accent);
  }, [accent]);

  return (
    <div className="page">
      <div className="reveal">
        <h2 style={{ fontFamily: "var(--ss-font-display)", fontSize: 34, margin: 0, letterSpacing: "-0.02em" }}>Settings</h2>
        <p style={{ margin: "6px 0 0", color: "var(--ss-color-text-muted)", fontSize: 13 }}>Appearance, storage, security and app identity</p>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav reveal" aria-label="Settings sections" style={{ animationDelay: "60ms" }}>
          {NAV.map((item) => (
            <button key={item.id} type="button" className={section === item.id ? "active" : ""}
              onClick={() => setSection(item.id)}>
              <Icon name={item.icon} size={17} />
              {item.label}
            </button>
          ))}
        </nav>

        <section className="card reveal" style={{ animationDelay: "120ms" }}>
          {section === "appearance" && (
            <>
              <div className="card-head"><div><h3><Icon name="settings" size={16} /> Appearance</h3><div className="sub">Material 3 Expressive · dark-first</div></div></div>
              <p style={{ fontSize: 12, color: "var(--ss-color-text-muted)", marginBottom: 8 }}>Accent</p>
              <div className="accent-swatches" role="radiogroup" aria-label="Accent colour">
                {ACCENTS.map((a) => (
                  <button key={a.id || "sage"} type="button" className={`accent-swatch${accent === a.id ? " active" : ""}`}
                    style={{ background: `linear-gradient(140deg, ${a.color}, color-mix(in srgb, ${a.color} 45%, black))` }}
                    role="radio" aria-checked={accent === a.id} aria-label={a.label} title={a.label}
                    onClick={() => setAccent(a.id)} />
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--ss-color-text-faint)", marginTop: 14, lineHeight: 1.6 }}>
                Dark is the default and shipping theme. A light scheme is token-ready but parked until the overlay renderer is verified under OBS’s Chromium in Phase 8.
              </p>
              <div className="kv" style={{ marginTop: 16 }}>
                <dt>Daily study goal</dt>
                <dd style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select aria-label="Daily study goal in hours" value={goalHours}
                    onChange={(e) => void saveGoal(Number(e.target.value))}
                    style={{ background: "var(--ss-surface-container)", color: "var(--ss-color-text-primary)", border: "1px solid var(--ss-surface-container-highest)", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((h) => <option key={h} value={h}>{h} hours</option>)}
                  </select>
                  {goalStatus && <span style={{ color: "var(--ss-color-status-online)", fontSize: 11 }}>{goalStatus}</span>}
                </dd>
                <dt>Density</dt><dd>comfortable · Android-inspired spacing</dd>
                <dt>Motion</dt><dd>120/160/200 ms UI · spring reveals 420–520 ms</dd>
                <dt>Shape</dt><dd>28 px cards · pill actions · full-round dots</dd>
              </div>
            </>
          )}

          {section === "storage" && (
            <>
              <div className="card-head"><div><h3><Icon name="layers" size={16} /> Storage</h3><div className="sub">SQLite · WAL · foreign keys enforced</div></div></div>
              <div className="kv">
                <dt>Database</dt><dd>%LOCALAPPDATA%\com.yashvir.studystream2\studystream.db</dd>
                <dt>Schema version</dt><dd>0002_core_tables (10 tables + app_settings)</dd>
                <dt>Migrations</dt><dd>Alembic · forward-only · 0001 → 0002 applied</dd>
                <dt>Event history</dt><dd>retained · configurable retention (Phase 6)</dd>
                <dt>Session logs</dt><dd>%LOCALAPPDATA%\com.yashvir.studystream2\logs\</dd>
                <dt>V1 migration</dt><dd>none — clean greenfield install</dd>
              </div>
            </>
          )}

          {section === "security" && (
            <>
              <div className="card-head"><div><h3><Icon name="shield" size={16} /> Security</h3><div className="sub">Fail-closed · loopback-only · no plaintext secrets</div></div></div>
              <div className="kv">
                <dt>Bind address</dt><dd>127.0.0.1:47831 — never 0.0.0.0, never public</dd>
                <dt>App auth</dt><dd>256-bit per-launch token · memory only · regenerated every start</dd>
                <dt>API access</dt><dd>401 without token — verified fail-closed on packaged exe</dd>
                <dt>WebSocket auth</dt><dd>/ws/control token query-param or first-message auth; close 4401</dd>
                <dt>CORS</dt><dd>localhost:5173 + tauri origins only</dd>
                <dt>OAuth tokens</dt><dd>OS credential vault (Phase 5 wiring)</dd>
                <dt>V1 secrets</dt><dd>not reused — treated as compromised; never imported</dd>
              </div>
              <p style={{ fontSize: 11, color: "var(--ss-color-text-faint)", marginTop: 14, lineHeight: 1.6 }}>
                If a feature ever needs public inbound traffic (e.g. Kick webhooks), it goes through a separately-assessed outbound relay — this app will never expose your machine to the internet.
              </p>
            </>
          )}

          {section === "about" && (
            <>
              <div className="card-head"><div><h3><Icon name="overview" size={16} /> About</h3><div className="sub">Study Stream 2.0 · Phase 1 verified, Phase 2 in flight</div></div></div>
              <div className="kv">
                <dt>Version</dt><dd>v0.1.0 (foundation verified)</dd>
                <dt>Shell</dt><dd>Tauri 2 · React 18 · TypeScript strict · Vite 5</dd>
                <dt>Backend</dt><dd>FastAPI · Python 3 · PyInstaller sidecar (21.5 MB)</dd>
                <dt>Data</dt><dd>SQLite + SQLAlchemy 2.0 + Alembic (0001–0003)</dd>
                <dt>Overlay</dt><dd>Standalone renderer at overlay/ — one OBS Browser Source per scene</dd>
                <dt>License</dt><dd>All rights reserved · personal project</dd>
              </div>
            </>
          )}
        </section>
      </div>

      {snack && <Snackbar message={snack} onDismiss={() => setSnack(null)} />}
    </div>
  );
}
