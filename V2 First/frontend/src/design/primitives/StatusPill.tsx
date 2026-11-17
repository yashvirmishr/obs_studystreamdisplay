import type { HTMLAttributes } from "react";

/** Lifecycle/health semantics rendered as a dot + label pill. */
export type StatusKind = "online" | "offline" | "degraded" | "warning";

export type StatusPillSize = "sm" | "md";

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Status drives the dot color and the default label. */
  status: StatusKind;
  /** Optional label override; defaults to the capitalized status name. */
  label?: string;
  /** Density preset, defaults to `md`. */
  size?: StatusPillSize;
}

const kindClass: Record<StatusKind, string> = {
  online: "ss-status-pill--online",
  offline: "ss-status-pill--offline",
  degraded: "ss-status-pill--degraded",
  warning: "ss-status-pill--warning",
};

const sizeClass: Record<StatusPillSize, string> = {
  sm: "ss-status-pill--sm",
  md: "ss-status-pill--md",
};

const defaultLabel: Record<StatusKind, string> = {
  online: "Online",
  offline: "Offline",
  degraded: "Degraded",
  warning: "Warning",
};

/**
 * Hand-rolled status pill with a glowing status dot. Colors come from the
 * `colors.status` token group via primitives.css.
 */
export function StatusPill({
  status,
  label,
  size = "md",
  className,
  ...rest
}: StatusPillProps): JSX.Element {
  const classes = [
    "ss-status-pill",
    kindClass[status],
    sizeClass[size],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} role="status" {...rest}>
      <span className="ss-status-pill__dot" aria-hidden="true" />
      {label ?? defaultLabel[status]}
    </span>
  );
}
