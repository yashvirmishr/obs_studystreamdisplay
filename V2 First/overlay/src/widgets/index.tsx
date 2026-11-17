import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { OverlaySnapshot } from "../connection/useOverlaySocket";
import { clockDuration, formatEvent, humanDuration, parseBackendUtc, relativeTime } from "./eventText";
import type { EventLine } from "./eventText";

/**
 * The eight overlay widget renderers (Phase 4). Each is fed exclusively by
 * backend data pushed over the scene's authenticated WebSocket — there is no
 * mock data and no HTTP fallback (the page holds only its scene token, so the
 * /api/v1 HTTP API would 401 by design).
 *
 * Honest empty states: chat (Phase 5) and media (Phase 7) have no live
 * providers yet, so they say exactly that instead of showing placeholder
 * content.
 */

/** 1 Hz tick while `active`; returns Date.now() (also once when inactive). */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function WidgetSurface(props: {
  kind: string;
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`widget widget--${props.kind}${props.compact ? " widget--compact" : ""}`}>
      <span className="widget__k">{props.title}</span>
      <div className="widget__v">{props.children}</div>
    </div>
  );
}

export function StudyTimer({ snapshot }: { snapshot: OverlaySnapshot }) {
  const running = snapshot.study.state === "running";
  const now = useTick(running);
  // While running, advance the backend's authoritative elapsed locally and
  // re-base on every study.* envelope (each carries full state).
  const drift = running ? Math.max(0, Math.floor((now - snapshot.receivedAt) / 1000)) : 0;
  const elapsed = Math.max(0, snapshot.study.elapsed_seconds + drift);
  const idle = snapshot.study.state === "idle";
  const paused = snapshot.study.state === "paused";

  return (
    <WidgetSurface kind="timer" title={idle ? "No active session" : running ? "Focusing" : "Paused"}>
      <span className={`widget__timer${paused ? " is-paused" : ""}`}>{clockDuration(elapsed)}</span>
      {!idle && snapshot.study.task && (
        <span className="widget__sub">{snapshot.study.task}</span>
      )}
    </WidgetSurface>
  );
}

export function Clock() {
  const now = useTick(true);
  const date = new Date(now);
  return (
    <WidgetSurface kind="clock" title={date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}>
      <span className="widget__clock">
        {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
      </span>
    </WidgetSurface>
  );
}

export function SubjectTask({ snapshot }: { snapshot: OverlaySnapshot }) {
  const { subject, task } = snapshot.study;
  if (!subject && !task) {
    return (
      <WidgetSurface kind="chip" title="Subject">
        <span className="widget__empty">no session running</span>
      </WidgetSurface>
    );
  }
  return (
    <WidgetSurface kind="chip" title="Subject">
      <span className="widget__chip-text">{subject ?? "Unlabelled session"}</span>
      {task && <span className="widget__sub">{task}</span>}
    </WidgetSurface>
  );
}

export function GoalRing({ snapshot }: { snapshot: OverlaySnapshot }) {
  const goalHours = snapshot.goal.study_goal_hours;
  const running = snapshot.study.state === "running";
  const now = useTick(running);
  const drift = running ? Math.max(0, Math.floor((now - snapshot.receivedAt) / 1000)) : 0;
  const today = Math.max(0, snapshot.study.today_total_seconds + drift);

  if (!goalHours) {
    return (
      <WidgetSurface kind="goal" title="Daily goal" compact>
        <span className="widget__empty">no goal set — choose one in Settings</span>
      </WidgetSurface>
    );
  }
  const goalSeconds = goalHours * 3600;
  const fraction = Math.min(1, today / goalSeconds);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <WidgetSurface kind="goal" title="Daily goal" compact>
      <div className="widget__goal-row">
        <svg viewBox="0 0 100 100" className="widget__ring" role="img" aria-label={`${Math.round(fraction * 100)}% of daily goal`}>
          <circle cx="50" cy="50" r={radius} className="widget__ring-track" />
          <circle
            cx="50" cy="50" r={radius}
            className="widget__ring-fill"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
          />
        </svg>
        <span className="widget__ring-pct">{Math.round(fraction * 100)}%</span>
      </div>
      <span className="widget__sub">{humanDuration(today)} of {goalHours} h</span>
    </WidgetSurface>
  );
}

export function SessionHistory({ snapshot }: { snapshot: OverlaySnapshot }) {
  const sessions = snapshot.recent_sessions.slice(0, 5);
  if (sessions.length === 0) {
    return (
      <WidgetSurface kind="history" title="Session history" compact>
        <span className="widget__empty">no completed sessions yet</span>
      </WidgetSurface>
    );
  }
  return (
    <WidgetSurface kind="history" title="Session history" compact>
      <ul className="widget__list">
        {sessions.map((s) => (
          <li key={s.id}>
            <span className="widget__list-main">{s.subject ?? "Session"} · {humanDuration(s.seconds)}</span>
            <span className="widget__list-side">{s.completed_at ? relativeTime(parseBackendUtc(s.completed_at)) : ""}</span>
          </li>
        ))}
      </ul>
    </WidgetSurface>
  );
}

export function UnifiedChat() {
  return (
    <WidgetSurface kind="chat" title="Live chat · Twitch + Kick">
      <span className="widget__empty">
        chat appears here once an integration is connected (Integrations page)
      </span>
    </WidgetSurface>
  );
}

export function NowPlaying() {
  return (
    <WidgetSurface kind="media" title="Now playing">
      <span className="widget__empty">
        connect the YouTube extension to see what&apos;s playing
      </span>
    </WidgetSurface>
  );
}

export function LiveActivity({ feed }: { feed: OverlayEnvelopeLike[] }) {
  const lines = feed
    .filter((e) => typeof e.event_type === "string" && !e.event_type.startsWith("overlay."))
    .map(formatEvent)
    .slice(0, 6);
  if (lines.length === 0) {
    return (
      <WidgetSurface kind="alert" title="Live activity" compact>
        <span className="widget__empty">no events yet</span>
      </WidgetSurface>
    );
  }
  return (
    <WidgetSurface kind="alert" title="Live activity" compact>
      <ul className="widget__activity">
        {lines.map((line: EventLine, i: number) => (
          <li key={`${line.text}-${i}`}>
            <span className={`overlay-ticker__chip overlay-ticker__chip--${line.tone}`}>{line.label}</span>
            <span className="widget__activity-text">{line.text}</span>
            {line.simulated && <span className="overlay-ticker__sim">sim</span>}
          </li>
        ))}
      </ul>
    </WidgetSurface>
  );
}

type OverlayEnvelopeLike = Parameters<typeof formatEvent>[0];
