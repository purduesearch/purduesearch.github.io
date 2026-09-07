import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { toCsv, downloadCsv } from './analyticsTheme';

const CHART_TYPE_LABELS = {
  area: 'Area',
  line: 'Line',
  bar: 'Bar',
  stacked: 'Stacked',
  pie: 'Pie',
  donut: 'Donut',
  radar: 'Radar',
  scatter: 'Scatter',
};

const CHART_TYPE_ICONS = {
  area: 'fa-chart-area',
  line: 'fa-chart-line',
  bar: 'fa-chart-column',
  stacked: 'fa-layer-group',
  pie: 'fa-chart-pie',
  donut: 'fa-circle-notch',
  radar: 'fa-bullseye',
  scatter: 'fa-braille',
};

/** Firefox has `navigator.clipboard.write` but no `ClipboardItem`; feature-detect both. */
function canCopyImage() {
  return (
    typeof window !== 'undefined' &&
    typeof window.ClipboardItem === 'function' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === 'function'
  );
}

/**
 * Serialize the card's chart `<svg>` into a PNG blob. recharts renders its styling as
 * inline attributes rather than external CSS, so a plain XMLSerializer round-trip keeps
 * the chart's appearance; only the transparent background needs painting in by hand.
 */
async function svgToPngBlob(svg) {
  const clone = svg.cloneNode(true);
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || Number(svg.getAttribute('width')) || 600));
  const height = Math.max(1, Math.round(rect.height || Number(svg.getAttribute('height')) || 300));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const source = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not rasterize the chart.'));
    img.src = url;
  });

  const scale = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#13161e';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      'image/png'
    );
  });
}

/**
 * The shell every analytics card renders inside: header, overflow menu (chart type,
 * copy-as-PNG, CSV export) and a fixed-height chart slot. Cards pass their own rows in
 * via `csv` so the export always matches what is on screen.
 */
export default function AnalyticsCard({
  title,
  subtitle,
  chartTypes,
  chartType,
  onChartTypeChange,
  headerAside,
  csv,
  height = 240,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  const types = Array.isArray(chartTypes) ? chartTypes : [];
  const showChartTypes = types.length >= 2 && typeof onChartTypeChange === 'function';
  const copyable = canCopyImage();

  const closeMenu = useCallback(({ refocus = false } = {}) => {
    setMenuOpen(false);
    if (refocus && triggerRef.current) triggerRef.current.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKeyDown = e => {
      if (e.key === 'Escape') {
        // Stop here rather than letting the tab or a parent modal also react.
        e.stopPropagation();
        closeMenu({ refocus: true });
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  const handleCopyPng = async () => {
    closeMenu();
    if (!copyable || busy) return;
    setBusy(true);
    try {
      const svg = rootRef.current && rootRef.current.querySelector('.pm-an-card-body svg');
      if (!svg) throw new Error('There is no chart to copy.');
      const blob = await svgToPngBlob(svg);
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      toast.success('Chart copied to clipboard');
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Could not copy the chart.');
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    closeMenu();
    try {
      if (!csv || !Array.isArray(csv.rows) || !csv.rows.length) {
        toast.error('There is no data to export.');
        return;
      }
      downloadCsv(csv.filename || `${title || 'analytics'}.csv`, toCsv(csv.rows, csv.columns || []));
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Could not export the CSV.');
    }
  };

  return (
    <section className="pm-an-card" ref={rootRef}>
      <header className="pm-an-card-head">
        <div>
          <h3 className="pm-an-card-title">{title}</h3>
          {subtitle ? <p className="pm-an-card-sub">{subtitle}</p> : null}
        </div>

        {/* Controls that change what the chart *means* (a metric switcher, say) belong
            here rather than buried in the overflow menu, where the reader would have no
            standing cue that the axis is showing hours instead of tasks. */}
        {headerAside ? <div className="pm-an-card-aside">{headerAside}</div> : null}

        <button
          type="button"
          ref={triggerRef}
          className="pm-an-card-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-label={`${title || 'Chart'} options`}
          onClick={() => setMenuOpen(open => !open)}
        >
          <i className="fas fa-ellipsis" aria-hidden="true" />
        </button>

        {menuOpen ? (
          <div className="pm-an-card-menu" id={menuId} role="menu">
            {showChartTypes
              ? types.map(type => (
                  <button
                    key={type}
                    type="button"
                    role="menuitemradio"
                    aria-checked={chartType === type}
                    className="pm-an-card-menu-item"
                    onClick={() => {
                      onChartTypeChange(type);
                      closeMenu({ refocus: true });
                    }}
                  >
                    <i
                      className={`fas ${CHART_TYPE_ICONS[type] || 'fa-chart-simple'}`}
                      aria-hidden="true"
                    />
                    <span>{CHART_TYPE_LABELS[type] || type}</span>
                    {chartType === type ? <i className="fas fa-check" aria-hidden="true" /> : null}
                  </button>
                ))
              : null}

            <button
              type="button"
              role="menuitem"
              className="pm-an-card-menu-item"
              disabled={!copyable || busy}
              title={
                copyable
                  ? undefined
                  : 'This browser cannot write images to the clipboard (Firefox). Export the CSV instead.'
              }
              onClick={handleCopyPng}
            >
              <i className="fas fa-image" aria-hidden="true" />
              <span>Copy as PNG</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="pm-an-card-menu-item"
              disabled={!csv}
              title={csv ? undefined : 'This card has no exportable rows.'}
              onClick={handleExportCsv}
            >
              <i className="fas fa-file-csv" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          </div>
        ) : null}
      </header>

      <div className="pm-an-card-body" style={{ height }}>
        {children}
      </div>
    </section>
  );
}
