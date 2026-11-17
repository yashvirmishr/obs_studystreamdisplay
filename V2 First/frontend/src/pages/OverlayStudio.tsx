import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../design/icons";
import { Snackbar } from "../design/primitives/Snackbar";
import { api, isNormalisedPlacement, type LayoutPlacement, type WidgetRegistryEntry } from "../services/api";
import { iconOr } from "../utils/icons";

type SceneId = "study" | "wait";
type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

interface PlacedWidget {
  id: string;
  typeId: string;
  label: string;
  icon: ReturnType<typeof iconOr>;
  x: number; y: number; // normalised 0..1 of canvas
  w: number; h: number; // normalised 0..1 of canvas
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  z: number;
  variant: "timer" | "clock" | "chip" | "chat" | "media" | "goal" | "history" | "alert";
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const px = (n: number, axis: "x" | "y") => Math.round(n * (axis === "x" ? CANVAS_W : CANVAS_H));

/** Default placements shipped with the app (used until the user saves). */
function studyDefaults(): PlacedWidget[] {
  return [
    { id: "w-timer", typeId: "study_timer", label: "Study Timer", icon: "timer", x: 0.045, y: 0.70, w: 0.27, h: 0.17, visible: true, locked: false, opacity: 1, z: 10, variant: "timer" },
    { id: "w-subject", typeId: "subject_task", label: "Subject & Task", icon: "goal", x: 0.045, y: 0.60, w: 0.27, h: 0.075, visible: true, locked: false, opacity: 1, z: 9, variant: "chip" },
    { id: "w-now", typeId: "now_playing", label: "YouTube Now Playing", icon: "music", x: 0.035, y: 0.045, w: 0.28, h: 0.11, visible: true, locked: false, opacity: 1, z: 8, variant: "media" },
    { id: "w-clock", typeId: "clock", label: "Clock", icon: "clock", x: 0.845, y: 0.055, w: 0.12, h: 0.075, visible: true, locked: false, opacity: 1, z: 7, variant: "clock" },
    { id: "w-chat", typeId: "unified_chat", label: "Unified Chat", icon: "chat", x: 0.735, y: 0.30, w: 0.225, h: 0.56, visible: true, locked: false, opacity: 1, z: 6, variant: "chat" },
  ];
}
function waitDefaults(): PlacedWidget[] {
  return [
    { id: "w-now", typeId: "now_playing", label: "YouTube Now Playing", icon: "music", x: 0.035, y: 0.045, w: 0.28, h: 0.11, visible: true, locked: false, opacity: 1, z: 8, variant: "media" },
    { id: "w-chat", typeId: "unified_chat", label: "Unified Chat", icon: "chat", x: 0.735, y: 0.30, w: 0.225, h: 0.56, visible: true, locked: false, opacity: 1, z: 6, variant: "chat" },
  ];
}

const SCENES: Record<SceneId, { label: string; defaults: () => PlacedWidget[] }> = {
  study: { label: "Study", defaults: studyDefaults },
  wait: { label: "Please Wait", defaults: waitDefaults },
};

const API_SCENE: Record<SceneId, string> = { study: "Study", wait: "Please Wait" };

/**
 * Minimal fallback for `toApiPlacement`: the registry id carried by the
 * instance itself. The canonical source of truth is the backend's widget
 * registry (`GET /api/v1/widgets/registry`); this module no longer ships a
 * hand-maintained copy of it.
 */
function toApiPlacement(w: PlacedWidget): LayoutPlacement {
  return {
    instance_name: w.id,
    widget_type: w.typeId,
    position_x: w.x,
    position_y: w.y,
    width: w.w,
    height: w.h,
    z_index: w.z,
    visible: w.visible,
    locked: w.locked,
    opacity: w.opacity,
    label: w.label,
    variant: w.variant,
  };
}

function fromApiPlacement(p: LayoutPlacement, library: WidgetRegistryEntry[] | null): PlacedWidget {
  const known =
    library?.find((e) => e.id === p.widget_type) ??
    library?.find((e) => e.name === p.label);
  return {
    id: p.instance_name,
    typeId: known?.id ?? p.widget_type,
    label: p.label || known?.name || p.widget_type,
    icon: iconOr(known?.icon ?? "widgets"),
    x: p.position_x,
    y: p.position_y,
    w: p.width,
    h: p.height,
    visible: p.visible,
    locked: p.locked,
    opacity: p.opacity ?? 1,
    z: p.z_index,
    variant: (p.variant as PlacedWidget["variant"]) || "chip",
  };
}

export default function OverlayStudio() {
  const [scene, setScene] = useState<SceneId>("study");
  const [widgets, setWidgets] = useState<PlacedWidget[]>(() => studyDefaults());
  const [selectedId, setSelectedId] = useState<string | null>("w-timer");
  const [showGrid, setShowGrid] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [snap, setSnap] = useState(true);
  const [snack, setSnack] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [library, setLibrary] = useState<WidgetRegistryEntry[] | null>(null);
  const [registryFailed, setRegistryFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; origin: PlacedWidget } | null>(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const selected = widgets.find((w) => w.id === selectedId) ?? null;

  /** Load a scene from the backend; null layout → built-in defaults (unsaved). */
  const loadScene = useCallback(async (next: SceneId) => {
    // Cancel any pending save before swapping scenes — otherwise the timer
    // would fire against the NEW scene's widgets and write them into the
    // OLD scene's layout.
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setScene(next);
    dirtyRef.current = false;
    setSaveState("idle");
    setSnack(null);
    try {
      const res = await api.scenes.getLayout(API_SCENE[next]);
      if (res.placements && res.placements.length > 0 && res.placements.every(isNormalisedPlacement)) {
        const mapped = res.placements.map((p) => fromApiPlacement(p, libraryRef.current));
        setWidgets(mapped);
        setSelectedId(mapped[0]?.id ?? null);
        setSaveState("saved");
        setLastSavedAt(new Date().toLocaleTimeString());
        return;
      }
    } catch {
      // Backend unreachable or scene missing — fall back to defaults.
    }
    const defaults = SCENES[next].defaults();
    setWidgets(defaults);
    setSelectedId(defaults[0]?.id ?? null);
  }, []);

  // Initial load (and on scene switch).
  useEffect(() => {
    void loadScene("study");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const widgetsRef = useRef<PlacedWidget[]>(widgets);
  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  // Widget catalogue: ONE source of truth (backend registry). Icons repair
  // themselves once the registry arrives (placements loaded before it land
  // with the fallback icon); ids/labels/order come from the backend.
  const libraryRef = useRef<WidgetRegistryEntry[] | null>(library);
  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  useEffect(() => {
    let cancelled = false;
    api.widgets
      .registry()
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

  // Icons repair once the registry lands (no-op when already correct).
  useEffect(() => {
    if (!library) return;
    setWidgets((ws) =>
      ws.map((w) => {
        const spec = library.find((e) => e.id === w.typeId);
        return spec ? { ...w, icon: iconOr(spec.icon) } : w;
      }),
    );
  }, [library]);

  /** Debounced persist of dirty layouts. Snapshot is taken at fire time —
   *  never inside a state updater (StrictMode double-invokes updaters). */
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState("unsaved");
    saveTimer.current = window.setTimeout(() => {
      setSaveState("saving");
      const snapshot = widgetsRef.current.map(toApiPlacement).filter(isNormalisedPlacement);
      api.scenes.putLayout(API_SCENE[scene], snapshot)
        .then(() => {
          dirtyRef.current = false;
          setSaveState("saved");
          setLastSavedAt(new Date().toLocaleTimeString());
        })
        .catch(() => setSaveState("error"));
    }, 800);
  }, [scene]);

  const mutate = useCallback((fn: (ws: PlacedWidget[]) => PlacedWidget[]) => {
    setWidgets((ws) => fn(ws));
    dirtyRef.current = true;
    scheduleSave();
  }, [scheduleSave]);

  const addWidget = (entry: WidgetRegistryEntry) => {
    const id = `w-${Date.now().toString(36)}`;
    mutate((ws) => [
      ...ws,
      {
        id,
        typeId: entry.id,
        label: entry.name,
        icon: iconOr(entry.icon),
        x: 0.06 + (ws.length % 5) * 0.03,
        y: 0.08 + (ws.length % 5) * 0.04,
        w: 0.22,
        h: 0.12,
        visible: true,
        locked: false,
        opacity: 1,
        z: 20 + ws.length,
        variant: entry.variant as PlacedWidget["variant"],
      },
    ]);
    setSelectedId(id);
    setSnack(`${entry.name} placed on “${SCENES[scene].label}” — drag to position.`);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const id = `w-${Date.now().toString(36)}`;
    mutate((ws) => [
      ...ws,
      { ...selected, id, x: Math.min(0.9, selected.x + 0.02), y: Math.min(0.9, selected.y + 0.02), z: selected.z + 1 },
    ]);
    setSelectedId(id);
  };

  const removeSelected = useCallback(() => {
    setSelectedId(null);
    mutate((ws) => ws.filter((w) => w.id !== selectedId));
    setSnack("Widget removed.");
  }, [mutate, selectedId]);

  const updateSelected = useCallback((patch: Partial<PlacedWidget>) => {
    mutate((ws) => ws.map((w) => (w.id === selectedId ? { ...w, ...patch } : w)));
  }, [mutate, selectedId]);

  const onPointerDown = (e: ReactPointerEvent, w: PlacedWidget, mode: "move" | "resize") => {
    if (w.locked) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: w.id, mode, startX: e.clientX, startY: e.clientY, origin: w };
    setSelectedId(w.id);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    mutate((ws) => ws.map((w) => {
      if (w.id !== drag.id) return w;
      const o = drag.origin;
      if (drag.mode === "move") {
        let nx = o.x + dx;
        let ny = o.y + dy;
        if (snap) { nx = Math.round(nx * 24) / 24; ny = Math.round(ny * 24) / 24; }
        return { ...w, x: Math.min(Math.max(nx, 0), 1 - w.w), y: Math.min(Math.max(ny, 0), 1 - w.h) };
      }
      let nw = o.w + dx;
      let nh = o.h + dy;
      if (snap) { nw = Math.round(nw * 24) / 24; nh = Math.round(nh * 24) / 24; }
      return { ...w, w: Math.min(Math.max(nw, 0.06), 1 - w.x), h: Math.min(Math.max(nh, 0.04), 1 - w.y) };
    }));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore keystrokes while focus is in a text field / select so typing
    // into inputs never nudges the canvas.
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
    }
    if (!selected || selected.locked) return;
    const step = e.shiftKey ? 0.002 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    if (e.key in moves) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      mutate((ws) => ws.map((w) => (w.id === selected.id ? { ...w, x: Math.min(Math.max(w.x + dx, 0), 1 - w.w), y: Math.min(Math.max(w.y + dy, 0), 1 - w.h) } : w)));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSelected();
    }
  }, [selected, mutate, removeSelected]);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const sorted = useMemo(() => [...widgets].sort((a, b) => a.z - b.z), [widgets]);

  const saveHint =
    saveState === "saving" ? "Saving…"
    : saveState === "saved" ? `Saved ${lastSavedAt ?? ""}`
    : saveState === "error" ? "Save failed — backend unreachable?"
    : saveState === "unsaved" ? "Unsaved changes…"
    : "Layout not persisted yet";

  return (
    <div className="page">
      <div className="studio-toolbar reveal">
        {(Object.keys(SCENES) as SceneId[]).map((id) => (
          <button key={id} type="button" className={`scene-chip${scene === id ? " active" : ""}`} onClick={() => void loadScene(id)}>
            {SCENES[id].label}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: "var(--ss-surface-container-highest)", margin: "0 4px" }} />
        <button type="button" className={`tool-btn${showGrid ? " toggled" : ""}`} aria-pressed={showGrid} title="Toggle dot grid" onClick={() => setShowGrid(v => !v)}>
          <Icon name="grid" size={17} />
        </button>
        <button type="button" className={`tool-btn${showGuides ? " toggled" : ""}`} aria-pressed={showGuides} title="Toggle centre guides" onClick={() => setShowGuides(v => !v)}>
          <Icon name="layers" size={17} />
        </button>
        <button type="button" className={`tool-btn${snap ? " toggled" : ""}`} aria-pressed={snap} title="Snap to grid (1/24)" onClick={() => setSnap(v => !v)}>
          <Icon name="shield" size={17} />
        </button>
        <span style={{ marginLeft: "auto", fontSize: 11, color: saveState === "error" ? "#d9a24e" : "var(--ss-color-text-faint)", fontFamily: "var(--ss-font-mono)" }} role="status">{saveHint}</span>
      </div>

      <div className="studio reveal" style={{ animationDelay: "60ms" }} tabIndex={0} aria-label="Overlay editor workspace">
        {/* ── Widget library ── */}
        <aside className="panel" aria-label="Widget library">
          <div className="panel-head">
            <h3><Icon name="widgets" size={15} /> Widget library</h3>
            <p>Click to place into “{SCENES[scene].label}” · layout persists to SQLite</p>
          </div>
          <div className="panel-body">
            {registryFailed && (
              <div style={{ fontSize: 12, color: "var(--ss-color-text-muted)", lineHeight: 1.6 }}>
                Could not load the widget registry — is the backend running?{" "}
                <button type="button" className="btn btn-outlined" onClick={() => { setRegistryFailed(false); void api.widgets.registry().then((r) => setLibrary(r.widgets)).catch(() => setRegistryFailed(true)); }}>Retry</button>
              </div>
            )}
            {library === null && !registryFailed && (
              <div style={{ fontSize: 12, color: "var(--ss-color-text-faint)" }}>Loading widgets…</div>
            )}
            {library?.map((entry) => (
              <button key={entry.id} type="button" className="widget-pick" onClick={() => addWidget(entry)}>
                <Icon name={iconOr(entry.icon)} size={20} />
                <span>
                  {entry.name}
                  <small>{entry.desc}</small>
                </span>
                <Icon name="plus" size={16} className="add" />
              </button>
            ))}
          </div>
        </aside>

        {/* ── Canvas stage ── */}
        <div className="stage-wrap">
          <div
            ref={stageRef}
            className="stage"
            style={showGrid ? undefined : { backgroundImage: "none", background: "#070a09" }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={() => setSelectedId(null)}
            role="application"
            aria-label={`${SCENES[scene].label} scene canvas, 1920 by 1080`}
          >
            {showGuides && <><div className="crosshair h" /><div className="crosshair v" /></>}
            {sorted.map((w) => (
              <div
                key={w.id}
                className={`placed${w.id === selectedId ? " selected" : ""}${w.locked ? " locked" : ""}`}
                style={{
                  left: `${w.x * 100}%`, top: `${w.y * 100}%`, width: `${w.w * 100}%`, height: `${w.h * 100}%`,
                  zIndex: w.z, opacity: w.opacity, visibility: w.visible ? "visible" : "hidden",
                }}
                onPointerDown={(e) => onPointerDown(e, w, "move")}
                onClick={(e) => { e.stopPropagation(); setSelectedId(w.id); }}
                role="button"
                aria-label={`${w.label} widget`}
              >
                {w.variant === "timer" && <><span className="k">Study session</span><span className="v display">00:00:00</span></>}
                {w.variant === "clock" && <><span className="k">Clock</span><span className="v">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></>}
                {w.variant === "chip" && <><span className="k">Subject &amp; task</span><span className="v" style={{ fontFamily: "var(--ss-font-body)", fontWeight: 600, fontSize: "clamp(10px,1.1vw,15px)" }}>No task set</span></>}
                {w.variant === "chat" && <><span className="k">Live chat · Twitch + Kick</span><span className="v" style={{ fontSize: "clamp(9px,1vw,13px)", lineHeight: 1.6, fontFamily: "var(--ss-font-body)", color: "var(--ss-color-text-faint)" }}>awaiting messages…</span></>}
                {w.variant === "media" && <><span className="k">Now playing</span><span className="v" style={{ fontSize: "clamp(10px,1.15vw,15px)", fontFamily: "var(--ss-font-body)", fontWeight: 600, color: "var(--ss-color-text-faint)" }}>nothing detected</span></>}
                {w.variant === "history" && <><span className="k">Session history</span><span className="v" style={{ fontSize: "clamp(9px,1vw,12px)", fontFamily: "var(--ss-font-body)", color: "var(--ss-color-text-faint)" }}>no completed sessions yet</span></>}
                {w.variant === "goal" && <><span className="k">Daily goal</span><span className="v">0%</span></>}
                {w.variant === "alert" && <><span className="k">Live activity</span><span className="v" style={{ fontSize: "clamp(10px,1.1vw,14px)", fontFamily: "var(--ss-font-body)", color: "var(--ss-color-text-faint)" }}>no events yet</span></>}
                {w.id === selectedId && !w.locked && (
                  <div className="resize-handle" onPointerDown={(e) => onPointerDown(e, w, "resize")} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>

          <div className="stage-toolbar">
            <span className="meta">1920×1080 · normalised coords · {widgets.length} widgets</span>
            <div className="spacer" />
            <button type="button" className="tool-btn" title="Duplicate selected" onClick={duplicateSelected} disabled={!selected}>
              <Icon name="copy" size={16} />
            </button>
            <button type="button" className="tool-btn" title="Remove selected" onClick={removeSelected} disabled={!selected}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>

        {/* ── Properties ── */}
        <aside className="panel" aria-label="Widget properties">
          <div className="panel-head">
            <h3><Icon name="layers" size={15} /> Properties</h3>
            <p>{selected ? `“${selected.label}” · layer ${selected.z}` : "Select a widget on the canvas"}</p>
          </div>
          <div className="panel-body">
            {selected && (
              <>
                <div className="prop-row"><label htmlFor="px-x">X</label><div className="prop-value" id="px-x">{px(selected.x, "x")} px · {(selected.x * 100).toFixed(1)}%</div></div>
                <div className="prop-row"><label htmlFor="px-y">Y</label><div className="prop-value" id="px-y">{px(selected.y, "y")} px · {(selected.y * 100).toFixed(1)}%</div></div>
                <div className="prop-row"><label htmlFor="px-w">Width</label><div className="prop-value" id="px-w">{px(selected.w, "x")} px · {(selected.w * 100).toFixed(1)}%</div></div>
                <div className="prop-row"><label htmlFor="px-h">Height</label><div className="prop-value" id="px-h">{px(selected.h, "y")} px · {(selected.h * 100).toFixed(1)}%</div></div>
                <div className="prop-row">
                  <label htmlFor="px-op">Opacity</label>
                  <input id="px-op" type="range" min={20} max={100} value={Math.round(selected.opacity * 100)} className="range"
                    onChange={(e) => updateSelected({ opacity: Number(e.target.value) / 100 })} />
                </div>
                <div className="prop-row">
                  <label htmlFor="px-vis">Visible</label>
                  <button id="px-vis" type="button" className="switch" role="switch" aria-checked={selected.visible} aria-label="Toggle visibility"
                    onClick={() => updateSelected({ visible: !selected.visible })} />
                </div>
                <div className="prop-row">
                  <label htmlFor="px-lock">Locked</label>
                  <button id="px-lock" type="button" className="switch" role="switch" aria-checked={selected.locked} aria-label="Toggle lock"
                    onClick={() => updateSelected({ locked: !selected.locked })} />
                </div>
                <div className="prop-row" style={{ borderBottom: 0 }}>
                  <label htmlFor="px-z">Layer</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="tool-btn" style={{ width: 30, height: 30 }} title="Bring forward"
                      onClick={() => updateSelected({ z: selected.z + 1 })}><Icon name="layers" size={15} /></button>
                    <button type="button" className="tool-btn" style={{ width: 30, height: 30 }} title="Send backward"
                      onClick={() => updateSelected({ z: Math.max(1, selected.z - 1) })}><Icon name="chevronRight" size={15} style={{ transform: "rotate(-90deg)" }} /></button>
                  </div>
                </div>
                <p style={{ fontSize: 10.5, color: "var(--ss-color-text-faint)", lineHeight: 1.5, marginTop: 12 }}>
                  Arrow keys nudge the selection · Shift nudges by fine steps · Delete removes · layout auto-saves to SQLite (debounced 800 ms); positions are normalised, so any OBS resolution renders proportionally.
                </p>
              </>
            )}
            {!selected && <p style={{ color: "var(--ss-color-text-muted)", fontSize: 12 }}>Nothing selected. Click any widget on the canvas.</p>}
          </div>
        </aside>
      </div>

      {snack && <Snackbar message={snack} onDismiss={() => setSnack(null)} />}
    </div>
  );
}
