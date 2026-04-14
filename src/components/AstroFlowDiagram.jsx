import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import MxFactory from 'mxgraph';
import { useFlowAnimations } from '../hooks/useFlowAnimations';

const AstroSubsystem3D = lazy(() => import('./AstroSubsystem3D'));

// Initialise the mxGraph factory once at module level.
const mx = MxFactory({
  mxBasePath:        '/',
  mxImageBasePath:   '/',
  mxLoadResources:   false,
  mxLoadStylesheets: false,
});

// mxCodec.decode() resolves cell constructors via window[nodeName].
// Factory keeps classes in its closure — expose them so decode works.
Object.assign(window, mx);

// ── Register draw.io extended shapes not built into vanilla mxGraph ───────────
(function registerDrawioShapes() {
  const { mxShape, mxUtils: U, mxCellRenderer: CR, mxActor } = mx;

  // step — chevron: notch on left, point on right
  function StepShape() { mxShape.call(this); }
  U.extend(StepShape, mxShape);
  StepShape.prototype.paintBackground = function (c, x, y, w, h) {
    var dx = w * 0.15;
    c.begin();
    c.moveTo(x,          y);
    c.lineTo(x + w - dx, y);
    c.lineTo(x + w,      y + h / 2);
    c.lineTo(x + w - dx, y + h);
    c.lineTo(x,          y + h);
    c.lineTo(x + dx,     y + h / 2);
    c.close();
    c.fillAndStroke();
  };
  CR.registerShape('step', StepShape);

  // process — rectangle with vertical bars at ±10% (ISO 5807)
  function ProcessShape() { mxShape.call(this); }
  U.extend(ProcessShape, mxShape);
  ProcessShape.prototype.paintBackground = function (c, x, y, w, h) {
    c.rect(x, y, w, h);
    c.fillAndStroke();
  };
  ProcessShape.prototype.paintForeground = function (c, x, y, w, h) {
    var dx = Math.max(4, Math.min(10, w * 0.1));
    c.begin();
    c.moveTo(x + dx,     y); c.lineTo(x + dx,     y + h);
    c.moveTo(x + w - dx, y); c.lineTo(x + w - dx, y + h);
    c.stroke();
  };
  CR.registerShape('process', ProcessShape);

  // parallelogram — lean-right slanted rectangle
  function ParallelogramShape() { mxShape.call(this); }
  U.extend(ParallelogramShape, mxShape);
  ParallelogramShape.prototype.paintBackground = function (c, x, y, w, h) {
    var dx = Math.min(w * 0.2, h);
    c.begin();
    c.moveTo(x + dx,     y);
    c.lineTo(x + w,      y);
    c.lineTo(x + w - dx, y + h);
    c.lineTo(x,          y + h);
    c.close();
    c.fillAndStroke();
  };
  CR.registerShape('parallelogram', ParallelogramShape);

  // umlActor — reuse mxActor (built-in stick-figure, different name in draw.io)
  CR.registerShape('umlActor', mxActor);
}());

const XML_URL =
  '/astrousa/interactive%20diagrams/ASTRO-USA%20Flow%20Chart%20Version%201.8.xml';

// ── Key / legend definitions ──────────────────────────────────────────────────
const KEY_ITEMS = [
  { id: 'hvac',    label: 'HVAC',             color: '#FFD966', textColor: '#143642', icon: 'fa-wind' },
  { id: 'control', label: 'Control Systems',  color: '#FF99FF', textColor: '#143642', icon: 'fa-sliders-h' },
  { id: 'waste',   label: 'Waste Management', color: '#FF9933', textColor: '#143642', icon: 'fa-recycle' },
  { id: 'hydro',   label: 'Hydroponics',      color: '#44BB66', textColor: '#ffffff', icon: 'fa-seedling' },
  { id: 'crew',    label: 'Crew Areas',       color: '#AAAAAA', textColor: '#143642', icon: 'fa-users' },
  { id: 'lab',     label: 'Lab & Research',   color: '#00CCCC', textColor: '#143642', icon: 'fa-flask' },
  { id: 'airlock', label: 'Airlock',          color: '#B5739D', textColor: '#ffffff', icon: 'fa-door-open' },
  { id: 'fire',    label: 'Fire Control',     color: '#FF5555', textColor: '#ffffff', icon: 'fa-fire-extinguisher' },
  { id: 'power',   label: 'Power',            color: '#D4AA00', textColor: '#143642', icon: 'fa-bolt' },
  { id: 'water',   label: 'Water',            color: '#5599CC', textColor: '#ffffff', icon: 'fa-tint' },
  { id: 'myco',    label: 'Mycoponics',       color: '#B266FF', textColor: '#ffffff', icon: 'fa-leaf' },
];

// Structural swimlane labels whose entire subtree belongs to a system.
// addCellAndDescendants() is applied to each matched swimlane.
const SYSTEM_LABELS = {
  hvac:    ['HVAC', 'HVAC Sensors and Detectors'],
  control: ['Control Systems'],
  waste:   ['Waste Management Bioreactor Systems', 'FMBR Production System', 'Bathroom'],
  hydro:   ['Autonomous Hydroponic Systems'],
  crew:    ['Laundry Room', 'Kitchen', 'Medbay'],
  lab:     ['Lab and Work Area'],
  airlock: ['Airlock'],
  fire:    ['Fire Control Systems'],
  power:   ['Power Generation, Supply, and Storage System'],
  myco:    ['Mycoponic Systems'],
};

// Fill colors (lowercase hex) for standalone sibling nodes that belong to a
// system but are not structurally inside its swimlane.
const SYSTEM_EXTRA_COLORS = {
  hvac:    new Set(['#ffe599', '#fff2cc']),
  control: new Set(['#ffcce6']),
  waste:   new Set(['#ffcc99']),
  hydro:   new Set(['#99ff99']),
  crew:    new Set(['#e6e6e6']),
  lab:     new Set(['#ccffff']),
  airlock: new Set(['#e6d0de']),
  fire:    new Set(['#ffcccc']),
  power:   new Set(['#ffffcc']),
  water:   new Set(['#99ccff']),
  myco:    new Set(['#b266ff', '#e5ccff']),
};

// ── Edge flow-type legend items ───────────────────────────────────────────────
const FLOW_LEGEND_ITEMS = [
  { id: 'control',   label: 'Control Signal',  color: '#B3B3B3' },
  { id: 'water',     label: 'Water Flow',      color: '#0000FF' },
  { id: 'gas',       label: 'O\u2082\u202F/\u202FGas', color: '#00CC00' },
  { id: 'bio-gas',   label: 'Bio-Gas',         color: '#009900' },
  { id: 'waste',     label: 'Waste',           color: '#FF8000' },
  { id: 'cryo',      label: 'Cryogenic',       color: '#00CCCC' },
  { id: 'aqua',      label: 'Aqua/Cooling',    color: '#00FFFF' },
  { id: 'plant',     label: 'Hydroponic',      color: '#97D077' },
  { id: 'myco',      label: 'Mycoponics',      color: '#A680B8' },
  { id: 'power',     label: 'Power',           color: '#CCCC00' },
  { id: 'hvac',      label: 'HVAC/Thermal',    color: '#FFD966' },
  { id: 'fire',      label: 'Fire/Alarm',      color: '#FF0000' },
  { id: 'alternate', label: 'Alt. Flow',       color: '#FF0080' },
  { id: 'airlock',   label: 'Airlock/Pressure',color: '#E6D0DE' },
];

// ── Node descriptions (ICES-2026-251) ────────────────────────────────────────
const NODE_DESCRIPTIONS = {
  'ASTRO-USA Habitat':
    'The outermost boundary of the closed-loop analog habitat. Contains all crew living quarters, lab, kitchen, medical bay, laundry, and life-support subsystems within a shipping-container-derived shell.',
  'HVAC':
    'Heating, Ventilation, and Air Conditioning. Maintains atmospheric temperature (18–24 °C), humidity, and gas composition throughout the habitat, with dedicated sensor networks feeding SIMOC Live.',
  'HVAC Sensors and Detectors':
    'CO₂, O₂, temperature, and humidity sensors distributed throughout the habitat. Continuously stream data to SIMOC Live for real-time atmospheric monitoring and alarm triggering.',
  'HVAC Systems':
    'Air handler units, HEPA filtration banks, and circulation fans. Automated via Opto 22 controllers based on sensor readings from the HVAC sensor network.',
  'Control Systems':
    'Central automation and monitoring hub. SIMOC Live provides real-time dashboard access to all habitat sensors; Opto 22 PLCs execute automated control loops and trigger alarms on threshold violations.',
  'SIMOC Live':
    'Browser-based real-time habitat monitoring platform. Streams all sensor data to a live dashboard accessible inside or outside the habitat.',
  'Alarms':
    'Automated multi-threshold alarm system. Triggered by CO₂ overruns, O₂ depletion, fire sensors, pressure anomalies, or bioreactor faults.',
  'Laundry Room':
    'Crew laundry facility. Greywater effluent from the washing machine is collected and routed to the waste water holding tank for treatment and potential recovery.',
  'Washing Machine':
    'Generates greywater (detergent + lint load). Effluent is plumbed to the waste management system for water recovery.',
  'Medbay':
    'Dedicated medical bay with a sink, first-aid stores, and an independent O₂ supply line from the hydroponic system. Supports crew health monitoring for multi-day mission simulations.',
  'Sink':
    'Greywater source. Water from sinks throughout the habitat is collected and routed to the waste management holding tank.',
  'Kitchen':
    'Food preparation area with refrigerator/freezer, sink, and cooking facilities. Greywater is channelled to waste management; crew meals are partially sourced from the hydroponic bays.',
  'Lab and Work Area':
    'Multi-function research lab: algae cultivation trays, sample refrigerator/freezer, autoclave for sterilisation, and computer workstations for mission data entry and analysis.',
  'Waste Management Bioreactor Systems':
    'Two-stage biological treatment train (APMBR → SAMBR) that processes all crew solid and liquid waste into treated permeate water and nutrient-rich fertiliser for the hydroponic system — closing the water and nutrient loops.',
  'APMBR':
    'Anaerobic-Phototrophic Membrane Bio Reactor. First treatment stage: anaerobic digestion with phototrophic bacteria breaks down solid fecal waste, generating biogas and a liquid digestate that feeds into the SAMBR.',
  'SAMBR':
    'Suspended Aerobic Membrane Bio Reactor. Second treatment stage: aerobic membrane filtration polishes the APMBR digestate to near-potable quality permeate and concentrates nutrients into a usable fertiliser fraction.',
  'Autonomous Hydroponic Systems':
    'NFT (Nutrient Film Technique) tower arrays with automated pH and EC sensors, nutrient dosing pumps, and grow-light scheduling. Receives fertiliser permeate directly from the bioreactor train.',
  'Airlock':
    'EVA transition zone. A vacuum pump, air pump, and redundant pressure sensors allow safe cycling of crew between habitat atmosphere and the external environment, mirroring spacecraft airlock protocols.',
  'Fire Control Systems':
    'Automated sprinkler grid and ionisation smoke detectors integrated with the Control Systems alarm network.',
  'CO2':
    'Carbon dioxide produced by crew respiration and microbial activity. Scrubbed by the HVAC system and potentially supplied as a carbon supplement to algae cultivation trays.',
  'O2':
    'Oxygen generated by plant photosynthesis in the hydroponic bays and algae trays. Supplemental O₂ is routed to the medbay O₂ line.',
  'Urine':
    'Crew urine collected and directed to the SAMBR secondary treatment stage for water recovery and nutrient extraction.',
  'Fecal Matter':
    'Crew solid waste directed to the APMBR primary digestion stage, where anaerobic bacteria break it down into biogas and liquid digestate.',
  'Permeate and "Fertilizer\'s"':
    'Bioreactor train output: high-quality permeate water (suitable for irrigation) and a concentrated nutrient solution used as fertiliser in the NFT hydroponic towers.',
  'Hydroponics':
    'Outer hydroponics zone encompassing all plant cultivation systems — NFT towers, propagation trays, and the algae section in the lab.',
  'Water Waste Tank':
    'Holding tank that aggregates greywater from the kitchen sink, laundry, and medbay before routing to the bioreactor pre-treatment stage.',
  'Algae':
    'Microalgae culture trays in the Lab and Work Area. Produce supplemental O₂, biomass for potential crew nutrition, and act as a tertiary biological filter for the water loop.',
  'Autoclave':
    'High-pressure steam steriliser used in the lab to decontaminate biological waste, instruments, and growth media before reuse or disposal.',
  'Vacuum Pump':
    'Component of the airlock depressurisation sequence — evacuates the airlock chamber before EVA egress.',
  'Air Pump':
    'Re-pressurises the airlock to habitat atmospheric pressure after EVA return.',
  'Sprinkler System':
    'Wet-pipe fire suppression distributed across all habitat compartments. Triggered automatically by the Fire Control Systems alarm node.',

  // ── Additional nodes ─────────────────────────────────────────────────────────
  'Bathroom':
    'Crew bathroom facility. Urine is directed to the SAMBR for water recovery; solid waste feeds the APMBR for anaerobic digestion. Shower and wash-basin greywater routes to the Water Waste Tank.',
  'Shower':
    'Crew shower. Greywater output is collected and routed to the Water Waste Tank for bioreactor pre-treatment and potential water recovery.',
  'Toilet with Bidet':
    'Crew toilet with bidet for hygienic solid waste separation. Urine is diverted to the SAMBR; fecal matter is directed to the APMBR for anaerobic digestion.',
  'Dishwasher':
    'Kitchen dishwasher. Greywater output joins the kitchen sink effluent and routes to the Water Waste Tank for treatment.',
  'FMBR':
    'Fungal Membrane Bio Reactor — a prototype digestion unit that uses mycelium (fungal networks) to break down organic waste into biomass and secondary metabolites, complementing the bacterial APMBR/SAMBR stages.',
  'FMBR Production System':
    'Full fungal-membrane bioreactor production train that converts organic feedstocks into mycelium-derived bio-products, nutrients, and treated permeate, extending the waste-to-resource loop beyond the bacterial bioreactor stages.',
  'MABR':
    'Membrane Aerated Biofilm Reactor — a membrane-based reactor variant that delivers oxygen through membranes directly to biofilm, enabling simultaneous nitrification and denitrification at lower energy cost.',
  'Mycoponic Systems':
    'Mushroom cultivation system that uses mycelium to break down organic matter (e.g., crop waste, cardboard) into edible fruiting bodies. Provides supplemental crew nutrition and recycles habitat organic waste.',
  'Power Generation, Supply, and Storage System':
    'Integrated electrical power subsystem: solar panel array (primary generation), battery bank (energy storage and night-time supply), and distribution bus. Powers all habitat sensors, life-support actuators, and crew electronics.',
  'Solar Panels':
    'Photovoltaic panels mounted on or near the ASTRO-USA habitat structure. Primary electrical energy source; output feeds directly to the battery storage system and habitat distribution bus.',
  'Batteries':
    'Electrochemical energy storage bank. Accepts charge from solar panels during peak generation; supplies stable DC power to habitat systems during low-generation periods (night, cloud cover).',
  'OPTO 22':
    'Opto 22 GRV I/O platform — industrial programmable automation controller (PAC) that reads sensor inputs and drives actuators (pumps, fans, valves) throughout the habitat. Communicates with SIMOC Live over the habitat network.',
  'Potable Water Tank':
    'Clean drinking-water storage tank. Fed by the RO System permeate output; distributed to kitchen, medbay, and crew drinking stations.',
  'RO System':
    'Reverse Osmosis filtration unit. Polishes bioreactor permeate and recovered greywater to potable-grade quality, removing residual dissolved solids before storage in the Potable Water Tank.',
  'UV Filtration Ventilation':
    'Ultraviolet germicidal irradiation (UVGI) air treatment unit integrated into the HVAC ductwork. Destroys airborne pathogens and mold spores to maintain crew health during long-duration missions.',
  'Pressure Control Lung':
    'Flexible-volume pressure-equalisation device in the airlock that absorbs or supplies air to maintain habitat positive pressure during EVA cycling, reducing the load on the air pump and vacuum pump.',
  'Crew':
    'The analog astronaut crew occupying the ASTRO-USA habitat during a mission simulation. Crew activity drives all waste, water, food, and atmospheric consumption inputs to the habitat life-support loop.',
  'Food':
    'Crew nutritional supply — a combination of shelf-stable rations and fresh produce harvested from the autonomous hydroponic towers and mycoponic cultivation trays within the habitat.',
  'Emergency Shower':
    'Safety shower station in the lab area. Required by laboratory safety protocol for immediate decontamination in the event of chemical or biological spill exposure to the body.',
  'Eye Wash':
    'Dedicated eye-wash station. Provides continuous low-pressure water flow to flush chemical or biological contaminants from crew eyes; plumbed to the lab water supply.',
};

// ── Strip HTML tags from mxGraph cell values ─────────────────────────────────
function cleanLabel(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(div|p|span|b|i|em|strong)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Collect a cell and all its model descendants into a Set ───────────────────
function addCellAndDescendants(model, cell, result) {
  if (!cell) return;
  result.add(cell);
  const n = model.getChildCount(cell);
  for (let i = 0; i < n; i++) {
    addCellAndDescendants(model, model.getChildAt(cell, i), result);
  }
}

// Extract fillColor from an mxGraph style string, normalized to lowercase hex.
function extractFillColor(style) {
  if (!style) return null;
  const m = style.match(/fillColor=([^;]+)/i);
  return m ? m[1].toLowerCase().trim() : null;
}

// ── Apply/remove dimming for the current set of toggled-off system IDs ────────
function applyToggles(graph, labelMap, origStyles, offIds) {
  const model  = graph.getModel();
  const cells  = Object.values(model.cells || {});

  cells.forEach(cell => {
    if (!origStyles.has(cell.id)) {
      origStyles.set(cell.id, model.getStyle(cell) || '');
    }
  });

  const toDim = new Set();
  offIds.forEach(sysId => {
    (SYSTEM_LABELS[sysId] || []).forEach(label => {
      (labelMap.get(label) || []).forEach(cell => {
        addCellAndDescendants(model, cell, toDim);
      });
    });

    const colorSet = SYSTEM_EXTRA_COLORS[sysId];
    if (colorSet) {
      cells.forEach(cell => {
        const fc = extractFillColor(origStyles.get(cell.id) || '');
        if (fc && colorSet.has(fc)) toDim.add(cell);
      });
    }
  });

  const toDash = new Set();
  cells.forEach(cell => {
    if (!model.isEdge(cell)) return;
    const src = model.getTerminal(cell, true);
    const tgt = model.getTerminal(cell, false);
    if (toDim.has(src) || toDim.has(tgt)) toDash.add(cell);
  });

  model.beginUpdate();
  try {
    cells.forEach(cell => {
      const orig = origStyles.get(cell.id);
      if (toDim.has(cell)) {
        model.setStyle(cell, orig + ';opacity=25');
      } else if (toDash.has(cell)) {
        model.setStyle(cell, orig + ';opacity=25;dashed=1');
      } else {
        model.setStyle(cell, orig);
      }
    });
  } finally {
    model.endUpdate();
  }
}

// ── Find which system a node label structurally belongs to ────────────────────
function findSystemForNode(label) {
  for (const [sysId, labels] of Object.entries(SYSTEM_LABELS)) {
    if (labels.includes(label)) return sysId;
  }
  return null;
}

// ── Apply GSAP edge + vertex highlight when a node is clicked ─────────────────
function applyEdgeHighlight(graph, cell, container, highlightCtxRef) {
  highlightCtxRef.current?.revert();
  highlightCtxRef.current = null;

  const svg = container?.querySelector('svg');
  if (!svg) return;

  const cellState  = graph.view.getState(cell);
  const vertexNode = cellState?.shape?.node;
  const model      = graph.getModel();
  const edgeNodes  = [];
  const ec         = model.getEdgeCount(cell);
  for (let i = 0; i < ec; i++) {
    const es = graph.view.getState(model.getEdgeAt(cell, i));
    if (es?.shape?.node) edgeNodes.push(es.shape.node);
  }

  if (!vertexNode && !edgeNodes.length) return;

  highlightCtxRef.current = gsap.context(() => {
    gsap.to(svg, { opacity: 0.3, duration: 0.25 });
    if (vertexNode) gsap.to(vertexNode, { opacity: 1, duration: 0.25 });
    if (edgeNodes.length) gsap.to(edgeNodes, { opacity: 1, duration: 0.25 });
  });
}

// ── Clear edge highlight and restore SVG to full opacity ──────────────────────
function clearEdgeHighlight(container, highlightCtxRef) {
  highlightCtxRef.current?.revert();
  highlightCtxRef.current = null;
}

// ── Override mxGraph's injected white backgrounds after decode ────────────────
function applyDarkBackground(container) {
  if (!container) return;
  // mxGraph injects a direct-child <div> with inline white background
  const inner = container.querySelector(':scope > div');
  if (inner) inner.style.background = 'transparent';

  // The SVG itself may also have background set
  const svgEl = container.querySelector('svg');
  if (svgEl) {
    svgEl.style.background = 'transparent';
    // mxGraph often inserts a white <rect> as the SVG's first child
    const firstRect = svgEl.querySelector('rect');
    if (firstRect) {
      const fill = (firstRect.getAttribute('fill') || '').toLowerCase();
      if (fill === '#ffffff' || fill === 'white') {
        firstRect.setAttribute('fill', 'transparent');
      }
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
const AstroFlowDiagram = () => {
  const containerRef    = useRef(null);
  const graphRef        = useRef(null);
  const labelMapRef     = useRef(null);
  const origStylesRef   = useRef(new Map());
  const starfieldRef    = useRef(null);
  const highlightCtxRef = useRef(null);
  const rebuildFlowRef  = useRef(null);
  const wheelTimerRef   = useRef(null);

  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [activeNode, setActiveNode]   = useState(null);
  const [offSystems, setOffSystems]   = useState([]);
  const [flowEnabled, setFlowEnabled] = useState(true);

  // ── GSAP flow animations (Phase 1) ───────────────────────────────────────
  const buildFlowAnimations = useFlowAnimations(graphRef, !loading, offSystems, flowEnabled);
  // Keep a mutable ref so toolbar handlers and the wheel listener (inside an
  // effect closure) can always call the latest stable version.
  useEffect(() => { rebuildFlowRef.current = buildFlowAnimations; }, [buildFlowAnimations]);

  // ── Starfield canvas (Phase 2) ────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const canvas = starfieldRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const setDims = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    setDims();

    const stars = Array.from({ length: 120 }, () => ({
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      r:  Math.random() * 1.2 + 0.3,
      a:  Math.random(),
      da: (Math.random() - 0.5) * 0.006,
    }));

    const ctx = canvas.getContext('2d');
    let rafId;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        s.a += s.da;
        if (s.a <= 0.08 || s.a >= 0.92) s.da *= -1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a.toFixed(3)})`;
        ctx.fill();
      });
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    const obs = new ResizeObserver(setDims);
    obs.observe(canvas);

    return () => {
      cancelAnimationFrame(rafId);
      obs.disconnect();
    };
  }, [loading]);

  // ── Main effect: create graph, load XML, wire events ─────────────────────
  useEffect(() => {
    let destroyed      = false;
    let resizeObserver = null;
    let bgObserver     = null;

    const { mxGraph: MxGraph, mxUtils, mxCodec: MxCodec, mxEvent } = mx;

    (async () => {
      try {
        // Create graph
        const graph = new MxGraph(containerRef.current);
        graphRef.current = graph;

        graph.setEnabled(false);
        graph.setConnectable(false);
        graph.setCellsMovable(false);
        graph.setCellsResizable(false);
        graph.setPanning(true);
        graph.setTooltips(true);
        graph.panningHandler.useLeftButtonForPanning = true;
        graph.setHtmlLabels(true);
        graph.border = 30;

        // draw.io named style shortcuts
        const ss = graph.getStylesheet();
        ss.putCellStyle('ellipse',  { shape: 'ellipse',  perimeter: 'ellipsePerimeter' });
        ss.putCellStyle('rhombus',  { shape: 'rhombus',  perimeter: 'rhombusPerimeter', verticalAlign: 'middle' });
        ss.putCellStyle('swimlane', { shape: 'swimlane', startSize: 23 });
        ss.putCellStyle('text',     { fillColor: 'none', strokeColor: 'none', align: 'left', verticalAlign: 'middle' });

        // Tooltips
        graph.getTooltipForCell = (cell) => {
          if (!cell || !cell.value) return '';
          return NODE_DESCRIPTIONS[cleanLabel(cell.value)] || cleanLabel(cell.value);
        };
        if (graph.tooltipHandler) graph.tooltipHandler.delay = 600;

        // Fetch + decode XML
        const res = await fetch(XML_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status} — could not load diagram file`);
        const xmlText = await res.text();
        if (destroyed) return;

        const doc     = mxUtils.parseXml(xmlText);
        const modelEl = doc.getElementsByTagName('mxGraphModel')[0];
        if (!modelEl) throw new Error('mxGraphModel not found in diagram XML');

        const codec = new MxCodec(doc);
        graph.getModel().beginUpdate();
        try {
          codec.decode(modelEl, graph.getModel());
        } finally {
          graph.getModel().endUpdate();
        }
        graph.refresh();
        await new Promise(r => setTimeout(r, 0));
        if (destroyed) return;
        graph.fit();

        // Override mxGraph's injected white backgrounds (Phase 2)
        applyDarkBackground(containerRef.current);

        // Watch for any late-injected white backgrounds
        bgObserver = new MutationObserver(() => applyDarkBackground(containerRef.current));
        bgObserver.observe(containerRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

        // Build label → cell[] map for toggle system
        const labelMap = new Map();
        Object.values(graph.getModel().cells || {}).forEach(cell => {
          if (!cell.value) return;
          const lbl = cleanLabel(cell.value);
          if (!lbl) return;
          if (!labelMap.has(lbl)) labelMap.set(lbl, []);
          labelMap.get(lbl).push(cell);
        });
        labelMapRef.current = labelMap;

        // Click → detail panel + edge highlight (Phase 3)
        graph.addListener(mxEvent.CLICK, (_s, evt) => {
          const cell = evt.getProperty('cell');
          if (!cell || !cell.value) {
            setActiveNode(null);
            clearEdgeHighlight(containerRef.current, highlightCtxRef);
            return;
          }
          const label = cleanLabel(cell.value);
          if (label) {
            setActiveNode(label);
            applyEdgeHighlight(graph, cell, containerRef.current, highlightCtxRef);
          }
          evt.consume();
        });

        // Ctrl/Cmd + scroll to zoom — debounce flow animation rebuild 250 ms
        // after the last wheel event so we only rebuild once per gesture.
        const onWheel = (e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          if (e.deltaY < 0) graph.zoomIn(); else graph.zoomOut();
          clearTimeout(wheelTimerRef.current);
          wheelTimerRef.current = setTimeout(() => rebuildFlowRef.current?.(), 250);
        };
        containerRef.current.addEventListener('wheel', onWheel, { passive: false });

        // Pointer cursor when hovering a clickable vertex
        const onMouseMove = (e) => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const cell = graph.getCellAt(e.clientX - rect.left, e.clientY - rect.top);
          const clickable = cell && cell.vertex && cell.value && cleanLabel(cell.value);
          containerRef.current.style.cursor = clickable ? 'pointer' : 'grab';
        };
        const onMouseLeave = () => {
          if (containerRef.current) containerRef.current.style.cursor = 'grab';
        };
        containerRef.current.addEventListener('mousemove', onMouseMove);
        containerRef.current.addEventListener('mouseleave', onMouseLeave);

        // Resize observer
        resizeObserver = new ResizeObserver(() => {
          if (!destroyed && graphRef.current) graphRef.current.sizeDidChange();
        });
        resizeObserver.observe(containerRef.current);

        if (!destroyed) setLoading(false);

      } catch (err) {
        if (!destroyed) { setError(err.message); setLoading(false); }
      }
    })();

    return () => {
      destroyed = true;
      if (bgObserver)     bgObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      clearEdgeHighlight(null, highlightCtxRef);
      if (graphRef.current) { graphRef.current.destroy(); graphRef.current = null; }
    };
  }, []);

  // ── Effect: re-apply dimming whenever offSystems changes ─────────────────
  useEffect(() => {
    if (!graphRef.current || !labelMapRef.current) return;
    applyToggles(graphRef.current, labelMapRef.current, origStylesRef.current, offSystems);
  }, [offSystems]);

  // ── Key toggle handler ────────────────────────────────────────────────────
  const toggleSystem = useCallback((id) => {
    setOffSystems(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }, []);

  // ── Arrow-key navigation for the toggle key strip (Phase 3) ──────────────
  const onKeyNav = useCallback((e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btns = [...e.currentTarget.querySelectorAll('.astro-key-btn')];
    const idx  = btns.indexOf(document.activeElement);
    if (idx === -1) return;
    const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
    btns[next].focus();
    e.preventDefault();
  }, []);

  // ── Toolbar ───────────────────────────────────────────────────────────────
  // After every zoom/fit mxGraph repaints SVG paths, so we rebuild flow
  // animations 150 ms later (enough time for one browser paint cycle).
  const handleFit     = () => { graphRef.current?.fit();        setTimeout(() => rebuildFlowRef.current?.(), 150); };
  const handleZoomIn  = () => { graphRef.current?.zoomIn();     setTimeout(() => rebuildFlowRef.current?.(), 150); };
  const handleZoomOut = () => { graphRef.current?.zoomOut();    setTimeout(() => rebuildFlowRef.current?.(), 150); };
  const handleActual  = () => { graphRef.current?.zoomActual(); setTimeout(() => rebuildFlowRef.current?.(), 150); };
  const closePanel    = () => {
    setActiveNode(null);
    clearEdgeHighlight(containerRef.current, highlightCtxRef);
  };

  // ── Derive system info for the active node (Phase 3) ─────────────────────
  const activeSysId  = activeNode ? findSystemForNode(activeNode) : null;
  const activeSysKey = activeSysId ? KEY_ITEMS.find(k => k.id === activeSysId) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="astro-diagram-wrap" data-aos="fade-up">

      <div className="astro-diagram-toolbar">
        <span className="diagram-toolbar-label">
          <i className="fas fa-project-diagram" aria-hidden="true" />
          {' '}Interactive System Flow Diagram
        </span>
        <div className="diagram-toolbar-btns">
          <button
            className={`diagram-toolbar-btn diagram-flow-toggle${flowEnabled ? ' flow-active' : ''}`}
            onClick={() => setFlowEnabled(v => !v)}
            title={flowEnabled ? 'Pause flow animation' : 'Resume flow animation'}
            aria-pressed={flowEnabled}
          >
            <i className={`fas fa-${flowEnabled ? 'pause' : 'play'}`} aria-hidden="true" />
            Flow
          </button>
          <div className="diagram-toolbar-sep" aria-hidden="true" />
          <button className="diagram-toolbar-btn" onClick={handleFit}     title="Fit to view"  aria-label="Fit to view">
            <i className="fas fa-compress-arrows-alt" aria-hidden="true" />
          </button>
          <button className="diagram-toolbar-btn" onClick={handleZoomIn}  title="Zoom in"      aria-label="Zoom in">
            <i className="fas fa-plus" aria-hidden="true" />
          </button>
          <button className="diagram-toolbar-btn" onClick={handleZoomOut} title="Zoom out"     aria-label="Zoom out">
            <i className="fas fa-minus" aria-hidden="true" />
          </button>
          <button className="diagram-toolbar-btn" onClick={handleActual}  title="Actual size"  aria-label="Actual size">
            <i className="fas fa-expand" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── System key / toggle strip ───────────────────────────────────── */}
      <div
        className="astro-diagram-key"
        role="group"
        aria-label="System visibility toggles"
        onKeyDown={onKeyNav}
      >
        <span className="astro-diagram-key-heading">Toggle systems:</span>
        {KEY_ITEMS.map(item => {
          const isOff = offSystems.includes(item.id);
          return (
            <button
              key={item.id}
              className={`astro-key-btn${isOff ? ' off' : ''}`}
              onClick={() => toggleSystem(item.id)}
              aria-pressed={isOff}
              title={isOff ? `Show ${item.label}` : `Hide ${item.label}`}
              style={{ '--key-bg': item.color, '--key-fg': item.textColor }}
            >
              <i className={`fas ${item.icon}`} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* ── Diagram canvas area ─────────────────────────────────────────── */}
      <div className="astro-diagram-stage">
        <canvas
          ref={starfieldRef}
          className="astro-diagram-starfield"
          aria-hidden="true"
        />
        <div
          className="astro-diagram-container"
          ref={containerRef}
          role="img"
          aria-label="ASTRO-USA functional flow diagram — interactive"
        />
        {loading && !error && (
          <div className="astro-diagram-loading" aria-live="polite">
            <div className="diagram-spinner" aria-hidden="true" />
            <span>Loading diagram…</span>
          </div>
        )}
        {error && (
          <div className="astro-diagram-loading astro-diagram-error" aria-live="assertive">
            <i className="fas fa-exclamation-triangle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Edge flow-type legend ───────────────────────────────────────── */}
      <div className="astro-diagram-flow-legend" aria-label="Edge flow type legend">
        <span className="astro-flow-legend-heading">Edge types:</span>
        {FLOW_LEGEND_ITEMS.map(item => (
          <span key={item.id} className="astro-flow-swatch">
            <span
              className="astro-flow-swatch-line"
              style={{ '--swatch-color': item.color }}
              aria-hidden="true"
            />
            <span className="astro-flow-swatch-label">{item.label}</span>
          </span>
        ))}
      </div>

      <p className="astro-diagram-caption">
        Fig. 1 — ASTRO-USA functional flow diagram (ICES-2026-251)
        &nbsp;·&nbsp; Drag to pan &nbsp;·&nbsp; Ctrl + scroll or toolbar to zoom
        &nbsp;·&nbsp; Click any node for details &nbsp;·&nbsp; Use key above to toggle systems
        &nbsp;·&nbsp; Flow button toggles animated overlay
      </p>

      {/* ── Node detail panel ───────────────────────────────────────────── */}
      <aside
        className={`astro-diagram-panel${activeNode ? ' open' : ''}`}
        aria-label="Node details"
        aria-hidden={!activeNode}
        aria-live="polite"
      >
        <button className="astro-diagram-panel-close" onClick={closePanel} aria-label="Close details panel">
          <i className="fas fa-times" aria-hidden="true" />
        </button>
        {activeNode && (
          <>
            <Suspense fallback={<div className="subsystem-3d-loading" aria-hidden="true" />}>
              <AstroSubsystem3D nodeLabel={activeNode} systemId={activeSysId} />
            </Suspense>
            {activeSysKey ? (
              <div
                className="diagram-panel-system-badge"
                style={{ '--badge-bg': activeSysKey.color, '--badge-fg': activeSysKey.textColor }}
              >
                <i className={`fas ${activeSysKey.icon}`} aria-hidden="true" />
                {activeSysKey.label}
              </div>
            ) : (
              <div className="diagram-panel-icon" aria-hidden="true">
                <i className="fas fa-info-circle" />
              </div>
            )}
            <h5 className="diagram-panel-title">{activeNode}</h5>
            <p className="diagram-panel-desc">
              {NODE_DESCRIPTIONS[activeNode] || 'No additional description available for this node.'}
            </p>
          </>
        )}
      </aside>

      {activeNode && (
        <div className="astro-diagram-overlay" onClick={closePanel} aria-hidden="true" />
      )}
    </div>
  );
};

export default AstroFlowDiagram;
