import { useEffect, useState } from "react";

/**
 * Resolve a data-tour-id to a live viewport rect.
 *
 * Returns state "missing" after timeoutMs so the overlay can degrade the step
 * rather than hanging on a renamed element. A learner must never be trapped by
 * a stale selector — that rule outranks step ordering.
 */
export function useAnchorRect(anchorId, { timeoutMs = 8000 } = {}) {
  const [rect, setRect] = useState(null);
  const [state, setState] = useState("resolving");

  useEffect(() => {
    if (!anchorId) { setRect(null); setState("missing"); return undefined; }
    setState("resolving");
    setRect(null);

    let el = null;
    let ro = null;
    let raf = 0;
    let giveUpTimer = 0;
    let cancelled = false;

    const measure = () => {
      if (cancelled || !el) return;
      const r = el.getBoundingClientRect();
      // Zero-size means it is present but not laid out yet (lazy chunk, collapsed
      // parent). Keep waiting rather than spotlighting a 0x0 box.
      if (r.width === 0 && r.height === 0) return;
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setState("found");
    };

    const attach = () => {
      if (cancelled) return;
      el = document.querySelector(`[data-tour-id="${anchorId}"]`);
      if (!el) { raf = requestAnimationFrame(attach); return; }
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      ro = new ResizeObserver(measure);
      ro.observe(el);
      measure();
      raf = requestAnimationFrame(measure); // once more after the smooth scroll starts
    };

    attach();
    giveUpTimer = setTimeout(() => {
      if (!cancelled && !el) setState("missing");
    }, timeoutMs);

    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(giveUpTimer);
      ro?.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchorId, timeoutMs]);

  return { rect, state };
}
