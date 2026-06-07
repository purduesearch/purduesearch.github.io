// Hand-rolled SVG 52×7 GitHub-style heatmap. Driven by `data` of [{ date: "YYYY-MM-DD", xp: number }].
// Intensity scale: 0 (no XP), 1 (1-49), 2 (50-99), 3 (100-199), 4 (200+).
//
// Cells whose date is also in the `activity` array (days the streak was "kept")
// get a flame-colored outline so daily activity + XP history live in one chart.

const CELL = 11;
const GAP  = 2;
const WEEKS = 52;
const STREAK_STROKE = '#ff8c3a';

function intensityFor(xp) {
  if (xp <= 0)   return 0;
  if (xp < 50)   return 1;
  if (xp < 100)  return 2;
  if (xp < 200)  return 3;
  return 4;
}

function isoDayKey(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString().slice(0, 10);
}

export default function XpHeatmap({ data = [], activity = [] }) {
  // Build a 52-week × 7-day grid ending today
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const xpLookup = new Map(data.map(d => [d.date, d.xp]));

  // Activity lookup — days when at least one action happened (streak kept).
  const activitySet = new Set();
  for (const row of activity) {
    if (!row?.date) continue;
    const dt = new Date(row.date);
    if (Number.isNaN(dt.getTime())) continue;
    if ((row.actionCount ?? 0) > 0 || row.xp > 0) {
      activitySet.add(isoDayKey(dt));
    }
  }

  const cells = [];
  for (let w = WEEKS - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(today);
      dt.setUTCDate(today.getUTCDate() - (w * 7 + (6 - d)));
      const key = dt.toISOString().slice(0, 10);
      const xp  = xpLookup.get(key) ?? 0;
      const keptStreak = activitySet.has(key);
      cells.push({
        x: (WEEKS - 1 - w) * (CELL + GAP),
        y: d * (CELL + GAP),
        xp,
        intensity: intensityFor(xp),
        date: key,
        keptStreak,
      });
    }
  }

  const width  = WEEKS * (CELL + GAP);
  const height = 7 * (CELL + GAP);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Daily activity over the past year"
    >
      {cells.map(c => (
        <rect
          key={c.date}
          className={`cpm-heatmap-cell${c.keptStreak ? ' cpm-heatmap-cell--kept' : ''}`}
          data-intensity={c.intensity}
          x={c.x}
          y={c.y}
          width={CELL}
          height={CELL}
          rx={2}
          stroke={c.keptStreak ? STREAK_STROKE : 'none'}
          strokeWidth={c.keptStreak ? 1.4 : 0}
        >
          <title>
            {`${c.date}: ${c.xp} XP${c.keptStreak ? ' · streak kept' : ''}`}
          </title>
        </rect>
      ))}
    </svg>
  );
}
