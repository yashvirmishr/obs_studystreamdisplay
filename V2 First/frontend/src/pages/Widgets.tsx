import { useEffect, useState } from "react";
import { Icon } from "../design/icons";
import { Snackbar } from "../design/primitives/Snackbar";
import { api, type WidgetRegistryEntry } from "../services/api";
import { iconOr } from "../utils/icons";

// The catalog comes from the backend (`GET /api/v1/widgets/registry`), which
// is the ONE place widget ids/labels/icons are defined. The previous
// hand-maintained copies (the "daily_goal" vs. "goal_ring" drift) are gone.

/**
 * `null` means "no saved preference" — the backend default, where every
 * widget type is enabled. An explicit Set is the restrict-list sent to the
 * overlay (disabled types are filtered out of placements even while a
 * scene still holds an instance of them). Toggling back to "everything
 * enabled" clears the preference instead of persisting a redundant list,
 * so widget types added later stay enabled by default.
 */
export default function Widgets() {
  const [library, setLibrary] = useState<WidgetRegistryEntry[] | null>(null);
  const [registryFailed, setRegistryFailed] = useState(false);
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.widgets.registry()
      .then((r) => {
        if (!cancelled) setLibrary(r.widgets);
      })
      .catch(() => {
        if (!cancelled) setRegistryFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const allIds = library?.map((w) => w.id) ?? [];
  const isEnabled = (id: string) => enabled === null || enabled.has(id);

  const toggle = async (id: string) => {
    if (library === null) return; // registry unavailable — nothing honest to save against
    // Materialise the current restrict-list (or the full list when default).
    const base = enabled ?? new Set(allIds);
    const next = new Set(base);
    if (next.has(id)) next.delete(id); else next.add(id);
    const clearing = next.size === allIds.length; // everything back on → clear preference
    setEnabled(clearing ? null : next);
    const target = library.find((w) => w.id === id);
    try {
      await api.settings.put({ enabled_widgets: clearing ? null : Array.from(next) });
      setSnack(target ? `${target.name} ${next.has(id) ? "enabled" : "disabled"} (saved)` : "saved");
    } catch {
      setSnack("Could not reach the backend — preference not saved.");
      setEnabled(enabled); // revert optimistic change
    }
  };

  const countLabel = !loaded || library === null
    ? "Loading…"
    : enabled === null
      ? `All ${allIds.length} enabled (default)`
      : `${enabled.size} of ${allIds.length} enabled`;

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
        {registryFailed && (
          <div className="card col-12" style={{ padding: 24, color: "var(--ss-color-text-muted)", fontSize: 13 }}>
            Could not load the widget registry — is the backend running? Refresh this page to retry.
          </div>
        )}
        {library?.map((w, i) => (
          <div key={w.id} className="card hoverable widget-card reveal col-3" style={{ animationDelay: `${i * 60}ms` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div className="wicon"><Icon name={iconOr(w.icon)} size={24} /></div>
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
