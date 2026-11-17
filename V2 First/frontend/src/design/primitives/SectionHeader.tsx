import type { ReactNode } from "react";

export interface SectionHeaderProps {
  /** Section title. */
  title: string;
  /** Optional muted one-liner under the title. */
  subtitle?: string;
  /** Optional right-aligned action slot (e.g. a Button). */
  action?: ReactNode;
  className?: string;
}

/**
 * Hand-rolled section header: title + optional subtitle + optional action.
 */
export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: SectionHeaderProps): JSX.Element {
  const classes = ["ss-section-header", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="ss-section-header__text">
        <h2 className="ss-section-header__title">{title}</h2>
        {subtitle != null ? (
          <p className="ss-section-header__subtitle">{subtitle}</p>
        ) : null}
      </div>
      {action != null ? (
        <div className="ss-section-header__action">{action}</div>
      ) : null}
    </div>
  );
}
