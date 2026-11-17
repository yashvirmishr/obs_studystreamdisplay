import { useState } from "react";
import { AppShell } from "./app/AppShell";
import type { PageId } from "./app/routes";
import Overview from "./pages/Overview";
import OverlayStudio from "./pages/OverlayStudio";
import Widgets from "./pages/Widgets";
import Integrations from "./pages/Integrations";
import ActivityCentre from "./pages/ActivityCentre";
import SettingsPage from "./pages/SettingsPage";
import { useBackendProbe } from "./hooks/useBackendProbe";

/**
 * Study Stream 2.0 — root application.
 * Page switch is local state (no router yet); the six sections share the
 * Material 3 Expressive shell defined in AppShell.tsx.
 */
export default function App() {
  const [page, setPage] = useState<PageId>("overview");
  const probe = useBackendProbe();

  const backendOk =
    probe.state === "ready" ? probe.healthy : probe.state === "starting" ? null : false;
  const backendLabel =
    probe.state === "ready"
      ? `ready · ${probe.latencyMs ?? "?"} ms`
      : probe.state === "error"
        ? "unreachable"
        : "launching…";

  return (
    <AppShell active={page} onNavigate={setPage} backendLabel={backendLabel} backendOk={backendOk}>
      {page === "overview" && <Overview probe={probe} />}
      {page === "studio" && <OverlayStudio />}
      {page === "widgets" && <Widgets />}
      {page === "integrations" && <Integrations />}
      {page === "activity" && <ActivityCentre />}
      {page === "settings" && <SettingsPage />}
    </AppShell>
  );
}
