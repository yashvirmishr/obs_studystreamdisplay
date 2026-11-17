/**
 * Shared parsing for backend timestamps.
 *
 * SQLite DateTime columns round-trip NAIVE even with timezone=True —
 * SQLAlchemy does not store the offset. Every datetime the backend writes is
 * UTC by convention, so a missing suffix means UTC, never local time.
 */
export function parseBackendUtc(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`).getTime();
}

export function formatBackendTime(iso: string | null | undefined): string {
  const t = parseBackendUtc(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleTimeString();
}

export function relativeBackendTime(iso: string | null | undefined): string {
  const t = parseBackendUtc(iso);
  if (Number.isNaN(t)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}
