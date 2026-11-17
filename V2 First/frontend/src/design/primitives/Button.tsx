import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "filled"
  | "tonal"
  | "outlined"
  | "text"
  | "destructive";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. `destructive` is a filled action using the danger color. */
  variant?: ButtonVariant;
  /** Height/padding preset. */
  size?: ButtonSize;
  /** Shows a spinner and disables the button while true. */
  loading?: boolean;
  /** Optional leading icon/content slot, hidden while `loading`. */
  icon?: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  filled: "ss-btn--filled",
  tonal: "ss-btn--tonal",
  outlined: "ss-btn--outlined",
  text: "ss-btn--text",
  destructive: "ss-btn--destructive",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "ss-btn--sm",
  md: "ss-btn--md",
  lg: "ss-btn--lg",
};

/**
 * Hand-rolled Material 3-inspired button. No UI-kit dependencies; all styling
 * comes from the design tokens via primitives.css.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "filled",
      size = "md",
      loading = false,
      icon,
      disabled,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    const classes = [
      "ss-btn",
      variantClass[variant],
      sizeClass[size],
      loading ? "is-loading" : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled === true || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? (
          <span className="ss-btn__spinner" aria-hidden="true" />
        ) : icon != null ? (
          <span className="ss-btn__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children}
      </button>
    );
  },
);
