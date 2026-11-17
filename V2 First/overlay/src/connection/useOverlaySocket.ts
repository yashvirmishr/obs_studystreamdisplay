import { useEffect, useRef, useState } from "react";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  // Terminal states: retrying cannot succeed, so the loop stops and the
  // banner explains what the human must fix (re-copy the URL / check scene).
  | "auth-error"
  | "unknown-scene";

export type OverlayEnvelope = Record<string, unknown> & {
  event_type?: string;
  is_simulated?: boolean;
  payload?: Record<string, unknown>;
};

/** Study slice of the hello snapshot (backend `state_payload`). */
export interface StudySnapshot {
  state: string;
  session_id: number | null;
  elapsed_seconds: number;
  today_total_seconds: number;
  subject: string | null;
  task: string | null;
}

/** Full bootstrap payload sent by the backend on WS accept. */
export interface OverlaySnapshot {
  scene: string;
  receivedAt: number;
  study: StudySnapshot;
  goal: { study_goal_hours: number | null };
  /** Global widget enablement (Widgets page); null ⇒ everything enabled. */
  enabled_widgets: string[] | null;
  recent_events: OverlayEnvelope[];
  recent_sessions: Array<{
    id: number;
    seconds: number;
    subject: string | null;
    task: string | null;
    completed_at: string | null;
  }>;
}

/** One placed widget from the scene layout (backend `Placement`). */
export interface Placement {
  instance_name: string;
  widget_type: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  label: string;
  variant: string;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10_000;
const DEFAULT_PORT = 47831;
/** Backend close codes: 4401 token rejected, 1008 unknown scene. */
const WS_AUTH_CLOSE_CODE = 4401;
const WS_UNKNOWN_SCENE_CLOSE_CODE = 1008;
const FEED_CAP = 12;

/**
 * WebSocket connection to the backend's per-scene overlay channel
 * (ws://127.0.0.1:<port>/ws/overlay/{scene_name}), with exponential-backoff
 * auto-reconnect. Backend binds loopback only (architecture invariant 1).
 *
 * On accept the backend sends `overlay.hello` (study state / goal / global
 * widget enablement / recent events + sessions) then `overlay.layout` (this
 * scene's placements). Live updates arrive as bus envelopes: study.* carries
 * full state, overlay.layout_updated re-renders the scene when the studio
 * saves, overlay.widgets_updated re-filters enablement when the Widgets page
 * toggles a type.
 *
 * Backend port resolution order:
 *   1. ?port= URL override (browser dev against a scratch backend)
 *   2. 47831 (production default; the Tauri shell passes the same port
 *      to the backend it spawned, so they agree by construction)
 *
 * Auth: the per-scene token rides the WS query string as `token=`.
 * Backend closes with 4401 on mismatch; the reconnect loop then backs
 * off gently and the banner shows "unreachable — retrying".
 *
 * StrictMode safety: socket lifetime is owned by refs; re-mount cancels
 * timers and closes the previous socket. No duplicate connections.
 */
export function useOverlaySocket(sceneId: string): {
  status: ConnectionStatus;
  snapshot: OverlaySnapshot | null;
  layout: Placement[] | null;
  feed: OverlayEnvelope[];
} {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [snapshot, setSnapshot] = useState<OverlaySnapshot | null>(null);
  const [layout, setLayout] = useState<Placement[] | null>(null);
  const [feed, setFeed] = useState<OverlayEnvelope[]>([]);
  const stateRef = useRef<SocketRuntime | null>(null);

  useEffect(() => {
    const runtime = new SocketRuntime(
      sceneId,
      (nextStatus) => setStatus(nextStatus),
      (kind, envelope) => {
        if (kind === "hello") {
          const payload = (envelope.payload ?? {}) as Record<string, unknown>;
          setSnapshot({
            scene: typeof payload.scene === "string" ? payload.scene : sceneId,
            receivedAt: Date.now(),
            study: normaliseStudy(payload.study),
            goal: normaliseGoal(payload.goal),
            enabled_widgets: Array.isArray(payload.enabled_widgets)
              ? (payload.enabled_widgets as string[])
              : null,
            recent_events: Array.isArray(payload.recent_events)
              ? (payload.recent_events as OverlayEnvelope[])
              : [],
            recent_sessions: Array.isArray(payload.recent_sessions)
              ? (payload.recent_sessions as OverlaySnapshot["recent_sessions"])
              : [],
          });
          return;
        }
        if (kind === "layout") {
          const payload = (envelope.payload ?? {}) as Record<string, unknown>;
          setLayout(Array.isArray(payload.placements) ? (payload.placements as Placement[]) : null);
          return;
        }
        if (kind === "widgets") {
          // Live enablement change from the Widgets page: re-filter
          // placements immediately, no OBS refresh needed.
          const payload = (envelope.payload ?? {}) as Record<string, unknown>;
          const next = Array.isArray(payload.enabled_widgets)
            ? (payload.enabled_widgets as string[])
            : null;
          setSnapshot((prev) => (prev ? { ...prev, receivedAt: Date.now(), enabled_widgets: next } : prev));
          return;
        }
        // Study envelopes now carry the full authoritative state — replace
        // the slice so the timer widget re-bases from backend truth.
        if (typeof envelope.event_type === "string" && envelope.event_type.startsWith("study.")) {
          const payload = (envelope.payload ?? {}) as Record<string, unknown>;
          const next = normaliseStudy(payload);
          setSnapshot((prev) =>
            prev ? { ...prev, receivedAt: Date.now(), study: { ...prev.study, ...next } } : prev,
          );
        }
        setFeed((prev) => [envelope, ...prev].slice(0, FEED_CAP));
      },
    );
    stateRef.current = runtime;
    runtime.start();
    return () => {
      if (stateRef.current === runtime) stateRef.current = null;
      runtime.stop();
    };
  }, [sceneId]);

  return { status, snapshot, layout, feed };
}

function normaliseStudy(raw: unknown): StudySnapshot {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    state: typeof p.state === "string" ? p.state : "idle",
    session_id: typeof p.session_id === "number" ? p.session_id : null,
    elapsed_seconds: typeof p.elapsed_seconds === "number" ? p.elapsed_seconds : 0,
    today_total_seconds: typeof p.today_total_seconds === "number" ? p.today_total_seconds : 0,
    subject: typeof p.subject === "string" ? p.subject : null,
    task: typeof p.task === "string" ? p.task : null,
  };
}

function normaliseGoal(raw: unknown): OverlaySnapshot["goal"] {
  const p = (raw ?? {}) as Record<string, unknown>;
  const hours = typeof p.study_goal_hours === "number" ? p.study_goal_hours : null;
  return { study_goal_hours: hours && hours > 0 ? hours : null };
}

function readBackendPort(): number {
  const raw = new URLSearchParams(window.location.search).get("port");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

type EnvelopeKind = "hello" | "layout" | "widgets" | "event";

class SocketRuntime {
  private closed = false;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  /** Set once the backend closes with a code retrying cannot fix. */
  private terminal: ConnectionStatus | null = null;

  constructor(
    private readonly sceneId: string,
    private readonly onStatus: (status: ConnectionStatus) => void,
    private readonly onEnvelope: (kind: EnvelopeKind, envelope: OverlayEnvelope) => void,
  ) {}

  start(): void {
    this.onStatus("connecting");
    this.open();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket !== null) {
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      if (this.socket.readyState !== WebSocket.CLOSED) this.socket.close();
      this.socket = null;
    }
  }

  private open(): void {
    if (this.closed || this.socket !== null) return;

    const url = buildSocketUrl(this.sceneId);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.onStatus("connected");
    };

    socket.onmessage = (ev) => {
      if (this.socket !== socket) return;
      try {
        const parsed = JSON.parse(String(ev.data)) as OverlayEnvelope;
        const type = typeof parsed.event_type === "string" ? parsed.event_type : "";
        if (type === "overlay.hello") this.onEnvelope("hello", parsed);
        else if (type === "overlay.widgets_updated") this.onEnvelope("widgets", parsed);
        else if (type === "overlay.layout" || type === "overlay.layout_updated") {
          // Only accept layout updates for the scene this page renders —
          // the bus fans every envelope out to every overlay socket.
          const payloadScene = (parsed.payload ?? {}).scene;
          if (
            type === "overlay.layout" ||
            (typeof payloadScene === "string" &&
              payloadScene.toLowerCase() === this.sceneId.toLowerCase())
          ) {
            this.onEnvelope("layout", parsed);
          }
        } else this.onEnvelope("event", parsed);
      } catch {
        // Non-JSON frame from an unknown producer — ignore defensively.
      }
    };

    socket.onerror = () => {
      // onclose always follows; reconnect logic lives there.
    };

    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      // 4401 = token rejected; 1008 = scene not in the DB. Retrying with the
      // same URL fails forever — go terminal and tell the human what to fix
      // (review candidate 7: the old loop retried 4401 eternally).
      if (ev.code === WS_AUTH_CLOSE_CODE) {
        this.terminal = "auth-error";
        this.onStatus("auth-error");
        return;
      }
      if (ev.code === WS_UNKNOWN_SCENE_CLOSE_CODE) {
        this.terminal = "unknown-scene";
        this.onStatus("unknown-scene");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed || this.terminal !== null || this.reconnectTimer !== null) return;
    this.onStatus("disconnected");
    this.attempt += 1;
    const exponential = Math.min(BASE_DELAY_MS * 2 ** (this.attempt - 1), MAX_DELAY_MS);
    const jitter = Math.random() * Math.min(250, exponential / 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, exponential + jitter);
  }
}

/** Reads ?token= from the page URL; absent token ⇒ backend closes with 4401. */
function readToken(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

function buildSocketUrl(sceneId: string): string {
  const url = new URL(`ws://127.0.0.1:${readBackendPort()}/ws/overlay/${encodeURIComponent(sceneId)}`);
  const token = readToken();
  if (token) url.searchParams.set("token", token);
  return url.toString();
}
