import React, { useId } from 'react';

/** `range` is a day count; 0 means "all time" (see `resolveWindow` in useAnalyticsData). */
export const RANGE_OPTIONS = [
  { value: 30, label: '30d' },
  { value: 60, label: '60d' },
  { value: 90, label: '90d' },
  { value: 0, label: 'All' },
];

export const BUCKET_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export const DEFAULT_TOOLBAR_VALUE = {
  range: 30,
  bucket: 'week',
  includeSubtasks: true,
  includeArchived: false,
  assigneeId: null,
};

function Segmented({ label, options, value, onSelect }) {
  return (
    <div className="pm-an-toolbar-group">
      <span className="pm-an-toolbar-label">{label}</span>
      <div className="pm-an-seg" role="group" aria-label={label}>
        {options.map(opt => (
          <button
            key={String(opt.value)}
            type="button"
            className={`pm-an-seg-btn${opt.value === value ? ' is-active' : ''}`}
            aria-pressed={opt.value === value}
            onClick={() => onSelect(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onToggle }) {
  return (
    <label className="pm-an-toggle">
      <input type="checkbox" checked={checked} onChange={e => onToggle(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/**
 * Fully controlled: every control reads from `value` and reports a whole merged object
 * back through `onChange`. Persistence is deliberately not here — `ProjectAnalytics`
 * owns the localStorage round-trip so there is exactly one writer.
 *
 * `members` is the project's member list (`[{ id, displayName | name }]`).
 */
export default function AnalyticsToolbar({ value, onChange, members = [] }) {
  const current = { ...DEFAULT_TOOLBAR_VALUE, ...(value || {}) };
  const assigneeId = useId();

  const set = patch => {
    if (typeof onChange === 'function') onChange({ ...current, ...patch });
  };

  return (
    <div className="pm-an-toolbar">
      <Segmented
        label="Range"
        options={RANGE_OPTIONS}
        value={current.range}
        onSelect={range => set({ range })}
      />

      <Segmented
        label="Bucket"
        options={BUCKET_OPTIONS}
        value={current.bucket}
        onSelect={bucket => set({ bucket })}
      />

      <div className="pm-an-toolbar-group">
        <Toggle
          label="Include subtasks"
          checked={current.includeSubtasks !== false}
          onToggle={includeSubtasks => set({ includeSubtasks })}
        />
        <Toggle
          label="Include archived"
          checked={current.includeArchived === true}
          onToggle={includeArchived => set({ includeArchived })}
        />
      </div>

      <div className="pm-an-toolbar-group">
        <label className="pm-an-toolbar-label" htmlFor={assigneeId}>
          Assignee
        </label>
        <select
          id={assigneeId}
          className="pm-an-select"
          value={current.assigneeId || ''}
          onChange={e => set({ assigneeId: e.target.value || null })}
        >
          <option value="">All assignees</option>
          {members.map(member => {
            // getProject returns Member[]; a ProjectMember join row nests it.
            const m = member && member.member ? member.member : member;
            if (!m || !m.id) return null;
            return (
              <option key={m.id} value={m.id}>
                {m.displayName || m.name || 'Member'}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
