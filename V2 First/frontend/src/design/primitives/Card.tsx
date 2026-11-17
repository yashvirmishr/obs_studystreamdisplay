import type { HTMLAttributes, ReactNode } from "react";

/** Surface tone. `base` is the default card surface; `tonal` and `elevated`
 * lift the card progressively out of the background. */
export type CardTone = "base" | "tonal" | "elevated";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Content rendered in the padded body area. */
  children: ReactNode;
  /** Optional slot pinned to the top of the card (unpadded bottom). */
  header?: ReactNode;
  /** Optional slot separated from the body by a hairline divider. */
  footer?: ReactNode;
  /** Surface tone, defaults to `base`. */
  tone?: CardTone;
}

const toneClass: Record<CardTone, string> = {
  base: "ss-card--base",
  tonal: "ss-card--tonal",
  elevated: "ss-card--elevated",
};

/**
 * Hand-rolled card primitive with token-driven tonal surfaces.
 */
export function Card({
  children,
  header,
  footer,
  tone = "base",
  className,
  ...rest
}: CardProps): JSX.Element {
  const classes = ["ss-card", toneClass[tone], className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {header != null ? <div className="ss-card__header">{header}</div> : null}
      <div className="ss-card__body">{children}</div>
      {footer != null ? <div className="ss-card__footer">{footer}</div> : null}
    </div>
  );
}
