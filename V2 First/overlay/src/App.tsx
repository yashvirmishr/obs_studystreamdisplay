import { useEffect, useMemo, useState } from "react";
import { useOverlaySocket } from "./connection/useOverlaySocket";
import type { OverlayEnvelope, Placement, OverlaySnapshot } from "./connection/useOverlaySocket";
import { ConnectionBanner } from "./connection/ConnectionBanner";
import {
  Clock,
  GoalRing,
  LiveActivity,
  NowPlaying,
  SessionHistory,
  StudyTimer,
  SubjectTask,
  UnifiedChat,
} from "./widgets";
import { formatEvent } from "./widgets/eventText";

/**
 * Standalone OBS overlay renderer. Runs inside an OBS Browser Source.
 * Invariant 3 (docs/ARCHITECTURE.md): no Tauri imports, auto-reconnect,
 * transparent background — OBS composites this page over the stream.
 *
 * Phase 4: widgets are placed in Overlay Studio (persisted to SQLite) and
 * streamed to this page as `overlay.layout` / `overlay.layout_updated`
 * envelopes over the scene's WebSocket. Widget content comes from the
 * `overlay.hello` snapshot and live `study.*` / bus envelopes. There is no
 * mock data: chat and media render honest empty states until their
 * integrations (Phases 5 and 7) are live.
 */

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export default function App() {
  const sceneId = readSceneId(window.location);
  const { status, snapshot, layout, feed } = useOverlaySocket(sceneId);

  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const scale = Math.min(viewport.w / CANVAS_W, viewport.h / CANVAS_H);

  // Placements filtered by (a) per-widget visibility and (b) the global
  // widget enablement from the Widgets page — a disabled type does not reach
  // the stream surface even if a scene still holds an instance of it.
  const placements = useMemo(() => {
    const enabled = snapshot?.enabled_widgets ?? null;
    return (layout ?? [])
      .filter((p) => p.visible)
      .filter((p) => enabled === null || enabled.includes(p.widget_type))
      .sort((a, b) => a.z_index - b.z_index);
  }, [layout, snapshot?.enabled_widgets]);
  const hasAlertWidget = placements.some((p) => p.variant === "alert");

  return (
    <div className="overlay-stage">
      {status === "connected" && (
        <div className="overlay-canvas" style={{ transform: `scale(${scale})` }}>
          {placements.map((p) => (
            <PlacedWidget key={p.instance_name} placement={p} snapshot={snapshot} feed={feed} />
          ))}
          {placements.length === 0 && (
            <p className="overlay-stage__placeholder">
              scene &quot;{sceneId}&quot; connected — no widgets placed yet
            </p>
          )}
          {!hasAlertWidget && <Ticker feed={feed} />}
        </div>
      )}
      {status !== "connected" && <ConnectionBanner status={status} sceneId={sceneId} />}
    </div>
  );
}

function PlacedWidget(props: {
  placement: Placement;
  snapshot: OverlaySnapshot | null;
  feed: OverlayEnvelope[];
}) {
  const { placement, snapshot, feed } = props;
  const style = {
    left: `${placement.position_x * 100}%`,
    top: `${placement.position_y * 100}%`,
    width: `${placement.width * 100}%`,
    height: `${placement.height * 100}%`,
    zIndex: placement.z_index,
    opacity: placement.opacity,
  } as const;

  let content: JSX.Element | null = null;
  switch (placement.variant) {
    case "timer":
      content = snapshot ? <StudyTimer snapshot={snapshot} /> : null;
      break;
    case "clock":
      content = <Clock />;
      break;
    case "chip":
      content = snapshot ? <SubjectTask snapshot={snapshot} /> : null;
      break;
    case "goal":
      content = snapshot ? <GoalRing snapshot={snapshot} /> : null;
      break;
    case "history":
      content = snapshot ? <SessionHistory snapshot={snapshot} /> : null;
      break;
    case "chat":
      content = <UnifiedChat />;
      break;
    case "media":
      content = <NowPlaying />;
      break;
    case "alert":
      content = <LiveActivity feed={feed} />;
      break;
    default:
      // Unknown variant: render the label as an honest generic chip.
      content = (
        <div className="widget widget--unknown">
          <span className="widget__k">{placement.label || placement.instance_name}</span>
        </div>
      );
  }
  if (!content) return null;
  return (
    <div className="overlay-cell" style={style}>
      {content}
    </div>
  );
}

function Ticker({ feed }: { feed: OverlayEnvelope[] }) {
  const latest = feed[0];
  if (!latest) return null;
  const line = formatEvent(latest);
  return (
    <div className="overlay-ticker" role="status" aria-live="polite">
      <span className={`overlay-ticker__chip overlay-ticker__chip--${line.tone}`}>
        {line.label}
      </span>
      <span className="overlay-ticker__text">{line.text}</span>
      {line.simulated && <span className="overlay-ticker__sim">simulation</span>}
    </div>
  );
}

/** Scene id from /overlay/<scene_id> path or ?scene=; default "study". */
function readSceneId(location: Location): string {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get("scene");
  if (fromQuery) return fromQuery;

  const path = location.pathname;
  const marker = "/overlay/";
  const markerIndex = path.lastIndexOf(marker);
  if (markerIndex !== -1) {
    const rest = path.slice(markerIndex + marker.length);
    const segment = rest.split("/")[0];
    if (segment) return decodeURIComponent(segment);
  }
  return "study";
}
