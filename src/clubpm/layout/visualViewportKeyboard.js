import { useEffect, useState } from 'react';

const KEYBOARD_DELTA = 150;

function isEditable(node) {
  if (!node || node.nodeType !== 1) return false;
  return node.matches('input:not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]');
}

/**
 * Detects a software keyboard only when an editable control is focused and the
 * visual viewport actually loses substantial height. Hardware keyboards leave
 * the global navigation and shortcuts unchanged.
 */
export function useVisualViewportKeyboard(enabled) {
  const [state, setState] = useState({ open: false, height: null, top: 0 });

  useEffect(() => {
    if (!enabled || !window.visualViewport) {
      setState({ open: false, height: null, top: 0 });
      return undefined;
    }

    const viewport = window.visualViewport;
    let baseline = Math.max(window.innerHeight, viewport.height + viewport.offsetTop);
    let baselineWidth = window.innerWidth;
    const measure = () => {
      const focused = isEditable(document.activeElement);
      const current = viewport.height + viewport.offsetTop;
      // Rotation/breakpoint resizing is not a software keyboard. Establish a
      // new layout baseline when width changes, including with hardware focus.
      if (window.innerWidth !== baselineWidth) {
        baselineWidth = window.innerWidth;
        baseline = Math.max(window.innerHeight, current);
      }
      if (!focused) baseline = Math.max(baseline, window.innerHeight, current);
      const open = focused && baseline - current > KEYBOARD_DELTA;
      document.documentElement.style.setProperty('--pm-m-visual-height', `${Math.round(viewport.height)}px`);
      document.documentElement.style.setProperty('--pm-m-visual-top', `${Math.round(viewport.offsetTop)}px`);
      setState({
        open,
        height: open ? Math.round(viewport.height) : null,
        top: open ? Math.round(viewport.offsetTop) : 0,
      });
    };

    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    window.addEventListener('focusin', measure);
    window.addEventListener('focusout', measure);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
      window.removeEventListener('focusin', measure);
      window.removeEventListener('focusout', measure);
      window.removeEventListener('resize', measure);
      document.documentElement.style.removeProperty('--pm-m-visual-height');
      document.documentElement.style.removeProperty('--pm-m-visual-top');
    };
  }, [enabled]);

  return state;
}

export { isEditable, KEYBOARD_DELTA };
