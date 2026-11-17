import type { ConnectionStatus } from "./useOverlaySocket";

const STATUS_TEXT: Record<Exclude<ConnectionStatus, "connected">, string> = {
  connecting: "connecting to backend…",
  disconnected: "backend unreachable — retrying",
  "auth-error": "overlay token rejected — re-copy the URL from the dashboard",
  "unknown-scene": "unknown scene — check the Browser Source URL",
};

/**
 * Small corner badge shown only while the socket is not connected.
 * OBS composites this page over the stream: a full-screen blocker would
 * hide the capture, so the banner stays non-intrusive and disappears the
 * moment the connection is restored.
 */
export function ConnectionBanner({
  status,
  sceneId,
}: {
  status: Exclude<ConnectionStatus, "connected"> | ConnectionStatus;
  sceneId: string;
}) {
  const text =
    status in STATUS_TEXT
      ? STATUS_TEXT[status as Exclude<ConnectionStatus, "connected">]
      : null;
  if (text === null) return null;

  return (
    <div className="connection-banner" role="status" data-scene={sceneId} data-tone={status === "auth-error" || status === "unknown-scene" ? "error" : "retry"}>
      <span className="connection-banner__dot" aria-hidden="true" />
      {text}
    </div>
  );
}
