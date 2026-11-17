/**
 * Study Stream 2.0 — design tokens (SOURCE OF TRUTH).
 *
 * Dark-first, Material 3-inspired: graphite/charcoal surfaces, a deep green +
 * muted sage primary pair, and teal/blue/lavender accents.
 *
 * `tokens.css` mirrors this file as CSS custom properties. tokens.ts is
 * authoritative: any change must be applied here first, then to tokens.css.
 * Phase 4 widgets consume tokens only — never hardcoded colors.
 */

export const colors = {
  /** Graphite/charcoal surfaces, darkest first. */
  surface: {
    /** App background behind everything. */
    background: "#0e1211",
    /** Default card / panel surface. */
    base: "#161b19",
    /** Slightly lifted surface (nested panels, alternating rows). */
    variant: "#1f2623",
    /** Highest opaque surface (popovers, floating toolbars). */
    container: "#242d29",
    /** Hairline borders. */
    outline: "#313a36",
    /** Stronger borders / dividers that must survive compression. */
    outlineStrong: "#47524d",
  },
  /** Foreground text roles on dark surfaces. */
  text: {
    primary: "#e6eae7",
    muted: "#9aa5a0",
    faint: "#6f7a75",
    /** Text placed on primary/deep-green fills. */
    onPrimary: "#f2f6f4",
    /** Text placed on soft primary tints (tonal surfaces). */
    onSoft: "#a9c8b8",
    /** Text placed on danger fills. */
    onDanger: "#fdeeed",
  },
  /** Primary brand pair: deep green for action, muted sage for support. */
  primary: {
    deep: "#3d8a66",
    deepHover: "#479b73",
    sage: "#9dc0af",
    /** Translucent primary used for tonal fills. */
    soft: "rgba(78, 154, 122, 0.16)",
    /** Hover state for tonal/outlined-on-tint fills. */
    softHover: "rgba(78, 154, 122, 0.26)",
    /** Barely-there sage wash for outlined hover fills. */
    sageWash: "rgba(157, 192, 175, 0.08)",
  },
  /** Secondary accents — data viz, focus highlights, widget identity. */
  accent: {
    teal: "#4fb3ae",
    blue: "#6b9bd6",
    lavender: "#a89bd8",
  },
  /** Service/lifecycle status semantics (pills, dots, indicators). */
  status: {
    online: "#57a97b",
    offline: "#8a938e",
    degraded: "#d9a24e",
    warning: "#d4714e",
  },
  /** General semantic feedback colors. */
  semantic: {
    success: "#57a97b",
    warning: "#d9a24e",
    danger: "#d46b6b",
    dangerHover: "#dd7d7d",
    info: "#6b9bd6",
  },
} as const;

export const radii = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  /** M3 Expressive signature shape (large, soft cards). */
  expressive: "28px",
  xl2: "40px",
  pill: "999px",
} as const;

/** 4px-base spacing scale (key = multiple of 4px). */
export const spacing = {
  s1: "4px",
  s2: "8px",
  s3: "12px",
  s4: "16px",
  s5: "20px",
  s6: "24px",
  s8: "32px",
  s10: "40px",
  s12: "48px",
} as const;

export const typography = {
  /** M3 Expressive display face for hero moments. */
  fontFamilyDisplay:
    '"Google Sans Flex", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif',
  fontFamily:
    '"Google Sans Text", "Segoe UI", system-ui, -apple-system, "Segoe UI Variable Text", sans-serif',
  fontFamilyMono:
    '"JetBrains Mono", ui-monospace, "Cascadia Code", Consolas, monospace',
  size: {
    xs: "11px",
    sm: "12px",
    md: "14px",
    lg: "16px",
    xl: "20px",
    xxl: "28px",
    displayCompact: "40px",
    display: "56px",
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const motion = {
  /** ms — micro feedback (hover tint, dot glow). */
  durationFast: 120,
  /** ms — default component transition. */
  durationBase: 160,
  /** ms — larger surface changes (card tone, panel reveal). */
  durationSlow: 200,
  /** Single standard easing for the whole system. */
  easingStandard: "cubic-bezier(0.2, 0, 0, 1)",
  /** Entrance reveal — critically damped, no bounce. */
  easingDecelerate: "cubic-bezier(0, 0, 0.2, 1)",
  /** Expressive spring — app launch, selection chrome. Gentle. */
  spring: "420ms cubic-bezier(0.34, 1.4, 0.36, 1)",
  /** Page/section reveal timing. */
  reveal: "520ms cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/** Everything above, grouped for a single import site in Phase 4. */
export const tokens = {
  colors,
  radii,
  spacing,
  typography,
  motion,
} as const;

export type Tokens = typeof tokens;

/** A color group name, e.g. "surface" | "primary" | "status". */
export type ColorGroup = keyof typeof colors;

/** Any color token name across all groups, e.g. "base" | "deep" | "online". */
export type ColorTokenName = {
  [G in ColorGroup]: keyof (typeof colors)[G];
}[ColorGroup];
