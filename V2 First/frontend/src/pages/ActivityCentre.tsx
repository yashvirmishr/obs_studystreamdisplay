import { useEffect, useMemo, useState } from "react";
import { Icon } from "../design/icons";
import {
  api,
  type RecentEvent,
} from "../services/api";
import { formatBackendTime } from "../utils/time";
import { formatEventTitle, formatEventSource } from "../utils/eventText";
import type { IconName } from "../design/icons";

type Filter = "all" | "twitch" | "kick" | "tips";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "twitch", label: "Twitch" },
  { id: "kick", label: "Kick" },
  { id: "tips", label: "Tips" },
];

const EVENT_ICON: Record<string, IconName> = {
  "stream.follow": "users",
  "stream.subscription": "star",
  "stream.gift_subscription": "star",
  "stream.cheer": "bolt",
  "stream.raid": "heart",
  "stream.gift": "star",
  "donation.tip": "bolt",
  "study.session.stopped": "timer",
};

function sourceOf(e: RecentEvent): string {
  return formatEventSource(e);
}

function title(e: RecentEvent): string {
  return formatEventTitle(e);
}

export default function ActivityCentre() {
  const [filter, setFilter] = useState<Filter>("all");
  const [events, setEvents] = useState<RecentEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await api.activity.recent(50);
        if (!cancelled) { setEvents(rows); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "backend unreachable");
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const feed = useMemo(() => {
    if (!events) return [];
    if (filter === "all") return events;
    if (filter === "tips") return events.filter((e) => e.event_type === "donation.tip");
    return events.filter((e) => sourceOf(e) === filter || (e.source === "streamelements" && false));
  }, [events, filter]);

  return (
    <div className="page">
      <div className="reveal" style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "var(--ss-font-display)", fontSize: 34, margin: 0, letterSpacing: "-0.02em" }}>Activity centre</h2>
          <p style={{ margin: "6px 0 0", color: "var(--ss-color-text-muted)", fontSize: 13 }}>Every stream event and study milestone, chronological and persisted</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Filter by platform">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
              className={filter === f.id ? "active" : ""} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-12">
        {/* ── Chat: honest empty until Phase 5 ── */}
        <section className="card chat-panel col-7 reveal" style={{ animationDelay: "60ms" }} aria-label="Unified chat">
          <div className="card-head">
            <div>
              <h3><Icon name="chat" size={16} /> Unified chat</h3>
              <div className="sub">Twitch + Kick · emotes · badges · moderation</div>
            </div>
          </div>
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 30, textAlign: "center" }}>
            <div>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: "var(--ss-surface-container-high)", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "var(--ss-color-text-faint)" }}>
                <Icon name="chat" size={28} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Chat is not wired yet</div>
              <p style={{ color: "var(--ss-color-text-muted)", fontSize: 12, lineHeight: 1.7, maxWidth: 380, margin: "8px auto 0" }}>
                Phase 5 connects StreamElements Astro (<code>channel.chat</code>) and renders messages natively — Twitch and Kick in one chronological feed, with badges and emotes. Nothing is simulated or embedded here; this panel shows real traffic only.
              </p>
            </div>
          </div>
        </section>

        {/* ── Event feed (real rows from SQLite) ── */}
        <section className="card col-5 reveal" style={{ animationDelay: "120ms" }} aria-label="Event feed">
          <div className="card-head">
            <div>
              <h3><Icon name="bolt" size={16} /> Event feed</h3>
              <div className="sub">Persisted in SQLite · simulated events marked</div>
            </div>
          </div>
          <div className="feed">
            {events === null && !error && (
              <p style={{ color: "var(--ss-color-text-faint)", fontSize: 12, textAlign: "center", marginTop: 24 }}>Loading…</p>
            )}
            {error && (
              <p style={{ color: "var(--ss-color-semantic-warning)", fontSize: 12, textAlign: "center", marginTop: 24 }}>{error}</p>
            )}
            {events !== null && feed.length === 0 && (
              <p style={{ color: "var(--ss-color-text-faint)", fontSize: 12, textAlign: "center", marginTop: 24, lineHeight: 1.7 }}>
                {filter === "all" ? "No events yet. Send a test event from Integrations — it appears here marked as a simulation." : `No ${filter} events recorded yet.`}
              </p>
            )}
            {feed.map((item) => (
              <div key={item.event_id} className="feed-item">
                <div className={`feed-ic ${item.event_type.includes("tip") ? "tip" : item.event_type.includes("follow") ? "follow" : item.event_type.includes("subscription") ? "sub" : item.event_type.includes("raid") ? "raid" : "start"}`}>
                  <Icon name={EVENT_ICON[item.event_type] ?? "spark"} size={18} />
                </div>
                <div className="feed-body">
                  <div className="feed-line">{title(item)}{item.is_simulated && <span style={{ color: "var(--ss-color-text-faint)" }}> · simulated</span>}</div>
                  <div className="feed-meta">
                    <span className={`tag ${sourceOf(item) === "kick" ? "kick" : sourceOf(item) === "twitch" ? "twitch" : item.event_type === "donation.tip" ? "tip" : "system"}`}>{sourceOf(item)}</span>
                    <span>{formatBackendTime(item.received_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
