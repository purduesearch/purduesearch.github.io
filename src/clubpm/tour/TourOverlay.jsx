import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTour } from "./TourProvider";
import { useAnchorRect } from "./useAnchorRect";

const PAD = 8;      // breathing room around the spotlit element
const RADIUS = 10;  // matches the product's card radius

/** A rounded-rect subpath, reversed so evenodd cuts a hole in the outer rect. */
function holePath(r) {
  const x = r.left - PAD, y = r.top - PAD;
  const w = r.width + PAD * 2, h = r.height + PAD * 2;
  const rad = Math.min(RADIUS, w / 2, h / 2);
  return `M${x + rad},${y} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${y + rad} ` +
         `V${y + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${y + h} ` +
         `H${x + rad} A${rad},${rad} 0 0 1 ${x},${y + h - rad} ` +
         `V${y + rad} A${rad},${rad} 0 0 1 ${x + rad},${y} Z`;
}

function cardPosition(rect, placement) {
  if (!rect || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  const GAP = 16;
  switch (placement) {
    case "right":  return { top: rect.top, left: rect.left + rect.width + GAP };
    case "left":   return { top: rect.top, left: Math.max(GAP, rect.left - 340 - GAP) };
    case "top":    return { top: Math.max(GAP, rect.top - GAP), left: rect.left, transform: "translateY(-100%)" };
    default:       return { top: rect.top + rect.height + GAP, left: rect.left };
  }
}

export default function TourOverlay() {
  const { tour, step, stepIndex, stepCount, status, next, skipStep, pause, resume, stop, reportBreakage } = useTour();
  const active = Boolean(tour) && status === "running";
  const { rect, state } = useAnchorRect(active ? step?.anchor : null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const degraded = state === "missing";

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { if (degraded && step) reportBreakage(step.anchor); }, [degraded, step, reportBreakage]);

  // Esc pauses rather than quits — quitting mid-tour loses the learner's place.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === "Escape") pause(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, pause]);

  if (!tour) return null;

  if (status === "paused") {
    return createPortal(
      <div className="pm-tour-pill" role="status">
        <i className="fas fa-graduation-cap" aria-hidden="true" />
        <span>Tour paused — step {stepIndex + 1} of {stepCount}</span>
        <button type="button" className="clubpm-btn-primary" onClick={resume}>Resume</button>
        <button type="button" className="clubpm-btn-secondary" onClick={stop}>Exit</button>
      </div>,
      document.body
    );
  }

  if (!active) return null;

  const outer = `M0,0 H${vp.w} V${vp.h} H0 Z`;
  const holes = rect && !degraded ? holePath(rect) : "";

  return createPortal(
    <div className="pm-tour-root">
      <svg className="pm-tour-scrim" width={vp.w} height={vp.h} aria-hidden="true">
        <path
          d={`${outer} ${holes}`}
          fillRule="evenodd"
          className="pm-tour-scrim-path"
          // The hole is a genuine absence of geometry, so clicks over the target
          // land on the real app element beneath. No click-forwarding needed.
        />
      </svg>

      {rect && !degraded && <div className="pm-tour-ring" style={{
        top: rect.top - PAD, left: rect.left - PAD,
        width: rect.width + PAD * 2, height: rect.height + PAD * 2,
      }} />}

      <div
        className={`pm-tour-card${degraded ? " is-degraded" : ""}`}
        style={cardPosition(rect, step.placement)}
        role="dialog"
        aria-live="polite"
        aria-label={step.title}
      >
        <div className="pm-tour-card-meta">
          <span className="cpm-tag">Step {stepIndex + 1} of {stepCount}</span>
          <button type="button" className="pm-tour-card-pause" onClick={pause} title="Pause tour">
            <i className="fas fa-pause" aria-hidden="true" />
          </button>
        </div>

        <h3>{step.title}</h3>
        <p>{step.body}</p>

        {degraded && (
          <p className="pm-tour-card-degraded">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
            We couldn&apos;t find this on your screen. That&apos;s our bug, not yours — it&apos;s
            been reported.
          </p>
        )}

        <div className="pm-tour-card-actions">
          {step.advance?.on === "next" && !degraded && (
            <button type="button" className="clubpm-btn-primary" onClick={next}>
              Next <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
          )}
          {step.advance?.on !== "next" && !degraded && (
            <span className="pm-tour-card-waiting">
              <i className="fas fa-circle-notch fa-spin" aria-hidden="true" />{" "}
              {step.advance?.on === "click" ? "Click the highlighted item" : "Waiting for you…"}
            </span>
          )}
          {(degraded || step.optional) && (
            <button type="button" className="clubpm-btn-secondary" onClick={skipStep}>
              Skip this step
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
