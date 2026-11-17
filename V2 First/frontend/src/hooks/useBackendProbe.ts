import { useEffect, useState } from "react";
import {
  api,
  getBackendStatus,
  resolvePort,
  runningInsideTauri,
  type BackendStatus,
  type HealthResponse,
} from "../services/api";

export type BackendProbe =
  | { state: "starting" }
  | { state: "error"; message: string }
  | { state: "ready"; port: number; healthy: boolean; latencyMs: number | null; info: HealthResponse | null };

const POLL_MS = 1500;

/**
 * Single probing source for the shell↔backend lifecycle + health round-trip.
 * Every page/hook consumes this instead of re-implementing the handshake.
 */
export function useBackendProbe(): BackendProbe {
  const [probe, setProbe] = useState<BackendProbe>({ state: "starting" });

  useEffect(() => {
    let cancelled = false;
    let port: number | null = null;

    const tick = async () => {
      if (runningInsideTauri()) {
        let status: BackendStatus;
        try {
          status = await getBackendStatus();
        } catch {
          status = { state: "starting" };
        }
        if (status.state === "error") {
          if (!cancelled) setProbe({ state: "error", message: status.message });
          return;
        }
        port = status.state === "ready" ? status.port : port;
        if (status.state === "starting" && !cancelled) setProbe({ state: "starting" });
      } else {
        port = await resolvePort();
      }

      const started = performance.now();
      try {
        const info = await api.health.check(port);
        if (!cancelled) {
          setProbe({
            state: "ready",
            port: port ?? 47831,
            healthy: true,
            latencyMs: Math.max(1, Math.round(performance.now() - started)),
            info,
          });
        }
      } catch {
        if (!cancelled) {
          setProbe({
            state: "ready",
            port: port ?? 47831,
            healthy: false,
            latencyMs: null,
            info: null,
          });
        }
      }
      // No attempt cap: a local 1.5 s HTTP probe is cheap and the dashboard
      // must recover automatically when the backend restarts. (A previous
      // `if (attempts > 400) return` here was dead code — it ran after all
      // side effects and stopped nothing.)
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return probe;
}
