/**
 * AresHeadProfile — the head schematic the three pod markers are pinned to.
 *
 * Profile, not front-on, and drawn to the same landmarks as the silhouette in
 * PlumeSimulator so the two figures read as the same body seen twice. That
 * matters more than it sounds: the page's argument is about *where on a head*
 * a sensor sits relative to a rising column of air, and a front-on outline
 * cannot show "above the crown", "at the brow" and "below the jaw" as three
 * distinct places in a flow. A profile can.
 *
 * The plume overlay is not decoration either. "Put the top pod in the plume"
 * is the single most important interaction on /ares, and before this the only
 * thing it changed was numbers in a chart further down the page — the head
 * diagram, which is where the claim is actually about, did not react at all.
 * Now the column appears over the crown and visibly runs through the top pod.
 */

/**
 * Pod hardware positions in viewBox units. Anatomy, not layout — each one is
 * on the landmark breathModel.js's POD_POSITIONS names in prose: above the
 * crown, at the brow, below the jaw in the breathing zone. The marker chips
 * in public/ares-theme.css are positioned as percentages of the same box and
 * have to move with these.
 */
export const POD_ANCHORS = {
  top: { x: 80, y: 51 },
  forehead: { x: 111, y: 91 },
  chin: { x: 112, y: 185 },
};

/*
 * The figure itself, exported so PlumeAnatomy draws the same person rather
 * than a second, subtly different one. Both are diagrams of one head and a
 * reader will compare them; two near-identical profiles that disagree about
 * where the chin is would be worse than either alone. Coordinates are in the
 * 200x270 viewBox below.
 */

/** Head and neck as one continuous outline, crown -> face -> throat -> nape. */
export const HEAD_PATH = `M78.3,61
  C97.8,61 112.3,72.1 114.8,89.9
  C116.5,98.4 116.5,105.2 115.7,109.5
  C112.3,113.7 108.9,116.3 109.7,120.5
  C114.8,124.8 125.9,130.7 126.7,136.7
  C126.7,140.9 120.8,141.8 114,142.6
  C113.1,146 113.1,147.7 112.3,149.4
  C116.5,151.1 117.4,152.8 113.1,154.5
  C117.4,157 116.5,160.5 112.3,162.2
  C109.7,164.7 110.6,168.1 112.3,171.5
  C108.9,177.5 103.8,180.9 98.7,183.4
  C101.2,202.1 103.8,220.8 104.6,239.5
  L57,239.5
  C58.7,219.1 61.3,197 62.9,176.6
  C56.2,167.3 50.2,154.5 46,140.9
  C40,123.9 40,98.4 51.9,83.1
  C59.6,69.5 68.1,61 78.3,61 Z`;

/** Shoulders and upper chest, drawn over the base of the neck. */
export const SHOULDERS_PATH = `M4,266.7
  C14.5,246.3 31.5,231 60.4,225.9
  C91,220.8 123.3,225.9 142,236.9
  C158,246 168,254 190,266.7 Z`;

/** Ear and brow — the two marks that turn an outline into a face. */
export const BROW_PATH = 'M95.3,112 Q104.6,108.6 111.4,112';
export const EAR = { cx: 70.6, cy: 134.9, rx: 6, ry: 8.5, rotate: -11 };

export default function AresHeadProfile({ contaminatedTop = false, selectedPod = 'top' }) {
  return (
    <svg
      className="ares-pod-head-svg"
      viewBox="0 0 200 270"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ares-head-plume" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--ares-trace-fore)" stopOpacity="0.42" />
          <stop offset="60%" stopColor="var(--ares-trace-fore)" stopOpacity="0.20" />
          <stop offset="100%" stopColor="var(--ares-trace-fore)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Shoulders, then head over them — same draw order as the canvas
          silhouette, so the base of the neck is covered rather than outlined. */}
      <path className="ares-pod-head-outline" d={SHOULDERS_PATH} />
      <path className="ares-pod-head-outline" d={HEAD_PATH} />

      <ellipse
        className="ares-pod-head-feature"
        cx={EAR.cx} cy={EAR.cy} rx={EAR.rx} ry={EAR.ry}
        transform={`rotate(${EAR.rotate} ${EAR.cx} ${EAR.cy})`}
      />
      <path className="ares-pod-head-feature" d={BROW_PATH} />

      {/* The plume, only while the contaminated-reference toggle is on. It
          rises off the crown and passes straight through the top pod, which is
          the entire finding this component was cleared to publish. */}
      {contaminatedTop && (
        <g className="ares-pod-head-plume">
          {/* The bottom edge curves under to sit on the crown rather than
              cutting straight across it, and the gradient takes the top to
              zero opacity, so the column has no hard edge anywhere. */}
          <path
            className="ares-pod-head-plume-body"
            d="M62,70 C55,44 60,20 66,0 L102,0 C108,20 110,44 101,70
               C88,77 75,77 62,70 Z"
            fill="url(#ares-head-plume)"
          />
          <path className="ares-pod-head-plume-line" d="M74,66 C69,48 75,26 71,4" />
          <path className="ares-pod-head-plume-line" d="M85,68 C90,46 83,24 88,2" />
          <path className="ares-pod-head-plume-line" d="M96,64 C100,46 94,28 98,8" />
        </g>
      )}

      {/* Pod hardware, drawn where each unit physically sits. */}
      {Object.entries(POD_ANCHORS).map(([id, { x, y }]) => (
        <rect
          key={id}
          className={`ares-pod-head-unit ares-pod-head-unit--${id}${
            selectedPod === id ? ' is-selected' : ''
          }`}
          x={x - 7} y={y - 4.5} width="14" height="9" rx="2.5"
        />
      ))}
    </svg>
  );
}
