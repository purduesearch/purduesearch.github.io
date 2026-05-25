import { useCallback, useState } from 'react';
import { get } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// Built-in defaults when no metric data exists for a platform.
// Format: { dayOfWeek (0=Sun), hour }
const DEFAULTS = {
  instagram:  { day: 3, hour: 11 },  // Wed 11 AM
  linkedin:   { day: 2, hour:  9 },  // Tue 9 AM
  twitter:    { day: 4, hour: 12 },  // Thu noon
  newsletter: { day: 2, hour:  7 },  // Tue 7 AM
  website:    { day: 1, hour: 10 },  // Mon 10 AM
};

/**
 * Project a (dayOfWeek, hour) cell to the next future Date matching it,
 * starting from "from". Returns a Date >= now() at the requested day/hour.
 */
function projectToNextOccurrence(day, hour, from = new Date()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setHours(hour);

  let dayDiff = (day - d.getDay() + 7) % 7;
  // If the projected slot is already in the past today, push to next week
  if (dayDiff === 0 && d.getTime() <= from.getTime()) {
    dayDiff = 7;
  }
  d.setDate(d.getDate() + dayDiff);
  return d;
}

/**
 * Local <input type="datetime-local"> value format: YYYY-MM-DDTHH:MM
 */
function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * useSuggestBestTime — hook returning { suggest, suggesting, lastInfo }
 *
 * suggest(selectedPlatforms): Promise<string>
 *   Returns a datetime-local input value (or "" if nothing reasonable).
 *   Side effect: sets `lastInfo` with the explanation string.
 *
 * Strategy:
 *   - Fetch /api/outreach/insights/best-times once and cache.
 *   - For each selected platform, look up the highest-engagement cell.
 *   - Across all selected platforms, pick the cell with the highest avg.
 *   - If none of the platforms has metric data, fall back to DEFAULTS.
 */
export default function useSuggestBestTime() {
  const [suggesting, setSuggesting] = useState(false);
  const [lastInfo, setLastInfo]     = useState(null);
  const [cache, setCache]           = useState(null);

  const suggest = useCallback(async (selectedPlatforms) => {
    const platforms = (selectedPlatforms ?? []).filter(Boolean);
    if (platforms.length === 0) {
      toast.error('Pick a platform first');
      return '';
    }
    setSuggesting(true);
    try {
      let times = cache;
      if (!times) {
        times = await get('/api/outreach/insights/best-times');
        setCache(times);
      }

      // Find best cell across selected platforms (any with data)
      let bestPlatform = null;
      let bestCell = null;       // { day, hour, avgEngagement }
      let totalSamples = 0;

      for (const p of platforms) {
        const cells = times?.[p] ?? [];
        if (cells.length === 0) continue;
        totalSamples += cells.length;
        const top = cells.reduce((a, b) => b.avgEngagement > a.avgEngagement ? b : a);
        if (!bestCell || top.avgEngagement > bestCell.avgEngagement) {
          bestCell = top;
          bestPlatform = p;
        }
      }

      let projected;
      let info;
      if (bestCell) {
        projected = projectToNextOccurrence(bestCell.day, bestCell.hour);
        info = `Suggested for ${bestPlatform} based on ${totalSamples} data point(s) (avg ${bestCell.avgEngagement} eng)`;
      } else {
        // Fallback: use the first selected platform that has a default
        const p = platforms.find(x => DEFAULTS[x]) ?? platforms[0];
        const d = DEFAULTS[p] ?? DEFAULTS.instagram;
        projected = projectToNextOccurrence(d.day, d.hour);
        info = `Suggested from built-in defaults — no metric history yet for ${platforms.join('/')}`;
      }

      const value = toLocalInputValue(projected);
      setLastInfo(info);
      return value;
    } catch (err) {
      toast.error('Failed to suggest best time');
      return '';
    } finally {
      setSuggesting(false);
    }
  }, [cache]);

  return { suggest, suggesting, lastInfo };
}
