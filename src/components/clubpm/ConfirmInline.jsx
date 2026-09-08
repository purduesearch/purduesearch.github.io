import React, { useState } from 'react';

/**
 * Two-step destructive action. Renders as a normal button; the first click
 * swaps it in place for "<prompt> [Cancel] [Confirm]". Replaces window.confirm,
 * which can't be styled and reads as a browser error to users.
 */
export default function ConfirmInline({
  label,
  prompt = 'Are you sure?',
  confirmLabel = 'Delete',
  icon = 'fas fa-trash',
  onConfirm,
  className = 'cpm-btn cpm-btn-ghost pm-confirm-trigger',
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy]   = useState(false);

  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {icon && <i className={icon} style={{ marginRight: 6 }} />}
        {label}
      </button>
    );
  }

  return (
    <span className="pm-confirm-inline">
      <span className="pm-confirm-prompt">{prompt}</span>
      <button
        type="button"
        className="cpm-btn cpm-btn-ghost"
        disabled={busy}
        onClick={() => setArmed(false)}
      >
        Cancel
      </button>
      <button
        type="button"
        className="cpm-btn cpm-btn-danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try { await onConfirm(); }
          finally { setBusy(false); setArmed(false); }
        }}
      >
        {busy ? <i className="fas fa-spinner fa-spin" /> : confirmLabel}
      </button>
    </span>
  );
}
