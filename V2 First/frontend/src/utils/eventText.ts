/**
 * Envelope → human text, shared by Overview and Activity Centre (review
 * candidate 3). The OBS overlay has its own copy in overlay/src/widgets —
 * the three were drifting (gift counts shown in one page, dropped in the
 * other); this module is the dashboard's single source of truth.
 */

export interface EventLike {
  event_type: string;
  source: string;
  is_simulated: boolean;
  payload: Record<string, unknown>;
}

export function formatEventTitle(e: EventLike): string {
  const p = e.payload ?? {};
  const name = String(p.username ?? p.donor_name ?? p.gifter ?? p.from_channel ?? "someone");
  switch (e.event_type) {
    case "stream.follow":
      return `${name} followed`;
    case "stream.subscription":
      return `${name} subscribed`;
    case "stream.gift_subscription":
      return `${name} gifted ${String(p.gift_count ?? "?")} subscriptions`;
    case "stream.cheer":
      return `${name} cheered ${String(p.bits ?? "?")} bits`;
    case "stream.raid":
      return `${name} raided with ${String(p.viewers ?? "?")} viewers`;
    case "donation.tip": {
      const amount = p.amount != null ? Number(p.amount).toFixed(2) : "?";
      return `${name} tipped ${amount} ${String(p.currency ?? "USD")}`;
    }
    case "study.session.started":
      return p.subject ? `Study session started — ${String(p.subject)}` : "Study session started";
    case "study.session.resumed":
      return "Study session resumed";
    case "study.session.paused":
      return "Study session paused";
    case "study.session.stopped":
      return "Study session completed";
    default:
      return e.event_type.replace(/\./g, " ");
  }
}

/** Source/platform tag: "test" always wins so simulated data is labelled. */
export function formatEventSource(e: EventLike): string {
  if (e.is_simulated) return "test";
  const p = e.payload ?? {};
  if (typeof p.platform === "string") return p.platform;
  return String(e.source);
}
