import { useEffect, useId, useRef, useState } from 'react';

/**
 * SystemDiagram — a hand-rolled SVG block diagram of the ARES data path,
 * named by function rather than by part: three pods feed an aggregation
 * step, which feeds on-body logging, a sync step, an application, and
 * finally analysis. Deliberately NOT mxGraph: there is no draw.io source for
 * ARES, and AstroFlowDiagram's five documented gotchas (see CLAUDE.md) only
 * pay off when decoding someone else's XML — this diagram has eight nodes
 * and no upstream file to decode.
 *
 * Publication clearance (spec §1.3): blocks and edges are named by what they
 * do. No bus names, timings, characteristic UUIDs, CSV column names, part
 * designations, or hardware-specific sample rates appear anywhere below.
 *
 * Layout constants are SVG coordinates and pixel sizes only — this diagram
 * has no physical constants to source from aresPhysics.js.
 */

const BLOCK_W = 140;
const BLOCK_H = 56;
const GAP_X = 70;
const COL0_X = 20;
const COL1_X = COL0_X + BLOCK_W + GAP_X;
const COL2_X = COL1_X + BLOCK_W + GAP_X;
const COL3_X = COL2_X + BLOCK_W + GAP_X;
const COL4_X = COL3_X + BLOCK_W + GAP_X;
const COL5_X = COL4_X + BLOCK_W + GAP_X;
const TOP_Y = 20;
const FOREHEAD_Y = 132;
const CHIN_Y = 244;
const DIAGRAM_WIDTH = COL5_X + BLOCK_W + 20;
const DIAGRAM_HEIGHT = CHIN_Y + BLOCK_H + 20;

const NODES = [
  {
    id: 'top',
    label: 'Top pod',
    x: COL0_X,
    y: TOP_Y,
    desc: 'Measures CO₂ near the top of the head, above the rising plume of warm breath.',
  },
  {
    id: 'forehead',
    label: 'Forehead pod',
    x: COL0_X,
    y: FOREHEAD_Y,
    desc: 'Measures CO₂ at the forehead, between the top and chin pods.',
  },
  {
    id: 'chin',
    label: 'Chin pod',
    x: COL0_X,
    y: CHIN_Y,
    desc: 'Measures CO₂ closest to the mouth and nose, where exhaled breath is most concentrated.',
  },
  {
    id: 'aggregation',
    label: 'Aggregation',
    x: COL1_X,
    y: FOREHEAD_Y,
    desc: "Combines the three pods' separate readings into one on-body record.",
  },
  {
    id: 'logging',
    label: 'On-body logging',
    x: COL2_X,
    y: FOREHEAD_Y,
    desc: 'Stores the combined record on the headset itself.',
  },
  {
    id: 'sync',
    label: 'Sync',
    x: COL3_X,
    y: FOREHEAD_Y,
    desc: 'Transfers the stored record from the headset to a companion application.',
  },
  {
    id: 'application',
    label: 'Application',
    x: COL4_X,
    y: FOREHEAD_Y,
    desc: 'Presents the record to the person wearing the headset, or to a researcher.',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    x: COL5_X,
    y: FOREHEAD_Y,
    desc: 'Interprets the record after the fact — the step every earlier block exists to feed.',
  },
];

const EDGES = [
  ['top', 'aggregation'],
  ['forehead', 'aggregation'],
  ['chin', 'aggregation'],
  ['aggregation', 'logging'],
  ['logging', 'sync'],
  ['sync', 'application'],
  ['application', 'analysis'],
];

const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
};

export default function SystemDiagram() {
  const idBase = useId();
  const containerRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const reducedMotion = usePrefersReducedMotion();

  // Gate the travelling-dash reveal on scroll-into-view, and disconnect the
  // observer both the moment it has fired once and on unmount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const live = inView && !reducedMotion;
  const activeNode = activeId ? nodeById[activeId] : null;
  const titleId = `${idBase}-title`;
  const arrowId = `${idBase}-arrow`;

  const clearActive = (id) => setActiveId((cur) => (cur === id ? null : cur));

  return (
    <figure className="ares-system-diagram" ref={containerRef}>
      <svg
        className="ares-diagram-svg"
        viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          Block diagram: the top, forehead, and chin pods feed aggregation,
          which feeds on-body logging, sync, the application, and analysis,
          in that order.
        </title>

        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path className="ares-diagram-arrowhead" d="M0,0 L10,5 L0,10 z" />
          </marker>
        </defs>

        <g className="ares-diagram-edges">
          {EDGES.map(([fromId, toId]) => {
            const from = nodeById[fromId];
            const to = nodeById[toId];
            const x1 = from.x + BLOCK_W;
            const y1 = from.y + BLOCK_H / 2;
            const x2 = to.x;
            const y2 = to.y + BLOCK_H / 2;
            return (
              <line
                key={`${fromId}-${toId}`}
                className={`ares-diagram-edge${live ? ' ares-diagram-edge-live' : ''}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                markerEnd={`url(#${arrowId})`}
              />
            );
          })}
        </g>

        <g className="ares-diagram-nodes">
          {NODES.map((node) => (
            <g
              key={node.id}
              className={`ares-diagram-block${
                activeId === node.id ? ' ares-diagram-block-active' : ''
              }`}
              tabIndex={0}
              role="button"
              aria-label={node.label}
              onMouseEnter={() => setActiveId(node.id)}
              onMouseLeave={() => clearActive(node.id)}
              onFocus={() => setActiveId(node.id)}
              onBlur={() => clearActive(node.id)}
            >
              <rect x={node.x} y={node.y} width={BLOCK_W} height={BLOCK_H} rx={8} />
              <text x={node.x + BLOCK_W / 2} y={node.y + BLOCK_H / 2 + 5} textAnchor="middle">
                {node.label}
              </text>
            </g>
          ))}
        </g>
      </svg>

      <p className="ares-diagram-desc" aria-live="polite">
        {activeNode ? activeNode.desc : 'Hover or focus a block to see what it does.'}
      </p>

      <figcaption>
        Each pod is measured separately; the numbers are combined only after
        aggregation, and everything downstream of the headset works from that
        combined record.
      </figcaption>

      <ol className="ares-visually-hidden">
        {NODES.map((node) => (
          <li key={node.id}>
            {node.label}: {node.desc}
          </li>
        ))}
      </ol>
    </figure>
  );
}
