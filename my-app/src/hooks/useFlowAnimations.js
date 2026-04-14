import { useCallback, useEffect, useRef } from 'react';
import { gsap } from 'gsap';

// All unique edge stroke colors found in the diagram XML (lowercase)
const FLOW_TYPES = {
  '#000000': 'structural',
  '#0000ff': 'water',
  '#009900': 'bio-gas',
  '#00cc00': 'gas',
  '#00cccc': 'cryo',
  '#00ffff': 'aqua',
  '#67ab9f': 'hydro-bio',
  '#97d077': 'plant',
  '#a680b8': 'myco',
  '#a8201a': 'fire-alarm',
  '#b3b3b3': 'control',
  '#cccc00': 'power',
  '#e6d0de': 'airlock',
  '#ff0000': 'fire',
  '#ff0080': 'alternate',
  '#ff8000': 'waste',
  '#ffcccc': 'fire-soft',
  '#ffd966': 'hvac',
};

// Uniform flow speed: every path moves at the same px/s regardless of length or type.
// Duration is computed per path so short and long edges appear to flow at the same rate.
const FLOW_SPEED = 50; // px per second

// Per-type easing preserves the physical character of each flow (pulsing alarms,
// smooth gases, stepped power signals) while keeping speed uniform.
const FLOW_EASING = {
  structural:   'none',
  water:        'none',
  'bio-gas':    'power1.inOut',
  gas:          'power1.inOut',
  cryo:         'sine.inOut',
  aqua:         'sine.inOut',
  'hydro-bio':  'none',
  plant:        'power1.inOut',
  myco:         'sine.inOut',
  'fire-alarm': 'steps(2)',
  control:      'steps(1)',
  power:        'steps(2)',
  airlock:      'sine.inOut',
  fire:         'none',
  alternate:    'none',
  waste:        'none',
  'fire-soft':  'none',
  hvac:         'sine.inOut',
};

function makeFlowConfig(flowType, len) {
  const duration = Math.max(2, len / FLOW_SPEED);
  const ease     = FLOW_EASING[flowType] ?? 'none';
  const base     = { strokeDashoffset: `-=${len}`, duration, ease, repeat: -1 };
  // Discrete/pulsing flows get their characteristic repeatDelay preserved
  if (flowType === 'fire-alarm') return { ...base, ease: 'steps(2)', repeatDelay: 0.6 };
  if (flowType === 'control')    return { ...base, ease: 'steps(1)', repeatDelay: 1.2 };
  if (flowType === 'power')      return { ...base, ease: 'steps(2)', repeatDelay: 0.8 };
  return base;
}

/**
 * Injects a single SVG <marker> element into <defs> for use as a directional
 * arrowhead on every animated flow overlay path. Idempotent.
 */
function ensureFlowArrows(svg) {
  if (svg.querySelector('marker.flow-arrow-marker')) return;

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'flow-arrow');
  marker.setAttribute('class', 'flow-arrow-marker');
  marker.setAttribute('markerWidth', '5');
  marker.setAttribute('markerHeight', '5');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '2.5');
  marker.setAttribute('orient', 'auto');

  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M0,0 L5,2.5 L0,5 z');
  arrowPath.setAttribute('fill', 'context-stroke');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
}

/**
 * Adds directional flow animations as semi-transparent overlay clones on top of
 * the solid mxGraph edge paths.
 *
 * Design: each qualifying edge path is left unchanged (solid, fully opaque).
 * A cloned copy with strokeDasharray + animated strokeDashoffset is inserted
 * on top at opacity 0.75, providing a "flow direction" cue without obscuring
 * the underlying connection structure. This eliminates the visual whiplash of
 * having only dashed lines where solid lines are expected.
 *
 * The animated overlay layer can be toggled on/off via the `flowEnabled` param.
 *
 * Performance features (unchanged from original):
 *  - IntersectionObserver pauses all tweens when the diagram is off-screen.
 *  - visibilitychange listener pauses tweens when the tab is hidden.
 *  - MutationObserver on the SVG subtree rebuilds when mxGraph repaints paths.
 *    The observer is disconnected during DOM manipulation to prevent loops.
 *  - offSystems effect pauses tweens whose original (base) paths are dimmed.
 *
 * @param {React.RefObject} graphRef   - ref holding the live mxGraph instance
 * @param {boolean}                isLoaded   - true once the XML has been decoded
 * @param {string[]}               offSystems - system IDs currently toggled off
 * @param {boolean}                flowEnabled - whether the animated overlay is shown
 * @returns {Function} buildAnimations - call to rebuild on demand (e.g. after zoom)
 */
export function useFlowAnimations(graphRef, isLoaded, offSystems, flowEnabled = true) {
  // Map<originalPath, { tween }> — keyed on originals so offSystems opacity check works
  const animsRef       = useRef(new Map());
  const ctxRef         = useRef(null);
  const svgObserverRef = useRef(null);
  // Cloned overlay paths currently in the SVG; tracked for cleanup
  const clonesRef      = useRef([]);
  // Mutable ref keeps flowEnabled readable in buildAnimations without stale closure
  const flowEnabledRef = useRef(flowEnabled);
  useEffect(() => { flowEnabledRef.current = flowEnabled; }, [flowEnabled]);

  const buildAnimations = useCallback(() => {
    const container = graphRef.current?.container;
    if (!container) return;

    // Disconnect the SVG MutationObserver before any DOM changes to prevent
    // the clone removal/insertion from triggering an infinite rebuild loop.
    const obs = svgObserverRef.current;
    if (obs) obs.disconnect();

    try {
      // --- Clean up previous state ---
      ctxRef.current?.revert();
      animsRef.current.clear();
      clonesRef.current.forEach(clone => clone.parentNode?.removeChild(clone));
      clonesRef.current = [];

      if (!flowEnabledRef.current) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const svg = container.querySelector('svg');
      if (!svg) return;

      // Inject directional arrow marker into <defs> (idempotent)
      ensureFlowArrows(svg);

      ctxRef.current = gsap.context(() => {
        svg.querySelectorAll('path[stroke]').forEach(path => {
          const stroke   = path.getAttribute('stroke')?.toLowerCase().trim();
          const flowType = FLOW_TYPES[stroke];
          if (!flowType) return;

          // Skip arrowhead stubs (tiny length) and halo/fill paths
          const len  = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
          if (!Number.isFinite(len) || len < 10) return;
          const fill = path.getAttribute('fill');
          if (fill && fill !== 'none') return;

          // Leave the original path solid and fully opaque — it always shows
          // the connection structure clearly regardless of animation state.
          // The animated overlay is a semi-transparent clone inserted above it.
          const clone = path.cloneNode(false);
          clone.style.strokeDasharray  = '6 16';
          clone.style.strokeDashoffset = '0';
          clone.style.opacity          = '0.75';
          clone.style.pointerEvents    = 'none';
          clone.removeAttribute('id');
          clone.setAttribute('marker-end', 'url(#flow-arrow)');
          // Append at the end of the parent group so the clone paints on top.
          path.parentNode?.appendChild(clone);
          clonesRef.current.push(clone);

          const tween = gsap.to(clone, makeFlowConfig(flowType, len));
          // Key on original path so the offSystems effect can read its mxGraph opacity.
          animsRef.current.set(path, { tween });
        });
      }, container);
    } finally {
      // Always reconnect the observer after DOM changes are complete.
      if (obs) {
        const svg = container.querySelector('svg');
        if (svg) obs.observe(svg, { childList: true, subtree: true });
      }
    }
  }, [graphRef]);

  // Build once when diagram finishes loading; register pause-on-hide observers
  // and a MutationObserver that rebuilds when mxGraph repaints SVG paths.
  useEffect(() => {
    if (!isLoaded) return;

    buildAnimations();

    const container = graphRef.current?.container;
    if (!container) return;

    // Capture stable references — buildAnimations calls .clear() in-place,
    // never replaces animsRef.current itself.
    const animsMap = animsRef.current;
    const ctx      = ctxRef;

    // Pause tweens when diagram scrolls out of view
    const observer = new IntersectionObserver(
      ([entry]) => {
        animsMap.forEach(({ tween }) =>
          entry.isIntersecting ? tween.resume() : tween.pause()
        );
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    // Pause tweens when tab is hidden
    const onVis = () =>
      animsMap.forEach(({ tween }) =>
        document.hidden ? tween.pause() : tween.resume()
      );
    document.addEventListener('visibilitychange', onVis);

    // Rebuild animations when mxGraph repaints the SVG (zoom/fit/pan causes
    // path elements to be recreated, invalidating old GSAP references).
    let debounceTimer = null;
    const svgObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => buildAnimations(), 200);
    });
    const svg = container.querySelector('svg');
    if (svg) {
      svgObserver.observe(svg, { childList: true, subtree: true });
      svgObserverRef.current = svgObserver;
    }

    return () => {
      observer.disconnect();
      svgObserverRef.current = null;
      svgObserver.disconnect();
      clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVis);
      ctx.current?.revert();
      animsMap.clear();
      clonesRef.current.forEach(clone => clone.parentNode?.removeChild(clone));
      clonesRef.current = [];
    };
  }, [isLoaded, buildAnimations, graphRef]);

  // Rebuild when flowEnabled changes (flowEnabledRef is already updated by that point)
  useEffect(() => {
    if (!isLoaded) return;
    buildAnimations();
  }, [flowEnabled, isLoaded, buildAnimations]);

  // After each system toggle, wait one rAF for mxGraph to apply opacity styles,
  // then pause tweens whose original (base) paths have been dimmed (opacity < 0.5).
  useEffect(() => {
    const anims = animsRef.current;
    if (!anims.size) return;
    const raf = requestAnimationFrame(() => {
      anims.forEach(({ tween }, origPath) => {
        const opacity = parseFloat(
          origPath.style.opacity || origPath.getAttribute('opacity') || '1'
        );
        opacity < 0.5 ? tween.pause() : tween.resume();
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [offSystems]);

  return buildAnimations;
}
