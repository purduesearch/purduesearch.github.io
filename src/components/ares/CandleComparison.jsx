/**
 * CandleComparison — the same candle, twice.
 *
 * TheScience's Regimes section already makes this argument in prose: a flame on
 * Earth is a teardrop because hot gas rises and pulls cool air in underneath to
 * replace it, and the same flame in orbit is a small dim sphere because
 * diffusion is all that is left to bring oxygen in and carry exhaust out.
 * Nothing about the chemistry changes. It is the cleanest possible statement of
 * the page's whole thesis, using an object everyone has already seen.
 *
 * The signature detail here is the arrows, and it is worth being deliberate
 * about why. On the left they form a loop with a direction: in at the base, up
 * and out at the top. On the right they are the same length in every direction
 * and cancel. A reader who takes nothing else from this figure should take
 * "one of these has a direction and the other does not" — which is exactly the
 * difference between convection and diffusion.
 *
 * Blue for the microgravity flame is not a stylistic choice: a candle in
 * microgravity really does burn as a faint blue sphere, because without the
 * rising column there is no soot-heating that produces the yellow. It happens
 * to be --ares-trace-top, already in the palette.
 */

const PANELS = [
  {
    key: 'earth',
    label: '1 g',
    caption: 'Teardrop. Hot gas rises, cool air is pulled in beneath it, and the loop sustains itself.',
    verdict: 'Convection carries the work',
  },
  {
    key: 'orbit',
    label: '0 g',
    caption: 'Sphere. Nothing rises, so oxygen arrives and exhaust leaves only by diffusion — slowly, and from every direction equally.',
    verdict: 'Diffusion is all that is left',
  },
];

/** Candle body, shared by both panels so only the flame and flow differ. */
function Candle() {
  return (
    <g className="ares-candle-body">
      <rect x="62" y="150" width="36" height="70" rx="3" />
      <ellipse cx="80" cy="150" rx="18" ry="4.5" className="ares-candle-rim" />
      <path className="ares-candle-wick" d="M80,150 L80,138" />
    </g>
  );
}

export default function CandleComparison() {
  return (
    <figure className="ares-candles">
      <div className="ares-candles-grid">
        {/* ---- 1 g ---- */}
        <div className="ares-candle-panel ares-candle-panel--earth">
          <svg viewBox="0 0 160 240" role="img" aria-labelledby="ares-candle-earth-t">
            <title id="ares-candle-earth-t">
              A candle at Earth gravity. The flame is an elongated teardrop
              pointing upward. Arrows show cool air drawn in at the base from
              both sides and hot gas leaving straight up above the flame: the
              flow has a direction and forms a loop.
            </title>
            <defs>
              <radialGradient id="ares-flame-earth" cx="50%" cy="72%" r="62%">
                <stop offset="0%" stopColor="#fff3d4" />
                <stop offset="38%" stopColor="var(--ares-trace-fore)" />
                <stop offset="100%" stopColor="var(--ares-trace-chin)" />
              </radialGradient>
            </defs>

            <Candle />

            <path
              className="ares-flame ares-flame--earth"
              d="M80,138 C92,124 96,108 92,90
                 C90,76 84,62 80,46
                 C76,62 70,76 68,90
                 C64,108 68,124 80,138 Z"
              fill="url(#ares-flame-earth)"
            />

            {/* Entrainment: in at the base, out at the top. A directed loop. */}
            <g className="ares-candle-flow">
              <path d="M18,146 L52,140" />
              <path className="ares-candle-head" d="M52,140 l-9,-4 l1,8 Z" />
              <path d="M142,146 L108,140" />
              <path className="ares-candle-head" d="M108,140 l9,-4 l-1,8 Z" />
              <path d="M80,38 L80,10" />
              <path className="ares-candle-head" d="M80,10 l-5,10 l10,0 Z" />
            </g>
          </svg>
          <p className="ares-candle-verdict">{PANELS[0].verdict}</p>
          <p className="ares-candle-caption">{PANELS[0].caption}</p>
          <span className="ares-candle-tag">{PANELS[0].label}</span>
        </div>

        {/* ---- 0 g ---- */}
        <div className="ares-candle-panel ares-candle-panel--orbit">
          <svg viewBox="0 0 160 240" role="img" aria-labelledby="ares-candle-orbit-t">
            <title id="ares-candle-orbit-t">
              The same candle in microgravity. The flame is a small, dim sphere
              around the wick. Eight arrows of equal length point outward in
              every direction, so unlike the Earth panel there is no preferred
              direction and no loop.
            </title>
            <defs>
              <radialGradient id="ares-flame-orbit" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="#cfe2f0" />
                <stop offset="45%" stopColor="var(--ares-trace-top)" />
                <stop offset="100%" stopColor="var(--ares-trace-top)" stopOpacity="0.12" />
              </radialGradient>
            </defs>

            <Candle />

            <circle
              className="ares-flame ares-flame--orbit"
              cx="80" cy="120" r="26"
              fill="url(#ares-flame-orbit)"
            />
            <circle className="ares-candle-diffusion" cx="80" cy="120" r="42" />

            {/* Eight arrows of equal length pointing outward in every
                direction. Same arrowheads as the 1 g panel, deliberately: the
                comparison has to be arrows against arrows, or the reader is
                being shown a difference in drawing style rather than a
                difference in physics. These cancel; the ones on the left form
                a loop. That is the whole point of the figure. */}
            <g className="ares-candle-flow ares-candle-flow--isotropic">
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i * Math.PI) / 4;
                const at = (r) => [80 + Math.cos(a) * r, 120 + Math.sin(a) * r];
                const [x1, y1] = at(44);
                const [x2, y2] = at(58);
                const deg = (a * 180) / Math.PI;
                return (
                  <g key={i}>
                    <path d={`M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`} />
                    <path
                      className="ares-candle-head"
                      d="M0,-3.5 L7,0 L0,3.5 Z"
                      transform={`translate(${x2.toFixed(1)} ${y2.toFixed(1)}) rotate(${deg.toFixed(1)})`}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
          <p className="ares-candle-verdict">{PANELS[1].verdict}</p>
          <p className="ares-candle-caption">{PANELS[1].caption}</p>
          <span className="ares-candle-tag">{PANELS[1].label}</span>
        </div>
      </div>

      <figcaption>
        A candle is the same experiment as a body: a steady heat source in still
        air. Take gravity away and the shape collapses because the transport
        mechanism changed, not because the chemistry did. Illustrative diagram.
      </figcaption>
    </figure>
  );
}
