import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTour } from "./TourProvider";
import { useAnchorRect } from "./useAnchorRect";
import { findAnchor } from "./anchorDom";
import {
  CARD_W, EDGE, PAD, computeCardPosition, holePath, scrimBlocksClicks,
} from "./tourGeometry";

const MOBILE_W = 640;    // below this the card docks to the bottom of the screen
const STUCK_MS = 25_000; // how long a hands-on step waits before offering Skip

export default function TourOverlay() {
  const {
    tour, step, stepIndex, stepCount, status,
    next, back, skipStep, pause, resume, stop, reportBreakage,
  } = useTour();

  const active = Boolean(tour) && status === "running";
  const { rect, state } = useAnchorRect(active ? step?.anchor : null);
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [card, setCard] = useState({ width: CARD_W, height: 0 });
  const [nudge, setNudge] = useState(0);

  const cardRef = useRef(null);
  const headingRef = useRef(null);

  // Only a step we are actually trying to show can be broken. Without the
  // `active` guard, pausing (which stops asking for an anchor) would read as a
  // missing anchor and file a false breakage on every pause.
  const degraded = active && state === "missing";
  const resolving = active && state === "resolving";

  const mobile = vp.w <= MOBILE_W;

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The card's height drives where it can sit, and its height changes with its
  // own content (a degraded notice, a Skip button appearing). Observing it is
  // less brittle than trying to list every state that could resize it.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const read = () => {
      const r = el.getBoundingClientRect();
      setCard((prev) =>
        Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1
          ? prev
          : { width: r.width, height: r.height });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, step]);

  useEffect(() => {
    if (degraded && step) reportBreakage(step.anchor);
  }, [degraded, step, reportBreakage]);

  /**
   * Pin the sidebar open while a step spotlights something inside it.
   *
   * The rail is 64px wide until it is hovered and 220px after, and the scrim's
   * hole — cut from the anchor's own rect — is the only place a pointer can
   * reach it through. So the width the hole is measured from is the width the
   * hover changes: approach the target and the rail expands, the hole moves,
   * the pointer falls outside it, the rail collapses, and the whole thing runs
   * again. Taking the width out of that loop is the fix; that the learner can
   * now read the label they are being told to click is the point.
   */
  useEffect(() => {
    if (!active || !step?.anchor) return undefined;
    const rail = findAnchor(step.anchor)?.closest(".pm-sidebar");
    if (!rail) return undefined;
    rail.classList.add("is-tour-pinned");
    return () => rail.classList.remove("is-tour-pinned");
  }, [active, step, state]);

  // Move focus to the card on every step so a screen reader announces the new
  // instruction and the keyboard shortcuts below have somewhere to land.
  useEffect(() => {
    if (!active || !step) return;
    const id = window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(id);
  }, [active, step]);

  const canPressNext = step?.advance?.on === "next" || degraded;

  /**
   * A "click" or "api" step has no Next button by design — the point is that the
   * learner does the thing. But a learner who genuinely cannot (a permission
   * they lack, a modal that will not open) must not be walled in, so the escape
   * hatch appears after a wait long enough that nobody reaches it by
   * impatience. An always-visible Skip would quietly turn hands-on training
   * back into a slideshow.
   */
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    setStuck(false);
    if (!active || canPressNext) return undefined;
    const id = window.setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(id);
  }, [active, canPressNext, step]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); pause(); return; }
      // Never steal keys from a field the learner is filling in — several steps
      // ask them to type into the real app.
      const t = e.target;
      const typing = t?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName);
      if (typing) return;
      if ((e.key === "ArrowRight" || e.key === "Enter") && canPressNext) {
        e.preventDefault(); next();
      } else if (e.key === "ArrowLeft" && stepIndex > 0) {
        e.preventDefault(); back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, pause, next, back, canPressNext, stepIndex]);

  /** A click on the dimmed area is swallowed on purpose, but swallowing it
   *  silently reads as a frozen app. Pulse the ring so the answer to "why did
   *  nothing happen" is on screen. */
  const onScrimClick = useCallback(() => setNudge((n) => n + 1), []);

  useEffect(() => {
    if (!nudge) return undefined;
    const id = window.setTimeout(() => setNudge(0), 600);
    return () => clearTimeout(id);
  }, [nudge]);

  if (!tour) return null;

  if (status === "paused") {
    return createPortal(
      <div className="pm-tour-pill" role="status">
        <i className="fas fa-graduation-cap" aria-hidden="true" />
        <span className="pm-tour-pill-label">
          Tour paused — step {stepIndex + 1} of {stepCount}
        </span>
        <button type="button" className="clubpm-btn-primary" onClick={resume}>Resume</button>
        <button type="button" className="clubpm-btn-secondary" onClick={stop}>Exit</button>
      </div>,
      document.body
    );
  }

  if (!active || !step) return null;

  const spotlight = rect && !degraded ? rect : null;
  const outer = `M0,0 H${vp.w} V${vp.h} H0 Z`;
  const holes = spotlight ? holePath(spotlight) : "";
  const blocking = scrimBlocksClicks(step);

  const pos = mobile
    ? { top: null, left: EDGE, placed: "docked" }
    : computeCardPosition({ rect: spotlight, placement: step.placement, card, vp });

  const cardStyle = mobile
    ? undefined
    : { top: pos.top, left: pos.left, width: CARD_W };

  const pct = stepCount > 1 ? (stepIndex / (stepCount - 1)) * 100 : 100;

  return createPortal(
    <div className="pm-tour-root">
      <svg className="pm-tour-scrim" width={vp.w} height={vp.h} aria-hidden="true">
        <path
          d={`${outer} ${holes}`}
          fillRule="evenodd"
          className={`pm-tour-scrim-path${blocking ? "" : " is-passthrough"}`}
          onClick={blocking ? onScrimClick : undefined}
          // The hole is a genuine absence of geometry, so clicks over the target
          // land on the real app element beneath. No click-forwarding needed.
          //
          // On a step that is not a plain anchor click, the rest of the path
          // stops absorbing too: the learner has real work to do in a form the
          // spotlight does not cover, and the request that ends the step cannot
          // fire from a click we ate.
        />
      </svg>

      {spotlight && (
        <>
          <div
            className="pm-tour-ring"
            style={{
              top: spotlight.top - PAD, left: spotlight.left - PAD,
              width: spotlight.width + PAD * 2, height: spotlight.height + PAD * 2,
            }}
          />
          {/* A separate element so replaying the pulse never remounts the ring —
              remounting it would restart the position transition mid-move. */}
          {nudge > 0 && (
            <div
              key={nudge}
              className="pm-tour-pulse"
              style={{
                top: spotlight.top - PAD, left: spotlight.left - PAD,
                width: spotlight.width + PAD * 2, height: spotlight.height + PAD * 2,
              }}
            />
          )}
        </>
      )}

      <div
        ref={cardRef}
        className={[
          "pm-tour-card",
          degraded ? "is-degraded" : "",
          mobile ? "is-docked" : "",
        ].filter(Boolean).join(" ")}
        style={cardStyle}
        role="dialog"
        aria-modal="false"
        aria-labelledby="pm-tour-card-title"
        aria-describedby="pm-tour-card-body"
      >
        <div className="pm-tour-card-progress" aria-hidden="true">
          <span className="pm-tour-card-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="pm-tour-card-meta">
          <span className="pm-tour-card-count">
            <i className="fas fa-graduation-cap" aria-hidden="true" />
            Step {stepIndex + 1} of {stepCount}
          </span>
          <button
            type="button"
            className="pm-tour-card-pause"
            onClick={pause}
            aria-label="Pause the walkthrough"
            title="Pause (Esc)"
          >
            <i className="fas fa-pause" aria-hidden="true" />
          </button>
        </div>

        <h3 id="pm-tour-card-title" tabIndex={-1} ref={headingRef}>{step.title}</h3>
        <p id="pm-tour-card-body">{step.body}</p>

        {degraded && (
          <p className="pm-tour-card-degraded">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
            We couldn&apos;t find this on your screen. That&apos;s our bug, not yours — it&apos;s
            been reported, and skipping still counts toward finishing.
          </p>
        )}

        {resolving && !rect && (
          <p className="pm-tour-card-waiting">
            <i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> Finding it on the page…
          </p>
        )}

        <div className="pm-tour-card-actions">
          {stepIndex > 0 && (
            <button
              type="button"
              className="pm-tour-card-back"
              onClick={back}
              title="Previous step (←)"
            >
              <i className="fas fa-arrow-left" aria-hidden="true" /> Back
            </button>
          )}

          {canPressNext && (
            <button type="button" className="clubpm-btn-primary" onClick={next}>
              {stepIndex === stepCount - 1 ? "Finish" : "Next"}{" "}
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
          )}

          {!canPressNext && !resolving && (
            <span className="pm-tour-card-waiting">
              <i className="fas fa-circle-notch fa-spin" aria-hidden="true" />{" "}
              {step.advance?.on === "click"
                ? "Click the highlighted item"
                : step.advance?.on === "api"
                  ? "Do it for real — this advances when it saves"
                  : "Waiting for you…"}
            </span>
          )}

          {(degraded || step.optional || stuck) && (
            <button type="button" className="pm-tour-card-skip" onClick={skipStep}>
              Skip this step
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
