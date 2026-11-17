import { useEffect, useState } from "react";
import { Icon, type IconName } from "../design/icons";
import { Snackbar } from "../design/primitives/Snackbar";
import { api } from "../services/api";

/**
 * Widget registry — the real catalogue of widget types shipping in this
 * build. Instances live per-scene (Overlay Studio); enablement here is a
 * global preference persisted in the backend (settings allowlist).
 *
 * Ids MUST mirror backend/app/widget_types.py WIDGET_TYPES — these are the
 * same registry ids stored in widgets.widget_type and broadcast to the
 * overlay in overlay.hello. (A previous "daily_goal" id here drifted from
 * the backend's "goal_ring" and silently toggled a key nothing read.)
 */
const WIDGET_LIBRARY: Array<{ id: string; name: string; category: string; desc: string; icon: IconName }> = [
  { id: "study_timer", name: "Study Timer", category: "Study", desc: "Backend-authoritative stopwatch with pause/resume and daily totals.", icon: "timer" },
  { id: "subject_task", name: "Subject & Task", category: "Study", desc: "Current subject chip and task line for the running session.", icon: "goal" },
  { id: "session_history", name: "Session History", category: "Study", desc: "Last N completed sessions with durations and subjects.", icon: "layers" },
  { id: "clock", name: "Clock", category: "Time", desc: "24-hour clock with date and configurable timezone.", icon: "clock" },
  { id: "goal_ring", name: "Daily Goal Ring", category: "Progress", desc: "SVG progress ring towards your daily study goal.", icon: "goal" },
  { id: "now_playing", name: "YouTube Now Playing", category: "Media", desc: "Thumbnail, title, artist, progress and source platform chip.", icon: "music" },
  { id: "unified_chat", name: "Unified Chat", category: "Communication", desc: "Twitch + Kick chronological feed, emotes, badges, moderation.", icon: "chat" },
  { id: "live_activity", name: "Live Activity Alert", category: "Events", desc: "Alert, feed, ticker or compact modes for follows/subs/tips.", icon: "bolt" },
];

const ALL_IDS = WIDGET_LIBRARY.map((w) => w.id);

/**
 * `null` means "no saved preference" — the backend default, where every
 * widget type is enabled. An explicit Set is the restrict-list sent to the
 * overlay (disabled types are filtered out of placements even while a
 * scene still holds an instance of them). Toggling back to "everything
 * enabled" clears the preference instead of persisting a redundant list,
 * so widget types added later stay enabled by default.
 */
export default function Widgets() {
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.settings.get(["enabled_widgets"])
      .then((s) => {
        if (cancelled) return;
        setEnabled(s.enabled_widgets === null ? null : new Set(s.enabled_widgets));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true); // backend down — render default, changes won't persist
      });
    return () => { cancelled = true; };
  }, []);

  const isEnabled = (id: string) => enabled === null || enabled.has(id);

  const toggle = async (id: string) => {
    // Materialise the current restrict-list (or the full list when default).
    const base = enabled ?? new Set(ALL_IDS);
    const next = new Set(base);
    if (next.has(id)) next.delete(id); else next.add(id);
    const clearing = next.size === ALL_IDS.length; // everything back on → clear preference
    setEnabled(clearing ? null : next);
    const target = WIDGET_LIBRARY.find((w) => w.id === id);
    try {
      await api.settings.put({ enabled_widgets: clearing ? null : Array.from(next) });
      setSnack(target ? `${target.name} ${next.has(id) ? "enabled" : "disabled"} (saved)` : "saved");
    } catch {
      setSnack("Could not reach the backend — preference not saved.");
      setEnabled(enabled); // revert optimistic change
    }
  };

  const countLabel = loaded
    ? enabled === null
      ? `All ${ALL_IDS.length} enabled (default)`
      : `${enabled.size} of ${ALL_IDS.length} enabled`
    : "Loading…";

  return (
    <div className="page">
      <div className="reveal" style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: "var(--ss-font-display)", fontSize: 34, margin: 0, letterSpacing: "-0.02em" }}>Widget library</h2>
          <p style={{ margin: "6px 0 0", color: "var(--ss-color-text-muted)", fontSize: 13 }}>
            {countLabel} · disabled types are removed from the overlay even while a scene still holds them · persists to SQLite
          </p>
        </div>
      </div>

      <div className="grid-12">
        {WIDGET_LIBRARY.map((w, i) => (
          <div key={w.id} className="card hoverable widget-card reveal col-3" style={{ animationDelay: `${i * 60}ms` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div className="wicon"><Icon name={w.icon} size={24} /></div>
              <button type="button" className="switch" role="switch" aria-checked={isEnabled(w.id)}
                aria-label={`Enable ${w.name}`} onClick={() => void toggle(w.id)} />
            </div>
            <div>
              <div style={{ fontFamily: "var(--ss-font-display)", fontWeight: 600, fontSize: 15 }}>{w.name}</div>
              <div style={{ fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ss-color-primary-sage)", marginTop: 2 }}>{w.category}</div>
              <p style={{ fontSize: 12, color: "var(--ss-color-text-muted)", lineHeight: 1.55, margin: "8px 0 0", minHeight: 54 }}>{w.desc}</p>
            </div>
            <div style={{ marginTop: "auto" }}>
              <span className="demo-chip" style={{ borderStyle: "solid" }}>Layout instances: per scene</span>
            </div>
          </div>
        ))}
      </div>

      {snack && <Snackbar message={snack} onDismiss={() => setSnack(null)} />}
    </div>
  );
}
