/**
 * Icon guard for names that come from the backend (the widget registry).
 * Keeps the frontend honest when the backend lists an icon this build of
 * the design system doesn't know: render the generic widget icon instead
 * of crashing or silently mis-rendering.
 */
import { ICON_NAMES, type IconName } from "../design/icons";

const KNOWN = new Set<string>(ICON_NAMES);

export function iconOr(name: string, fallback: IconName = "widgets"): IconName {
  return KNOWN.has(name) ? (name as IconName) : fallback;
}
