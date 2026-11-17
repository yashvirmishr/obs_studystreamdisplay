import type { OverlayEnvelope } from "../connection/useOverlaySocket";

/**
 * Envelope → human line, shared by the LiveActivity widget and the ticker.
 * Single source of truth so the two can never drift apart (review candidate 3,
 * overlay side).
 */

export interface EventLine {
  label: string;
  text: string;
  tone: string;
  simulated: boolean;
}

export function formatEvent(env: OverlayEnvelope): EventLine {
  const type = typeof env.event_type === "string" ? env.event_type : "event";
  const simulated = env.is_simulated === true;
  const payload = (env.payload ?? {}) as Record<string, unknown>;
  const subject =
    typeof payload.subject === "string" ? payload.subject :
    typeof payload.username === "string" ? payload.username :
    typeof payload.donor_name === "string" ? payload.donor_name :
    undefined;

  switch (type) {
    case "study.session.started":
      return { label: "FOCUS", text: subject ? `Study session — ${subject}` : "Study session started", tone: "study", simulated };
    case "study.session.resumed":
      return { label: "RESUMED", text: "Timer resumed", tone: "study", simulated };
    case "study.session.paused":
      return { label: "PAUSED", text: "Timer paused", tone: "warn", simulated };
    case "study.session.stopped": {
      const mins = typeof payload.seconds === "number" ? Math.floor(payload.seconds / 60) : null;
      return { label: "DONE", text: mins !== null ? `Session complete · ${mins}m` : "Session complete", tone: "study", simulated };
    }
    case "stream.follow":
      return { label: "FOLLOW", text: `${String(payload.username ?? "someone")} followed`, tone: "follow", simulated };
    case "stream.cheer":
      return { label: "CHEER", text: `${String(payload.username ?? "someone")} cheered ${String(payload.bits ?? "")} bits`.trim(), tone: "cheer", simulated };
    case "stream.subscription":
      return { label: "SUB", text: `${String(payload.username ?? "someone")} subscribed`, tone: "sub", simulated };
    case "stream.gift_subscription":
      return { label: "GIFT", text: `${String(payload.gifter ?? payload.username ?? "someone")} gifted subs`, tone: "sub", simulated };
    case "stream.raid":
      return { label: "RAID", text: `${String(payload.from_channel ?? payload.username ?? "someone")} raided · ${String(payload.viewers ?? "?")} viewers`, tone: "raid", simulated };
    case "donation.tip":
      return { label: "TIP", text: `${String(payload.donor_name ?? "someone")} · ${String(payload.amount ?? "")} ${String(payload.currency ?? "")}`.trim(), tone: "tip", simulated };
    default:
      return { label: type.split(".").pop()?.toUpperCase() ?? "EVENT", text: type, tone: "info", simulated };
  }
}

/** Naive ISO timestamps from SQLite are UTC by backend convention. */
export function parseBackendUtc(iso: string): number {
  const withZone = /[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const ms = Date.parse(withZone);
  return Number.isFinite(ms) ? ms : 0;
}

export function relativeTime(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** 12 345 s → "3h 25m"; under a minute → "45s". */
export function humanDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** 12 345 s → "03:25:45" (hours zero-padded to 2+ digits). */
export function clockDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
