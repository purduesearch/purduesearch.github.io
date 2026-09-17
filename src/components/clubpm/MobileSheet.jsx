import React, { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { COMPACT_CLASS } from '../../clubpm/layout/compactLayout';

/**
 * Shared phone overlay primitive: a bottom sheet (short choices) or a
 * full-screen dialog (search, long forms, detail).
 *
 * Contract: contracts.md §4.
 * - Portalled to <body> (a transformed ancestor would re-parent `position:
 *   fixed`), outside `.clubpm-app` so its padding and !important colour rules
 *   do not apply; the layer restates font and colour itself.
 * - One stack for every layer. Only the top layer is interactive: the app root
 *   (#root) and every lower layer get `inert`; the tour overlay, which portals
 *   to <body> separately, stays usable above it.
 * - Tab is trapped in the top layer, Escape closes the top layer only.
 * - Focus goes to `[data-autofocus]`, else the heading — never a search field
 *   unless the caller opts in, because on a phone that raises the keyboard
 *   over the list.
 * - On close, focus returns to the opener, looked up by `returnFocusSelector`
 *   first because the shell re-renders (and may remount) the node that opened it.
 *
 * History is the caller's job (useShellOverlay): `onClose` must be the only way
 * this component asks to close.
 */

const stack = [];

function appRoot() {
  return document.getElementById('root');
}

function syncInert() {
  const root = appRoot();
  if (root) {
    if (stack.length) root.setAttribute('inert', '');
    else root.removeAttribute('inert');
  }
  stack.forEach((layer, i) => {
    if (!layer.el) return;
    if (i === stack.length - 1) layer.el.removeAttribute('inert');
    else layer.el.setAttribute('inert', '');
  });
  document.body.classList.toggle('pm-m-scroll-lock', stack.length > 0);
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function MobileSheet({
  title,
  onClose,
  children,
  variant = 'sheet',
  footer = null,
  headerExtra = null,
  returnFocusSelector,
  className = '',
}) {
  const layerRef = useRef(null);
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const openerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Register synchronously so a layer opened in the same commit as another
  // (tour reveal + palette, say) stacks in mount order.
  useLayoutEffect(() => {
    openerRef.current = document.activeElement;
    const layer = { el: layerRef.current };
    stack.push(layer);
    syncInert();

    const panel = panelRef.current;
    const target = panel?.querySelector('[data-autofocus]') ?? headingRef.current;
    target?.focus({ preventScroll: true });

    return () => {
      const i = stack.indexOf(layer);
      if (i !== -1) stack.splice(i, 1);
      syncInert();
      const byKey = returnFocusSelector ? document.querySelector(returnFocusSelector) : null;
      const opener = byKey ?? (openerRef.current?.isConnected ? openerRef.current : null);
      // Deferred: the inert attribute has to be gone before focus can land.
      window.setTimeout(() => opener?.focus?.({ preventScroll: true }), 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e) => {
    if (stack[stack.length - 1]?.el !== layerRef.current) return;
    // React bubbles events from portals rendered by the sheet's children (the
    // task dialog's Move / Shift / Parent pickers) through this handler even
    // though they sit outside the layer in the DOM. Those dialogs own their keys.
    if (!layerRef.current?.contains(e.target)) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onCloseRef.current?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])
      .filter((n) => !n.closest('[inert]'));
    if (!nodes.length) { e.preventDefault(); headingRef.current?.focus(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === headingRef.current || !panelRef.current.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
      e.preventDefault(); first.focus();
    }
  };

  const fullscreen = variant === 'fullscreen';

  return createPortal(
    <div
      ref={layerRef}
      className={`pm-m-layer ${COMPACT_CLASS}${fullscreen ? ' pm-m-layer--fullscreen' : ''} ${className}`.trim()}
      onKeyDown={onKeyDown}
    >
      {!fullscreen && (
        <div className="pm-m-scrim" aria-hidden="true" onClick={() => onCloseRef.current?.()} />
      )}
      <div
        ref={panelRef}
        className={fullscreen ? 'pm-m-dialog' : 'pm-m-sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {!fullscreen && <div className="pm-m-sheet-grip" aria-hidden="true" />}
        <div className="pm-m-sheet-head">
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h2>
          {headerExtra}
          <button
            type="button"
            className="pm-m-icon-btn"
            aria-label={`Close ${title}`}
            onClick={() => onCloseRef.current?.()}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="pm-m-sheet-body">{children}</div>
        {footer ? <div className="pm-m-sheet-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/** Test seam. */
export function __overlayStackDepth() {
  return stack.length;
}
