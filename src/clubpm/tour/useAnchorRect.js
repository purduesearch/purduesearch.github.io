import { useEffect, useState } from "react";
import { findAnchor, isRectComfortablyVisible } from "./anchorDom";

/**
 * Resolve a data-tour-id to a live viewport rect.
 *
 * Returns state "missing" after timeoutMs so the overlay can degrade the step
 * rather than hanging on a renamed element. A learner must never be trapped by
 * a stale selector — that rule outranks step ordering.
 *
 * States: "idle" (no anchor asked for), "resolving", "found", "missing".
 * "idle" is distinct from "missing" on purpose: a paused tour asks for no
 * anchor, and treating that as a breakage would file a false bug report on
 * every pause and drown the real ones in the authoring panel.
 */
export function useAnchorRect(anchorId, { timeoutMs = 8000 } = {}) {
  const [rect, setRect] = useState(null);
  const [state, setState] = useState("idle");

  useEffect(() => {
    if (!anchorId) { setRect(null); setState("idle"); return undefined; }
    setState("resolving");
    setRect(null);

    let el = null;
    let ro = null;
    let raf = 0;
    let poll = 0;
    let giveUpTimer = 0;
    let cancelled = false;
    let everMeasured = false;
    let lastKey = "";

    const measure = () => {
      if (cancelled || !el) return;
      // The element can be swapped out from under us by a re-render (React
      // replaces rather than mutates in plenty of cases). Re-query when the node
      // has left the document, or the ring freezes on a detached rect.
      if (!el.isConnected) {
        const replacement = findAnchor(anchorId);
        if (!replacement) return;
        el = replacement;
        ro?.disconnect();
        ro = new ResizeObserver(measure);
        ro.observe(el);
      }
      const r = el.getBoundingClientRect();
      // Zero-size means it is present but not laid out yet (lazy chunk, collapsed
      // parent). Keep waiting rather than spotlighting a 0x0 box.
      if (r.width === 0 && r.height === 0) return;
      const key = `${r.top}|${r.left}|${r.width}|${r.height}`;
      if (key === lastKey) return;   // don't re-render on an unchanged rect
      lastKey = key;
      everMeasured = true;
      setRect({
        top: r.top, left: r.left, width: r.width, height: r.height,
        bottom: r.bottom, right: r.right,
      });
      setState("found");
    };

    const attach = () => {
      if (cancelled) return;
      el = findAnchor(anchorId);
      if (!el) { raf = requestAnimationFrame(attach); return; }
      // Only scroll when the element is not already comfortably on screen. An
      // unconditional scrollIntoView on an anchor the learner is already looking
      // at reads as the page jumping for no reason.
      if (!isRectComfortablyVisible(el.getBoundingClientRect())) {
        el.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      }
      ro = new ResizeObserver(measure);
      ro.observe(el);
      measure();
      // Smooth scrolling and layout animations move the element without firing
      // resize, and scroll events stop at the nearest scrollable ancestor we may
      // not be listening on. A cheap rAF-throttled poll is what keeps the ring
      // glued to the target through both.
      poll = window.setInterval(measure, 120);
    };

    attach();
    giveUpTimer = window.setTimeout(() => {
      // Also fires when the element exists but never laid out — a step whose
      // anchor is permanently 0x0 is just as broken as one that is absent, and
      // without this the learner sits on a spinner with no Skip button.
      if (!cancelled && !everMeasured) setState("missing");
    }, timeoutMs);

    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearInterval(poll);
      clearTimeout(giveUpTimer);
      ro?.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchorId, timeoutMs]);

  return { rect, state };
}
