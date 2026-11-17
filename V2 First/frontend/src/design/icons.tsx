import type { SVGProps } from "react";

/**
 * Study Stream 2.0 — icon set.
 *
 * Hand-rolled 24×24 stroke icons in the spirit of Material Symbols Rounded:
 * 1.8px stroke, round caps/joins, currentColor fill none unless "filled".
 * One component, enum-checked names — no external icon packages.
 */

export const ICON_NAMES = [
  "overview",
  "studio",
  "widgets",
  "integrations",
  "activity",
  "settings",
  "search",
  "bell",
  "check",
  "chevronRight",
  "close",
  "timer",
  "play",
  "pause",
  "skip",
  "clock",
  "users",
  "heart",
  "chat",
  "send",
  "bolt",
  "star",
  "plus",
  "copy",
  "trash",
  "lock",
  "unlock",
  "eye",
  "eyeOff",
  "layers",
  "grid",
  "shield",
  "music",
  "external",
  "spark",
  "goal",
  "calendar",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  /** Pixel size, default 24. */
  size?: number;
  /** Filled variant for emphasis states. */
  filled?: boolean;
}

const PATHS: Record<IconName, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7.5" height="9" rx="2.5" />
      <rect x="13.5" y="3" width="7.5" height="6" rx="2.5" />
      <rect x="13.5" y="13" width="7.5" height="8" rx="2.5" />
      <rect x="3" y="16" width="7.5" height="5" rx="2.5" />
    </>
  ),
  studio: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="3" />
      <path d="M9 21h6M12 18v3" />
      <rect x="7.5" y="8" width="4" height="3" rx="1" />
      <rect x="12.5" y="11" width="4" height="3" rx="1" />
    </>
  ),
  widgets: (
    <>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 2.5v3.4M12 18.1v3.4M2.5 12h3.4M18.1 12h3.4M5.3 5.3l2.4 2.4M16.3 16.3l2.4 2.4M18.7 5.3l-2.4 2.4M7.7 16.3l-2.4 2.4" />
    </>
  ),
  integrations: (
    <>
      <path d="M9 7V3.5M15 7V3.5" />
      <path d="M7 7h10v4.5a5 5 0 0 1-10 0V7Z" />
      <path d="M12 16.5V21" />
    </>
  ),
  activity: <path d="M3 13h4l2.5-7 4 12 2.5-5H21" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.02 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.02-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.02H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.02 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1.01-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.01 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.01H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </>
  ),
  search: <path d="M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm10 15-4.5-4.5" />,
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9Z" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.5V13l2.4 1.6M9.5 2.5h5" />
    </>
  ),
  play: <path d="M8.5 5.5v13c0 1.2 1.3 1.9 2.3 1.3l10-6.5c0.9-0.6 0.9-1.9 0-2.5l-10-6.5c-1-0.6-2.3 0.1-2.3 1.2Z" />,
  pause: (
    <>
      <rect x="7" y="5" width="3.4" height="14" rx="1.2" />
      <rect x="13.6" y="5" width="3.4" height="14" rx="1.2" />
    </>
  ),
  skip: <path d="M6 6l8 6-8 6V6Zm11-0.5v13" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3.5" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6a3.5 3.5 0 0 1 0 6.8M18.5 20a5.5 5.5 0 0 0-2-4.2" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-9.3-10.3C1.7 6 4.4 3.8 7.3 4.3c1.9 0.35 3.4 1.7 4.7 3.4 1.3-1.7 2.8-3.1 4.7-3.4 2.9-0.5 5.6 1.7 4.6 5.4C19.5 15.4 12 20 12 20Z" />,
  chat: (
    <>
      <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
    </>
  ),
  send: <path d="M21 3 3 10.5 10.5 13 13 21 21 3Zm0 0L10 13.5" />,
  bolt: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />,
  star: <path d="m12 3.5 2.6 5.3 5.9 0.9-4.2 4.1 1 5.8L12 17.1l-5.3 2.5 1-5.8-4.2-4.1 5.9-0.9L12 3.5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l1.2 13A2 2 0 0 0 9.7 22h4.6a2 2 0 0 0 2-2l1.2-13" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M10.5 5.9A10 10 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-3 3.6M6.6 7.4A16 16 0 0 0 2.5 12S6 18.2 12 18.2c1.2 0 2.3-.2 3.3-.6" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 4.8-9 4.8-9-4.8L12 3Z" />
      <path d="m3 12.8 9 4.8 9-4.8" />
      <path d="m3 17.3 9 4.8 9-4.8" />
    </>
  ),
  grid: (
    <>
      <path d="M3.5 9h17M3.5 15h17M9 3.5v17M15 3.5v17" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    </>
  ),
  shield: <path d="M12 3 5 6.5V12c0 4.6 3 8.1 7 9 4-0.9 7-4.4 7-9V6.5L12 3Z" />,
  music: (
    <>
      <path d="M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" />
      <path d="M20 15.8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" />
      <path d="M9 18.5V6l11-2.3V15.8" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
    </>
  ),
  spark: <path d="M12 2l1.9 5.1 5.1 1.9-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2ZM5 17l1 2.5L8.5 20.5 6 21.5 5 24l-1-2.5L1.5 20.5 4 19.5 5 17Z" />,
  goal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.4" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
};

/**
 * Study Stream 2.0 icon.
 * Renders an accessible, consistent 24px icon (or filled accent variant).
 */
export function Icon({ name, size = 24, filled = false, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
