/**
 * analyticsTheme — the ONLY file in the Reports tab where a chart color is written.
 *
 * recharts cannot consume `var(--pm-accent-teal)` in every prop position (stroke on an
 * SVG element is fine; a gradient stop or a canvas-bound fill is not), so the ClubPM
 * tokens are resolved to concrete strings once via `getComputedStyle` and memoized.
 * Every value has a hex fallback matching the token's declared value in
 * `public/clubpm-theme.css`, so a card still renders correctly when the theme
 * stylesheet has not landed yet or `.clubpm-app` is not mounted.
 */

// Fallbacks are the literal token values from clubpm-theme.css (~line 642).
const FALLBACKS = {
  teal: '#00e5cc',
  amber: '#f5a623',
  coral: '#ff6b6b',
  violet: '#8b7cf8',
  textMuted: '#4a5568',
  textSecondary: '#8892a4',
  border: 'rgba(255,255,255,0.07)',
  surface: '#13161e',
  elevated: '#1a1e2a',
  textPrimary: '#f0f2f7',
};

const TOKEN_NAMES = {
  teal: '--pm-accent-teal',
  amber: '--pm-accent-amber',
  coral: '--pm-accent-coral',
  violet: '--pm-accent-violet',
  textMuted: '--pm-text-muted',
  textSecondary: '--pm-text-secondary',
  border: '--pm-border',
  surface: '--pm-bg-surface',
  elevated: '--pm-bg-elevated',
  textPrimary: '--pm-text-primary',
};

let cached = null;

/**
 * Resolved token values. Read off `.clubpm-app` (where the ClubPM tokens are scoped
 * for consumers) and falling back to `<html>` and then to the hex table. Memoized —
 * charts re-render constantly and `getComputedStyle` forces style resolution.
 */
export function getThemeColors() {
  if (cached) return cached;

  let styles = null;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const host = document.querySelector('.clubpm-app') || document.documentElement;
    if (host) {
      try {
        styles = window.getComputedStyle(host);
      } catch {
        styles = null;
      }
    }
  }

  const read = key => {
    if (!styles) return FALLBACKS[key];
    const value = styles.getPropertyValue(TOKEN_NAMES[key]);
    const trimmed = value && value.trim();
    return trimmed || FALLBACKS[key];
  };

  const colors = {};
  Object.keys(TOKEN_NAMES).forEach(key => { colors[key] = read(key); });

  // Only memoize a resolution that actually saw the theme; otherwise a chart that
  // mounted before clubpm-theme.css loaded would pin fallbacks for the session.
  if (styles) cached = colors;
  return colors;
}

/** Test/HMR escape hatch — drops the memoized resolution. */
export function resetThemeColors() {
  cached = null;
}

/**
 * Lazily-resolved color map: each key reads the live token the first time it is
 * touched, so a map declared at module load still picks up the theme once
 * `clubpm-theme.css` has landed.
 */
function tokenMap(spec) {
  const out = {};
  Object.entries(spec).forEach(([key, token]) => {
    Object.defineProperty(out, key, {
      enumerable: true,
      get: () => (typeof token === 'function' ? token(getThemeColors()) : getThemeColors()[token]),
    });
  });
  return out;
}

/**
 * Ordered categorical ramp for arbitrary series (assignees, tags, anything without a
 * semantic color). Fixed order so the same series keeps the same color across renders.
 * The five off-token hues have no ClubPM variable; they exist only here.
 */
export function categoricalColors() {
  const c = getThemeColors();
  return [
    c.teal, c.amber, c.violet, c.coral, '#4dabf7',
    '#63e6be', '#ffd43b', '#ff922b', '#e599f7', c.textSecondary,
  ];
}

/**
 * Static ordered ramp, in the same order, for the (rare) caller that needs the array
 * as a plain constant. Built from the hex fallbacks so it is safe at module load;
 * prefer `categoricalColors()` / `categorical(i)`, which read the live tokens.
 */
export const CATEGORICAL = Object.freeze([
  FALLBACKS.teal, FALLBACKS.amber, FALLBACKS.violet, FALLBACKS.coral, '#4dabf7',
  '#63e6be', '#ffd43b', '#ff922b', '#e599f7', FALLBACKS.textSecondary,
]);

/** Pick a categorical color by index; wraps rather than running out. */
export function categorical(index) {
  const ramp = categoricalColors();
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ramp[((i % ramp.length) + ramp.length) % ramp.length];
}

/** Semantic, keyed by `TaskStatus`. */
export const STATUS_COLORS = tokenMap({
  TODO: 'textSecondary',
  IN_PROGRESS: 'amber',
  BLOCKED: 'coral',
  DONE: 'teal',
});

/** Semantic, keyed by `Priority`. */
export const PRIORITY_COLORS = tokenMap({
  LOW: 'textSecondary',
  MEDIUM: 'teal',
  HIGH: 'amber',
  CRITICAL: 'coral',
});

/** Risk bands from `computeRisk().band`. */
export const BAND_COLORS = tokenMap({
  healthy: 'teal',
  watch: 'amber',
  'at-risk': 'coral',
  critical: () => '#e03131',
});

// ── spreadable recharts props ────────────────────────────────────────────────
// Cards spread these rather than re-declaring axis/grid/tooltip styling, so the
// whole tab stays one visual system.

export function axisProps(overrides = {}) {
  const c = getThemeColors();
  return {
    stroke: c.border,
    tick: { fill: c.textSecondary, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: c.border },
    ...overrides,
  };
}

export function gridProps(overrides = {}) {
  const c = getThemeColors();
  return {
    stroke: c.border,
    strokeDasharray: '3 3',
    vertical: false,
    ...overrides,
  };
}

export function tooltipProps(overrides = {}) {
  const c = getThemeColors();
  return {
    cursor: { fill: 'rgba(255,255,255,0.04)', stroke: c.border },
    contentStyle: {
      background: c.elevated,
      border: `1px solid ${c.border}`,
      borderRadius: 8,
      color: c.textPrimary,
      fontSize: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    },
    labelStyle: { color: c.textSecondary, fontSize: 11, marginBottom: 4 },
    itemStyle: { color: c.textPrimary, fontSize: 12 },
    ...overrides,
  };
}

export function legendProps(overrides = {}) {
  const c = getThemeColors();
  return {
    iconType: 'circle',
    iconSize: 8,
    wrapperStyle: { fontSize: 11, color: c.textSecondary, paddingTop: 8 },
    ...overrides,
  };
}

// ── CSV export ───────────────────────────────────────────────────────────────

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote whenever the cell could break the row apart, and double any inner quote.
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * `columns` is `[{ key, label? }]` or plain strings. Rows are read by key, so a card
 * hands over the exact array it charted without reshaping it.
 */
export function toCsv(rows = [], columns = []) {
  const cols = columns.map(c => (typeof c === 'string' ? { key: c, label: c } : { label: c.key, ...c }));
  if (!cols.length) return '';
  const header = cols.map(c => escapeCell(c.label)).join(',');
  const body = (Array.isArray(rows) ? rows : []).map(row =>
    cols.map(c => escapeCell(row ? row[c.key] : '')).join(',')
  );
  return [header, ...body].join('\r\n');
}

/** Blob URL + synthetic `<a download>`; the URL is revoked on the next tick. */
export function downloadCsv(filename, csv) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
