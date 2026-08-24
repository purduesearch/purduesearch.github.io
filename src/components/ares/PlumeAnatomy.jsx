import { HEAD_PATH, BROW_PATH, EAR } from './AresHeadProfile';

/**
 * PlumeAnatomy — the breathing envelope, labelled.
 *
 * C13 describes the 1 g case as a specific four-step path, not a general
 * upward drift: air gathered off the whole body converges under the jaw,
 * sweeps up across the mouth, delivers unbreathed air to the nostrils, and
 * leaves up and outward at roughly 45 degrees without coming back. That is a
 * sequence — a parcel of air goes through those stages in that order — which
 * is the only reason the callouts here are numbered.
 *
 * Drawn from the same HEAD_PATH as AresHeadProfile so both figures on the site
 * are the same person.
 *
 * This is an explanatory diagram of a described structure, not a plot of data.
 */

const EXIT_ANGLE_DEG = 45;

/*
 * Pin coordinates are in the OUTER 400x400 viewBox, but every landmark they
 * refer to lives in the head's own 200x270 space and reaches the outer frame
 * through `translate(30, 22) scale(0.92)` below. Converting by eye is how the
 * first pass ended up with "converges under the jaw" pinned to a shoulder.
 * The mapping is f(x, y) = (30 + 0.92x, 22 + 0.92y), which puts the chin at
 * (133, 180), the nose tip at (147, 148) and the front of the chest at
 * (205, 267). Move the transform and these all move with it.
 */
const STEPS = [
  {
    n: 1,
    at: { x: 180, y: 240 },
    title: 'Air converges under the jaw',
    body: 'Everything the body has warmed on its way up — legs, torso, arms — arrives here first. The band is at its narrowest and fastest at the throat.',
  },
  {
    n: 2,
    at: { x: 178, y: 178 },
    title: 'It sweeps up across the mouth',
    body: 'The same current passes the mouth on its way past the face, which is what carries the last exhale away before the next inhale starts.',
  },
  {
    n: 3,
    at: { x: 206, y: 132 },
    title: 'Unbreathed air reaches the nostrils',
    body: 'What arrives at the nose is room air the body has warmed, not air that has already been through anyone. This is the part microgravity removes.',
  },
  {
    n: 4,
    at: { x: 284, y: 80 },
    title: `It leaves at about ${EXIT_ANGLE_DEG}°, and does not return`,
    body: 'The flow exits up and outward on a path that never brings it back to the face. Nobody designed this. It is body heat and gravity, and it has never once failed.',
  },
];

export default function PlumeAnatomy() {
  return (
    <figure className="ares-anatomy">
      <div className="ares-anatomy-figure">
        <svg viewBox="0 0 400 400" role="img" aria-labelledby="ares-anatomy-title">
          <title id="ares-anatomy-title">
            A person in profile with the buoyant airflow around them drawn as a
            band: it runs up the front of the body, narrows under the jaw,
            sweeps across the mouth and nose, and exits above the head at about
            45 degrees.
          </title>
          <defs>
            <linearGradient id="ares-anatomy-band" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--ares-trace-fore)" stopOpacity="0.10" />
              <stop offset="45%" stopColor="var(--ares-trace-fore)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--ares-trace-fore)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* The person, at the same scale and proportions as the pod
              schematic. translate/scale only — the paths are shared. */}
          <g transform="translate(30, 22) scale(0.92)" className="ares-anatomy-body">
            {/* Shoulders continued into a torso that runs off the bottom of
                the frame. Without it the body stopped two-thirds of the way up
                and the band appeared to arrive from nowhere; with straight
                sides and a drawn bottom edge it read as a plinth, so the sides
                taper toward the waist and every cut edge is placed outside the
                viewBox to be clipped rather than stroked. Supersedes
                SHOULDERS_PATH here — the shoulder curve is the first three
                segments of this path. */}
            <path
              d="M4,266.7 C14.5,246.3 31.5,231 60.4,225.9
                 C91,220.8 123.3,225.9 142,236.9
                 C158,246 168,254 190,266.7
                 C186,320 180,380 176,440
                 L18,440
                 C22,380 14,320 4,266.7 Z"
            />
            <path d={HEAD_PATH} />
            <ellipse
              className="ares-anatomy-feature"
              cx={EAR.cx} cy={EAR.cy} rx={EAR.rx} ry={EAR.ry}
              transform={`rotate(${EAR.rotate} ${EAR.cx} ${EAR.cy})`}
            />
            <path className="ares-anatomy-feature" d={BROW_PATH} />
          </g>

          {/* The envelope: wide against the chest, pinched at the throat where
              flow from the whole body converges, flaring away above the head.
              The inner edge tracks the front of the body — chest at x 205,
              throat at 166, chin at 133 — see the note on STEPS. */}
          <path
            className="ares-anatomy-band"
            d="M195,400
               C192,336 184,268 166,220
               C154,198 152,178 164,160
               C196,124 244,84 288,44
               L326,82
               C282,122 236,162 212,188
               C196,206 202,230 214,260
               C240,318 262,360 285,400 Z"
          />

          {/* Centreline, dashed and marching, so the band reads as a direction
              rather than a shape. */}
          <path
            className="ares-anatomy-flow"
            d="M240,400 C234,336 216,270 190,214
               C178,196 178,178 190,162
               C220,128 268,86 308,50"
          />

          {/* Exit arrowhead, on the 45-degree line the caption names. */}
          <path className="ares-anatomy-arrow" d="M316,42 l-17,3 l10,13 Z" />

          {STEPS.map((step) => (
            <g key={step.n} className="ares-anatomy-pin">
              <circle cx={step.at.x} cy={step.at.y} r="12" />
              <text x={step.at.x} y={step.at.y} dy="0.35em" textAnchor="middle">
                {step.n}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <ol className="ares-anatomy-steps">
        {STEPS.map((step) => (
          <li key={step.n}>
            <span className="ares-anatomy-step-n" aria-hidden="true">{step.n}</span>
            <div>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <figcaption>
        The structure C13 describes, drawn to scale against a head. Illustrative
        diagram of a described flow, not a measurement or a CFD result.
      </figcaption>
    </figure>
  );
}
