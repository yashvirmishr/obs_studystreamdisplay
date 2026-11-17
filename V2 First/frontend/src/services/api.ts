/**
 * Study Stream 2.0 — typed API client (candidate 2 of the architecture review).
 *
 * Every network call the frontend makes goes through this module. It owns:
 *   - port discovery (Tauri IPC → ephemeral port; browser dev → ?port or 47831)
 *   - per-launch token discovery (Tauri IPC → memory only; ?token= escape hatch)
 *   - the auth header, JSON envelope, and one error taxonomy (HttpError)
 *
 * Pages never see fetch(), ports, or tokens. Test seam: mock this module.
 */

export const DEFAULT_PORT = 47831;

export interface HealthResponse {
  status: string;
  service: string;
  api_version: string;
}

export type BackendStatus =
  | { state: "starting" }
  | { state: "ready"; port: number }
  | { state: "error"; message: string };

/* ── launch discovery (Tauri shell first, browser dev fallback) ─────── */

interface TauriInternals {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

function getTauriInternals(): TauriInternals | null {
  const w = window as unknown as Record<string, unknown>;
  const internals = w["__TAURI_INTERNALS__"];
  return internals && typeof internals === "object" ? (internals as TauriInternals) : null;
}

export const runningInsideTauri = (): boolean => getTauriInternals() !== null;

export async function getBackendStatus(): Promise<BackendStatus> {
  const internals = getTauriInternals();
  if (!internals) return { state: "starting" };
  const raw = await internals.invoke<Record<string, unknown>>("get_backend_status");
  if (raw.state === "ready" && typeof raw.port === "number") return { state: "ready", port: raw.port };
  if (raw.state === "error" && typeof raw.message === "string") return { state: "error", message: raw.message };
  return { state: "starting" };
}

async function getAuthToken(): Promise<string | null> {
  const internals = getTauriInternals();
  if (internals) {
    try {
      return await internals.invoke<string>("get_auth_token");
    } catch {
      return null;
    }
  }
  return new URLSearchParams(window.location.search).get("token");
}

export async function resolvePort(): Promise<number | null> {
  if (runningInsideTauri()) {
    const status = await getBackendStatus();
    return status.state === "ready" ? status.port : null;
  }
  const raw = new URLSearchParams(window.location.search).get("port");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

/* ── core request machinery ──────────────────────────────────── */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
  get isAuth(): boolean { return this.status === 401; }
  get isConflict(): boolean { return this.status === 409; }
  get isNotImplemented(): boolean { return this.status === 501; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const port = await resolvePort();
  if (port === null) {
    throw new HttpError(0, "desktop shell has not reported a ready backend yet");
  }
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("X-Auth-Token", token);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers });
  } catch {
    throw new HttpError(0, `backend unreachable at 127.0.0.1:${port}`);
  }
  if (!response.ok) {
    let detail = `backend responded with ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === "string" && body.detail) detail = body.detail;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new HttpError(response.status, detail);
  }
  return (await response.json()) as T;
}

/* ── namespaces ─────────────────────────────────────────────── */

export interface StudyState {
  state: "idle" | "running" | "paused" | "completed";
  session_id: number | null;
  elapsed_seconds: number;
  today_total_seconds: number;
  subject: string | null;
  task: string | null;
  started_at: string | null;
}

export interface StudyHistoryEntry {
  id: number;
  seconds: number;
  subject: string | null;
  task: string | null;
  completed_at: string | null;
}

export type EventSourceName =
  | "twitch" | "kick" | "youtube" | "streamelements" | "study" | "system" | "test";

export interface RecentEvent {
  event_id: string;
  event_type: string;
  source: EventSourceName;
  occurred_at: string | null;
  received_at: string | null;
  is_simulated: boolean;
  payload: Record<string, unknown>;
}

export interface IntegrationInfo {
  provider: string;
  name: string;
  detail: string;
  scopes: string[];
  status: "disconnected" | "connecting" | "connected" | "error";
  account_name: string | null;
  last_connected_at: string | null;
  last_error: string | null;
}

export interface AppSettings {
  study_goal_hours: number | null;
  enabled_widgets: string[] | null;
  theme_accent: string | null;
  schema_marker: string | null;
}

export interface LayoutPlacement {
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

/**
 * Normalised placement coordinate guard — the single invariant that must
 * hold on both sides of the wire (SQLite CHECKs enforce it too).
 */
export function isNormalisedPlacement(p: LayoutPlacement): boolean {
  return (
    Number.isFinite(p.position_x) && Number.isFinite(p.position_y) &&
    Number.isFinite(p.width) && Number.isFinite(p.height) &&
    p.position_x >= 0 && p.position_y >= 0 &&
    p.width > 0 && p.height > 0 &&
    p.position_x + p.width <= 1 + 1e-9 &&
    p.position_y + p.height <= 1 + 1e-9 &&
    p.z_index >= 0 &&
    p.opacity >= 0 && p.opacity <= 1
  );
}

export interface TestEventBody {
  type:
    | "stream.follow"
    | "stream.cheer"
    | "stream.subscription"
    | "stream.gift_subscription"
    | "stream.raid"
    | "donation.tip";
  username: string;
  message?: string;
  amount?: number;
  currency?: string;
  bits?: number;
}

export const api = {
  health: {
    check: async (port?: number | null): Promise<HealthResponse> => {
      const effectivePort = port ?? (await resolvePort());
      const token = await getAuthToken();
      const response = await fetch(`http://127.0.0.1:${effectivePort}/api/v1/health`, {
        headers: token ? { "X-Auth-Token": token } : undefined,
      });
      if (!response.ok) throw new HttpError(response.status, `health ${response.status}`);
      return (await response.json()) as HealthResponse;
    },
  },

  study: {
    state: () => request<StudyState>("/api/v1/study/state"),
    start: (body: { subject?: string; task?: string }) =>
      request<StudyState>("/api/v1/study/start", { method: "POST", body: JSON.stringify(body) }),
    pause: () => request<StudyState>("/api/v1/study/pause", { method: "POST" }),
    resume: () => request<StudyState>("/api/v1/study/resume", { method: "POST" }),
    stop: () => request<StudyState>("/api/v1/study/stop", { method: "POST" }),
    history: (limit = 100) => request<StudyHistoryEntry[]>(`/api/v1/study/history?limit=${limit}`),
  },

  activity: {
    recent: (limit = 50) => request<RecentEvent[]>(`/api/v1/activity/recent?limit=${limit}`),
  },

  events: {
    sendTest: (body: TestEventBody) =>
      request<RecentEvent>("/api/v1/events/test", { method: "POST", body: JSON.stringify(body) }),
  },

  integrations: {
    list: () => request<IntegrationInfo[]>("/api/v1/integrations"),
    connect: (provider: string) =>
      request<{ provider: string; status: string }>(
        `/api/v1/integrations/${provider}/connect`,
        { method: "POST" },
      ),
    disconnect: (provider: string) =>
      request<{ provider: string; status: string }>(
        `/api/v1/integrations/${provider}/disconnect`,
        { method: "POST" },
      ),
  },

  settings: {
    get: (keys?: string[]) =>
      request<AppSettings>(`/api/v1/settings${keys ? `?keys=${keys.join(",")}` : ""}`),
    put: (values: Record<string, unknown>) =>
      request<Record<string, unknown>>("/api/v1/settings", {
        method: "PUT",
        body: JSON.stringify({ values }),
      }),
  },

  scenes: {
    list: () =>
      request<{ scenes: Array<{ name: string; is_active: boolean; canvas_width: number; canvas_height: number }> }>(
        "/api/v1/scenes",
      ),
    getLayout: (sceneName: string) =>
      request<{ scene: string; placements: LayoutPlacement[] | null }>(
        `/api/v1/scenes/${encodeURIComponent(sceneName)}/layout`,
      ),
    putLayout: (sceneName: string, placements: LayoutPlacement[]) =>
      request<{ scene: string; placements: LayoutPlacement[] }>(
        `/api/v1/scenes/${encodeURIComponent(sceneName)}/layout`,
        { method: "PUT", body: JSON.stringify({ placements }) },
      ),
  },

  obs: {
    /** Returns the full URL an OBS Browser Source should be pointed at. */
    overlayUrl: (sceneName: string) =>
      request<{ scene: string; token: string; url: string; note: string }>(
        `/api/v1/obs/overlay-url?scene=${encodeURIComponent(sceneName)}`,
      ),
  }
} as const;
