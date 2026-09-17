import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { toCsv, downloadCsv } from './analyticsTheme';
import { useCompactLayout } from '../../../clubpm/layout/compactLayout';

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
  const compact = useCompactLayout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Phones get a readable list of the same numbers the chart plots. A 320px
  // chart cannot carry legible axis labels, and pointing at a series to read a
  // tooltip is a hover interaction — so the data itself is the alternative,
  // not a smaller picture of it. Desktop never shows this control.
  const [showData, setShowData] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();
  const dataId = useId();

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

  const dataColumns = (csv && Array.isArray(csv.columns) ? csv.columns : []).map(c =>
    typeof c === 'string' ? { key: c, label: c } : { label: c.key, ...c }
  );
  const dataRows = csv && Array.isArray(csv.rows) ? csv.rows : [];
  const dataAvailable = dataColumns.length > 0 && dataRows.length > 0;

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

      {compact ? (
        <div className="pm-m-an-view" role="group" aria-label={`${title || 'Chart'} presentation`}>
          <div className="pm-m-segment">
            <button type="button" aria-pressed={!showData} onClick={() => setShowData(false)}>
              Chart
            </button>
            <button
              type="button"
              aria-pressed={showData}
              aria-controls={showData ? dataId : undefined}
              onClick={() => setShowData(true)}
            >
              Data
            </button>
          </div>
        </div>
      ) : null}

      {compact && showData ? (
        <div className="pm-m-an-data" id={dataId}>
          {dataAvailable ? (
            <div className="pm-m-an-table-wrap">
              <table className="pm-m-an-table">
                <caption>{subtitle || title}</caption>
                <thead>
                  <tr>
                    {dataColumns.map(col => <th key={col.key} scope="col">{col.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, i) => (
                    <tr key={row?.id ?? row?.label ?? row?.date ?? i}>
                      {dataColumns.map((col, ci) => {
                        const value = row ? row[col.key] : '';
                        const text = value === null || value === undefined ? '—' : String(value);
                        return ci === 0
                          ? <th key={col.key} scope="row">{text}</th>
                          : <td key={col.key}>{text}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pm-m-an-data-empty">No data in this range yet.</div>
          )}
        </div>
      ) : (
        <div className="pm-an-card-body" style={{ height }}>
          {children}
        </div>
      )}
    </section>
  );
}
