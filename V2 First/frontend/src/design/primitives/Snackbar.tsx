import type { HTMLAttributes } from "react";
import { Icon } from "../../design/icons";

export interface SnackbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Message body. Keep it one line. */
  message: string;
  /** Optional trailing action label. */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}

/**
 * Material 3 snackbar: bottom-anchored, rounded, dark, optional action.
 * Renders only when mounted — the parent owns visibility state.
 */
export function Snackbar({
  message,
  actionLabel,
  onAction,
  onDismiss,
  ...rest
}: SnackbarProps) {
  return (
    <div className="snackbar" role="status" aria-live="polite" {...rest}>
      <span>{message}</span>
      {actionLabel && onAction && (
        <button className="link" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        className="icon-btn"
        style={{ width: 28, height: 28 }}
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
