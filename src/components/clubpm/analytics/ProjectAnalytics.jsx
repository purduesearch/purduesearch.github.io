import React, { useCallback, useEffect, useRef, useState } from 'react';
import ErrorBoundary from '../ErrorBoundary';
import useAnalyticsData from './useAnalyticsData';
import AnalyticsToolbar, { DEFAULT_TOOLBAR_VALUE } from './AnalyticsToolbar';
import KpiStrip from './KpiStrip';
import BurndownCard from './cards/BurndownCard';
import CumulativeFlowCard from './cards/CumulativeFlowCard';
import VelocityCard from './cards/VelocityCard';
import ThroughputCard from './cards/ThroughputCard';
import StatusBreakdownCard from './cards/StatusBreakdownCard';
import AssigneeWorkloadCard from './cards/AssigneeWorkloadCard';
import PriorityAgingCard from './cards/PriorityAgingCard';
import RiskRadarCard from './cards/RiskRadarCard';

const STORAGE_PREFIX = 'clubpm:analytics:';

/**
 * The tab opens on 90 days: a 30-day window on a club project — where a member may
 * touch a task once a fortnight — routinely shows two velocity bars and reads as a
 * broken chart. The toolbar's own `DEFAULT_TOOLBAR_VALUE` supplies every other key so
 * a control added there later cannot silently arrive here as `undefined`.
 */
export const DEFAULT_OPTIONS = Object.freeze({
  ...DEFAULT_TOOLBAR_VALUE,
  range: 90,
  bucket: 'week',
  includeSubtasks: true,
  includeArchived: false,
  assigneeId: null,
});

const VALID_RANGES = [30, 60, 90, 0];
const VALID_BUCKETS = ['week', 'month'];

/**
 * Persisted state is untrusted input: it can be a key written by an older release
 * whose range values no longer exist, or hand-edited. Each field is validated
 * individually and anything unrecognised falls back to the default rather than
 * poisoning the whole restore.
 */
function sanitizeOptions(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_OPTIONS };
  return {
    ...DEFAULT_OPTIONS,
    range: VALID_RANGES.includes(raw.range) ? raw.range : DEFAULT_OPTIONS.range,
    bucket: VALID_BUCKETS.includes(raw.bucket) ? raw.bucket : DEFAULT_OPTIONS.bucket,
    includeSubtasks:
      typeof raw.includeSubtasks === 'boolean'
        ? raw.includeSubtasks
        : DEFAULT_OPTIONS.includeSubtasks,
    includeArchived:
      typeof raw.includeArchived === 'boolean'
        ? raw.includeArchived
        : DEFAULT_OPTIONS.includeArchived,
    assigneeId: typeof raw.assigneeId === 'string' && raw.assigneeId ? raw.assigneeId : null,
  };
}

/**
 * Read once, lazily, as the `useState` initializer.
 *
 * `localStorage` is touched inside try/catch because *access itself* throws in a
 * private window or with site data blocked — it does not merely return `null` — and an
 * exception in a state initializer would take the whole Reports tab down.
 */
function readStored(projectId) {
  if (!projectId || typeof window === 'undefined') return { ...DEFAULT_OPTIONS };
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + projectId);
    return sanitizeOptions(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

function AnalyticsBody({ project, onOpenTask }) {
  const projectId = project?.id;
  const [options, setOptions] = useState(() => readStored(projectId));

  // Switching projects inside the same mounted tab has to re-read that project's key;
  // the initializer only runs once.
  const loadedFor = useRef(projectId);
  useEffect(() => {
    if (loadedFor.current === projectId) return;
    loadedFor.current = projectId;
    setOptions(readStored(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(options));
    } catch {
      // Storage is full, blocked, or unavailable. The toolbar still works for this
      // session; only the persistence is lost, which is not worth surfacing.
    }
  }, [projectId, options]);

  const handleChange = useCallback(next => {
    setOptions(sanitizeOptions(next));
  }, []);

  // The single derivation for the whole tab. Every card is handed a finished slice —
  // no card re-filters or re-buckets, which is what keeps the eight of them agreeing.
  const analytics = useAnalyticsData(project, options);

  return (
    <div className="pm-an-root">
      <AnalyticsToolbar
        value={options}
        onChange={handleChange}
        members={project?.members ?? []}
      />

      <KpiStrip kpis={analytics.kpis} />

      <div className="pm-an-grid">
        <BurndownCard data={analytics.burndown} />
        <CumulativeFlowCard data={analytics.cumulativeFlow} />
        <VelocityCard data={analytics.velocity} />
        <ThroughputCard data={analytics.throughput} />
        {/* The donut switches between three dimensions, so it takes the whole object. */}
        <StatusBreakdownCard data={analytics} />
        <AssigneeWorkloadCard data={analytics.workload} />
        <PriorityAgingCard data={analytics.aging} />
        <RiskRadarCard data={analytics.risk} onOpenTask={onOpenTask} />
      </div>
    </div>
  );
}

/**
 * The Reports → Charts tab.
 *
 * Wrapped in the ClubPM `ErrorBoundary` so a single card throwing on a malformed task
 * degrades to one "Something went wrong" panel instead of blanking the tab — these
 * charts read live project data whose shape varies with what the API happened to
 * include.
 */
export default function ProjectAnalytics({ project, onOpenTask }) {
  return (
    <ErrorBoundary>
      <AnalyticsBody project={project} onOpenTask={onOpenTask} />
    </ErrorBoundary>
  );
}
