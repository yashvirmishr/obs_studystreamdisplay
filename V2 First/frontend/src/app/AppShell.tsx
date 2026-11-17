import type { ReactNode } from "react";
import { Icon, type IconName } from "../design/icons";
import { NAV_ITEMS, type PageId } from "./routes";

export interface AppShellProps {
  active: PageId;
  onNavigate: (page: PageId) => void;
  backendLabel: string;
  backendOk: boolean | null;
  children: ReactNode;
}

const NAV_ICONS: Record<PageId, IconName> = {
  overview: "overview",
  studio: "studio",
  widgets: "widgets",
  integrations: "integrations",
  activity: "activity",
  settings: "settings",
};

/**
 * Study Stream 2.0 application frame (Material 3 Expressive).
 * Navigation rail + top bar; the window IS the product — no chrome.
 */
export function AppShell({ active, onNavigate, backendLabel, backendOk, children }: AppShellProps) {
  return (
    <div className="ss-ambient">
      <div className="frame">
        {/* ── Top bar ── */}
        <header className="topbar">
          <div className="brand">
            <div className="brand-lockup" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="13" r="8" stroke="#f2f6f4" strokeWidth="2" strokeLinecap="round" strokeDasharray="34 12" transform="rotate(-45 12 13)" />
                <circle cx="12" cy="13" r="3.2" fill="#f2f6f4" />
                <path d="M9 2.5h6" stroke="#f2f6f4" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="brand-name">
                Study <em>Stream</em>
              </div>
              <div className="brand-tag">Studio · v0.1</div>
            </div>
          </div>

          <label className="search" aria-label="Search">
            <Icon name="search" size={18} />
            <input
              placeholder="Search scenes, widgets, settings…"
              style={{ all: "unset", flex: 1, color: "inherit", fontSize: "13px" }}
            />
            <kbd>⌘K</kbd>
          </label>

          <div className="topbar-right">
            <span className="chip-preview" title="UI is a live preview wired to a local backend; integrations arrive in Phase 5–6">
              Preview
            </span>
            <button className="icon-btn" aria-label="Notifications" type="button">
              <Icon name="bell" size={20} />
              <span className="dot" />
            </button>
            <div
              className="avatar"
              title={backendOk === false ? "Backend unreachable" : `Backend: ${backendLabel}`}
              aria-label="Profile"
            >
              Y
            </div>
          </div>
        </header>

        {/* ── Navigation rail ── */}
        <nav className="rail" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                className={`rail-item${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <span className="rail-icon">
                  <Icon name={NAV_ICONS[item.id]} size={22} filled={isActive} />
                </span>
                <span className="label">{item.label}</span>
              </button>
            );
          })}
          <div className="rail-spacer" />
          <div
            className="chip-preview"
            style={{ padding: "3px 8px", fontSize: "8px" }}
            title="Local-only backend · bound to 127.0.0.1 · per-launch token auth"
          >
            127.0.0.1
          </div>
        </nav>

        {/* ── Page content ── */}
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
