import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Instrument-panel stat tile. Counts up when scrolled into view, and exposes
 * where its number came from.
 *
 * Sourcing every number is the GLOSSARY §7 house rule carried onto the public
 * site: the ARES hardware changes weekly, so a figure whose origin nobody can
 * name is one nobody will dare to update.
 */
export default function AresStat({ value, unit, label, source, decimals = 0 }) {
  const numeric = typeof value === 'number';
  const [shown, setShown] = useState(numeric ? 0 : value);
  const ref = useRef(null);

  useEffect(() => {
    if (!numeric) return undefined;
    if (prefersReducedMotion()) {
      setShown(value);
      return undefined;
    }

    const el = ref.current;
    if (!el) return undefined;

    let raf = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 900);
        // ease-out cubic
        setShown(value * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [numeric, value]);

  const display = numeric
    ? Number(shown).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : shown;

  return (
    <div className="ares-stat" ref={ref}>
      <div className="ares-stat-value">
        {display}
        {unit && <span className="ares-stat-unit">{unit}</span>}
      </div>
      <div className="ares-stat-label">{label}</div>
      {source && (
        <div className="ares-stat-source" title={source}>
          <i className="fas fa-book" aria-hidden="true" />
          <span className="ares-stat-source-text">{source}</span>
        </div>
      )}
    </div>
  );
}
