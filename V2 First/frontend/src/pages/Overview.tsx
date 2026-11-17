import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../design/icons";
import { Snackbar } from "../design/primitives/Snackbar";
import {
  api,
  HttpError,
  type RecentEvent,
  type IntegrationInfo,
  type StudyHistoryEntry,
  type StudyState,
} from "../services/api";
import type { BackendProbe } from "../hooks/useBackendProbe";
import { relativeBackendTime, parseBackendUtc } from "../utils/time";
import { formatEventTitle } from "../utils/eventText";
import type { IconName } from "../design/icons";

export interface OverviewProps {
  probe: BackendProbe;
}

const EVENT_ICON: Record<string, IconName> = {
  "stream.follow": "users",
  "stream.subscription": "star",
  "stream.gift_subscription": "star",
  "stream.cheer": "bolt",
  "stream.raid": "heart",
  "stream.gift": "star",
  "donation.tip": "bolt",
  "study.session.stopped": "timer",
  "system.test_event": "spark",
};

function eventTitle(e: RecentEvent): string {
  return formatEventTitle(e);
}

function platformTag(e: RecentEvent): string {
  if (e.is_simulated) return "test";
  if (e.source === "study") return "study";
  const p = e.payload as Record<string, unknown>;
  const fromPayload = p.platform;
  if (typeof fromPayload === "string") return fromPayload;
  return e.source;
}

function relativeTime(iso: string | null): string {
  return relativeBackendTime(iso);
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${pad(seconds % 60)}s`;
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

export default function Overview({ probe }: OverviewProps) {
  const [state, setState] = useState<StudyState | null>(null);
  const [localElapsed, setLocalElapsed] = useState(0);
  const [history, setHistory] = useState<StudyHistoryEntry[] | null>(null);
  const [feed, setFeed] = useState<RecentEvent[] | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [goalHours, setGoalHours] = useState(5);
  const [subject, setSubject] = useState("");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [obsUrl, setObsUrl] = useState<string | null>(null);
  const [obsScene, setObsScene] = useState("Study");
  const [sceneNames, setSceneNames] = useState<string[]>([]);
  const [obsUrlStatus, setObsUrlStatus] = useState<"loading" | "ready" | "error">("loading");
  const [obsUrlError, setObsUrlError] = useState<string | null>(null);
  // Initial load + steady poll to resync with the authoritative backend.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, h, f, ints, settings] = await Promise.all([
          api.study.state(),
          api.study.history(100).catch(() => [] as StudyHistoryEntry[]),
          api.activity.recent(10).catch(() => [] as RecentEvent[]),
          api.integrations.list().catch(() => [] as IntegrationInfo[]),
          api.settings.get(["study_goal_hours"]).catch(() => ({ study_goal_hours: null }) as never),
        ]);
        if (cancelled) return;
        setState(s);
        setLocalElapsed(s.elapsed_seconds);
        setHistory(h);
        setFeed(f);
        setIntegrations(ints);
        if (settings.study_goal_hours) setGoalHours(Number(settings.study_goal_hours));
      } catch {
        /* backend unreachable — cards render their empty states */
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Local 1-second display tick while running; server resync corrects drift.
  const running = state?.state === "running";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setLocalElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const act = async (fn: () => Promise<StudyState>) => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      setLocalElapsed(next.elapsed_seconds);
      // refresh derived numbers
      api.study.history(100).then(setHistory).catch(() => undefined);
      api.activity.recent(10).then(setFeed).catch(() => undefined);
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "operation failed";
      setSnack(message.charAt(0).toUpperCase() + message.slice(1));
    } finally {
      setBusy(false);
    }
  };

  const elapsed = localElapsed;
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  const todaySeconds = state?.today_total_seconds ?? 0;
  const goalSeconds = Math.max(1, goalHours * 3600);
  const goalFraction = Math.min(1, todaySeconds / goalSeconds);
  const goalHoursToday = todaySeconds < 3600
    ? `${Math.floor(todaySeconds / 60)} min`
    : `${(todaySeconds / 3600).toFixed(1)} h`;

  const stats = useMemo(() => {
    if (!history) return null;
    const weekAgo = Date.now() - 7 * 86400 * 1000;
    const thisWeek = history.filter((e) => {
      if (!e.completed_at) return false;
      return parseBackendUtc(e.completed_at) >= weekAgo;
    });
    const longest = history.reduce((max, e) => Math.max(max, e.seconds), 0);
    // consecutive days with ≥1 session, counting back from today
    const days = new Set(history.map((e) => (e.completed_at ? new Date(parseBackendUtc(e.completed_at)).toDateString() : "")));
    let streak = 0;
    const cursor = new Date();
    for (;;) {
      if (days.has(cursor.toDateString())) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else if (streak === 0 && cursor.toDateString() === new Date().toDateString()) {
        // today has no completed session yet — don't break the streak chain from yesterday
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
      if (streak > 400) break;
    }
    return { weekCount: thisWeek.length, longest, streak };
  }, [history]);

  // Scenes for the OBS URL picker — persisted rows from SQLite (honest;
  // never an invented list). Fail-closed: picker stays on the default scene.
  useEffect(() => {
    let cancelled = false;
    api.scenes
      .list()
      .then((r) => {
        if (cancelled) return;
        const names = r.scenes.map((s) => s.name);
        setSceneNames(names);
        setObsScene((prev) => (names.includes(prev) ? prev : names[0] ?? prev));
      })
      .catch(() => {
        /* backend unreachable — URL card shows its own error state */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // OBS overlay URL — refetched whenever the selected scene changes.
  useEffect(() => {
    let cancelled = false;
    setObsUrlStatus("loading");
    setObsUrlError(null);
    api.obs.overlayUrl(obsScene)
      .then((r) => {
        if (cancelled) return;
        setObsUrl(r.url);
        setObsUrlStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setObsUrl(null);
        setObsUrlError(err instanceof Error ? err.message : "could not fetch OBS URL");
        setObsUrlStatus("error");
      });
    return () => { cancelled = true; };
  }, [obsScene]);

  const copyObsUrl = useCallback(async () => {
    if (!obsUrl) return;
    try {
      await navigator.clipboard.writeText(obsUrl);
      setSnack("OBS overlay URL copied to clipboard.");
    } catch {
      setSnack("Could not copy - clipboard blocked?");
    }
  }, [obsUrl]);

  const refreshObsUrl = useCallback(() => {
    setObsUrlStatus("loading");
    setObsUrlError(null);
    api.obs.overlayUrl(obsScene)
      .then((r) => { setObsUrl(r.url); setObsUrlStatus("ready"); })
      .catch((err: unknown) => { setObsUrlError(err instanceof Error ? err.message : "refresh failed"); setObsUrlStatus("error"); });
  }, [obsScene]);

  const connectionRows = useMemo(() => {
    const label: Record<string, string> = {
      twitch: "Twitch · EventSub",
      kick: "Kick · via StreamElements",
      streamelements: "StreamElements · Astro",
      youtube: "YouTube extension",
    };
    const why: Record<string, string> = {
      disconnected: "no credentials connected",
      connecting: "handshake in progress",
      connected: "live",
      error: "see last_error",
    };
    return integrations.map((i) => ({
      name: label[i.provider] ?? i.provider,
      ok: i.status === "connected",
      warn: i.status === "connecting",
      why: why[i.status] ?? i.status,
    }));
  }, [integrations]);

  const backendReachable = probe.state === "ready" && probe.healthy;
  const feedItems = feed ?? [];

  return (
    <div className="page">
      <div className="grid-12">
        {/* ── Hero: live session (backend-authoritative) ── */}
        <section className="hero reveal" aria-label="Current study session">
          <svg className="hero-orb" width="340" height="340" viewBox="0 0 340 340" fill="none" aria-hidden="true">
            <circle cx="170" cy="170" r="160" stroke="rgba(157,192,175,0.14)" strokeWidth="1.5" strokeDasharray="3 9" />
            <circle cx="170" cy="170" r="112" stroke="rgba(157,192,175,0.10)" strokeWidth="1" />
            <circle cx="170" cy="170" r="60" stroke="rgba(87,169,123,0.35)" strokeWidth="1.5" />
            <circle cx="170" cy="58" r="7" fill={running ? "#57a97b" : "#47524d"} />
            <circle cx="282" cy="170" r="4.5" fill="#4fb3ae" />
          </svg>

          <div className="hero-top">
            <span className="live-dot" style={running ? undefined : { background: "var(--ss-color-status-offline)", animation: "none" }} />
            <span className="live-label" style={running ? undefined : { color: "var(--ss-color-text-faint)" }}>{running ? "On Air" : state?.state === "paused" ? "Paused" : "Idle"}</span>
            <span className="hero-date">{new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
          </div>

          <div className="hero-mid">
            {state?.state === "idle" ? (
              <>
                <div className="hero-context">No session running — set a subject and start</div>
                <div className="timer" style={{ opacity: 0.35 }}>00:00:00</div>
                <div className="hero-subject" style={{ gap: 10 }}>
                  <input className="subject-chip" style={{ fontFamily: "var(--ss-font-body)", textTransform: "none", letterSpacing: "normal", border: "0", outline: "none", width: 190 }}
                    placeholder="Subject (e.g. Linear Algebra II)"
                    value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
                  <input style={{ background: "var(--ss-surface-container)", border: "1px solid var(--ss-surface-container-high)", borderRadius: 999, color: "var(--ss-color-text-primary)", padding: "8px 14px", fontSize: 13, width: 230, outline: "none" }}
                    placeholder="Task (optional)" value={task} onChange={(e) => setTask(e.target.value)} aria-label="Task" />
                </div>
              </>
            ) : (
              <>
                <div className="hero-context">{running ? "Study session in progress" : "Session paused"}{state?.subject ? ` — ${state.subject}` : ""}</div>
                <div className="timer" aria-label={`Elapsed ${h} hours ${m} minutes ${s} seconds`}>
                  {pad(h)}:{pad(m)}:{pad(s)}
                </div>
                <div className="hero-subject">
                  {state?.subject && <span className="subject-chip">{state.subject}</span>}
                  {state?.task && <span className="task-line">{state.task}</span>}
                </div>
              </>
            )}
          </div>

          <div className="hero-bottom">
            {state?.state === "idle" ? (
              <button type="button" className="btn btn-filled" disabled={busy} onClick={() => void act(() => api.study.start({ subject: subject.trim() || undefined, task: task.trim() || undefined }))}>
                <Icon name="play" size={18} filled /> Start session
              </button>
            ) : (
              <>
                {state?.state === "paused" ? (
                  <button type="button" className="btn btn-filled" disabled={busy} onClick={() => void act(api.study.resume)}>
                    <Icon name="play" size={18} filled /> Resume
                  </button>
                ) : (
                  <button type="button" className="btn btn-tonal" disabled={busy} onClick={() => void act(api.study.pause)}>
                    <Icon name="pause" size={18} /> Pause
                  </button>
                )}
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(api.study.stop)}>
                  <Icon name="close" size={18} /> End session
                </button>
              </>
            )}
          </div>
        </section>

        {/* ── Right column ── */}
        <div className="stack col-4">
          {/* Now playing: honest empty state (no extension data source yet) */}
          <section className="card hoverable reveal" style={{ animationDelay: "80ms" }} aria-label="Now playing">
            <div className="card-head">
              <div>
                <h3><Icon name="music" size={16} /> Now playing</h3>
                <div className="sub">YouTube · via companion extension</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "10px 6px 4px", gap: 10 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--ss-surface-container-high)", display: "grid", placeItems: "center", color: "var(--ss-color-text-faint)" }}>
                <Icon name="music" size={26} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>No media detected</div>
              <p style={{ fontSize: 11.5, color: "var(--ss-color-text-muted)", lineHeight: 1.55, margin: 0 }}>
                Install the Now Playing extension (Manifest V3) and play YouTube in Chrome or Edge — this panel lights up live.
              </p>
            </div>
          </section>

          {/* Daily goal — real total vs configured goal */}
          <section className="card hoverable reveal" style={{ animationDelay: "140ms" }} aria-label="Today's goal">
            <div className="card-head">
              <div>
                <h3><Icon name="goal" size={16} /> Today’s goal</h3>
                <div className="sub">Resets at local midnight · goal set in Settings</div>
              </div>
              <span className="demo-chip" style={{ borderStyle: "solid" }}>{Math.round(goalFraction * 100)}%</span>
            </div>
            <div className="goal-wrap">
              <div className="goal-ring" role="img" aria-label={`${goalHoursToday} of ${goalHours} hours studied today`}>
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="48" stroke="#202926" strokeWidth="11" fill="none" />
                  <circle
                    cx="60" cy="60" r="48" fill="none" strokeWidth="11" strokeLinecap="round"
                    stroke="url(#goalGrad)" strokeDasharray={`${2 * Math.PI * 48}`}
                    strokeDashoffset={`${2 * Math.PI * 48 * (1 - goalFraction)}`}
                    style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
                  />
                  <defs>
                    <linearGradient id="goalGrad" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="#4fb3ae" />
                      <stop offset="100%" stopColor="#9dc0af" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div>
                <div className="goal-num">{goalHoursToday}<span style={{ fontSize: 16, color: "var(--ss-color-text-muted)" }}> / {goalHours}h</span></div>
                <div className="goal-cap">{todaySeconds === 0 ? "Nothing logged yet — your first session starts the clock." : "Real focus time, straight from your study sessions."}</div>
              </div>
            </div>
          </section>
        </div>

        {/* ── Stat tiles (real history or honest dashes) ── */}
        {([
          { k: "Sessions this week", v: stats ? String(stats.weekCount) : "—", d: stats ? (stats.weekCount === 1 ? "1 completed session" : `${stats.weekCount} completed sessions`) : "no history yet" },
          { k: "Longest focus", v: stats ? (stats.longest > 0 ? formatDuration(stats.longest) : "—") : "—", d: stats && stats.longest > 0 ? "from completed sessions" : "no completed sessions yet" },
          { k: "Current streak", v: stats && stats.streak > 0 ? `${stats.streak} day${stats.streak === 1 ? "" : "s"}` : "—", d: stats && stats.streak > 0 ? "consecutive study days" : "streak begins with your first session" },
        ]).map((s) => (
          <div key={s.k} className="card hoverable stat col-4">
            <span className="k">{s.k}</span>
            <span className="v">{s.v}</span>
            <span className="d" style={stats && s.k !== "Current streak" ? { color: "var(--ss-color-text-muted)" } : undefined}>{s.d}</span>
          </div>
        ))}

        {/* ── Recent activity (real events table) ── */}
        <section className="card col-7" aria-label="Recent activity">
          <div className="card-head">
            <div>
              <h3><Icon name="activity" size={16} /> Recent activity</h3>
              <div className="sub">Events from your integrations and study milestones</div>
            </div>
          </div>
          <div className="feed">
            {feedItems.length === 0 && (
              <p style={{ color: "var(--ss-color-text-faint)", fontSize: 12, textAlign: "center", padding: "28px 12px", lineHeight: 1.7 }}>
                Nothing here yet. Connect StreamElements/Twitch, or send a test event from the Integrations tab — real follows, subs, tips and your completed study sessions will land here.
              </p>
            )}
            {feedItems.map((item) => (
              <div key={item.event_id} className="feed-item">
                <div className={`feed-ic ${item.event_type.includes("tip") ? "tip" : item.event_type.includes("follow") ? "follow" : item.event_type.includes("subscription") ? "sub" : item.event_type.includes("raid") ? "raid" : "start"}`}>
                  <Icon name={EVENT_ICON[item.event_type] ?? "spark"} size={18} />
                </div>
                <div className="feed-body">
                  <div className="feed-line">{eventTitle(item)}</div>
                  <div className="feed-meta">
                    <span className={`tag ${item.is_simulated ? "tip" : item.source === "streamelements" || item.source === "twitch" || item.source === "kick" || item.source === "youtube" ? (platformTag(item) === "kick" ? "kick" : "twitch") : "system"}`}>{platformTag(item)}</span>
                    <span>{relativeTime(item.received_at ?? item.occurred_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── OBS overlay URL (live from backend, scene-specific) ── */}
        <section className="card col-5" aria-label="OBS overlay URL">
          <div className="card-head">
            <div>
              <h3><Icon name="integrations" size={16} /> OBS overlay URL</h3>
              <div className="sub">Scene-specific credential · paste into OBS Browser Source</div>
            </div>
          </div>
          {sceneNames.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }} role="tablist" aria-label="OBS scene">
              {sceneNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={obsScene === name}
                  className={`scene-chip${obsScene === name ? " active" : ""}`}
                  onClick={() => setObsScene(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              readOnly
              value={obsUrl ?? ""}
              aria-label="OBS overlay URL"
              style={{
                flex: 1,
                fontFamily: "var(--ss-font-mono)",
                fontSize: 11,
                padding: "10px 12px",
                background: "var(--ss-surface-container-low)",
                border: "1px solid var(--ss-surface-container-highest)",
                borderRadius: "var(--ss-radii-md)",
                color: "var(--ss-color-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            />
            <button
              type="button"
              className="btn btn-tonal"
              onClick={copyObsUrl}
              title="Copy OBS URL to clipboard"
            >
              <Icon name="copy" size={15} /> Copy
            </button>
            <button
              type="button"
              className="btn btn-outlined"
              onClick={refreshObsUrl}
              title="Refresh OBS URL"
            >
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
          <p style={{ fontSize: 10.5, color: "var(--ss-color-text-faint)", lineHeight: 1.5, marginTop: 10 }}>
            {obsUrlStatus === "loading" && "Fetching the OBS overlay URL from the backend…"}
            {obsUrlStatus === "error" && (obsUrlError ?? "OBS overlay URL unavailable — backend may not be reachable.")}
            {obsUrlStatus === "ready" && "This URL contains a persistent per-scene token. Paste it into an OBS Browser Source (1920×1080, transparent, no custom CSS). Different scenes get different URLs."}
          </p>
        </section>
        <section className="card col-5" aria-label="Connection health">
          <div className="card-head">
            <div>
              <h3><Icon name="shield" size={16} /> Connection health</h3>
              <div className="sub">Live status · probed every 2 s</div>
            </div>
            <span className="demo-chip" style={{ borderStyle: "solid" }}>{backendReachable ? `${probe.state === "ready" ? probe.latencyMs : "?"} ms` : "down"}</span>
          </div>
          <div className="conn">
            <div className="conn-row">
              <span className={`conn-dot ${backendReachable ? "ok" : "bad"}`} />
              <span className="name">Backend · 127.0.0.1:{probe.state === "ready" ? probe.port : 47831}</span>
              <span className="why">{probe.state === "ready" ? (probe.healthy ? "authenticated, fail-closed" : "token rejected?") : "launching…"}</span>
            </div>
            <div className="conn-row">
              <span className={`conn-dot ${backendReachable ? "ok" : "bad"}`} />
              <span className="name">OBS overlay · /overlay/{obsScene.toLowerCase().replace(/ /g, "%20")}</span>
              <span className="why">needs the overlay renderer build</span>
            </div>
            {connectionRows.map((c) => (
              <div key={c.name} className="conn-row">
                <span className={`conn-dot ${c.ok ? "ok" : c.warn ? "warn" : "bad"}`} />
                <span className="name">{c.name}</span>
                <span className="why">{c.why}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {snack && <Snackbar message={snack} onDismiss={() => setSnack(null)} />}
    </div>
  );
}
