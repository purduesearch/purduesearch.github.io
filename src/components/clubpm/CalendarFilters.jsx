// Client-side filter bar for the global Calendar page. Filters the already-
// fetched event list (no extra round-trip). Selecting nothing = "all".
//
// Filter shape (read by CalendarPage):
//   { projectIds: Set<string>, memberIds: Set<string>, types: Set<string>,
//     showTaskDeadlines: boolean }

const EVENT_TYPES = ['MEETING', 'DEADLINE', 'WORKSHOP', 'SOCIAL', 'OTHER'];

const TYPE_COLOR = {
  MEETING:  'var(--clubpm-accent-cyan, #00cec9)',
  DEADLINE: 'var(--clubpm-accent-red, #e17055)',
  WORKSHOP: 'var(--clubpm-accent-yellow, #fdcb6e)',
  SOCIAL:   '#a29bfe',
  OTHER:    'var(--clubpm-text-muted, #636e72)',
};

function toggleInSet(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

function MultiSelect({ label, options, getId, getLabel, selected, onChange, emptyHint }) {
  const empty = selected.size === 0;
  return (
    <details
      style={{
        background: 'var(--clubpm-surface-200)',
        border: '1px solid var(--clubpm-border)',
        borderRadius: 8,
        padding: '4px 8px',
        minWidth: 180,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--clubpm-text-secondary)',
          padding: '4px 2px',
          listStyle: 'none',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--clubpm-text-primary)' }}>{label}: </span>
        {empty ? (emptyHint ?? 'All') : `${selected.size} selected`}
      </summary>
      <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 6, paddingTop: 4, borderTop: '1px solid var(--clubpm-border)' }}>
        {options.map(opt => {
          const id = getId(opt);
          const checked = selected.has(id);
          return (
            <label
              key={id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 2px',
                fontSize: 12, color: 'var(--clubpm-text-primary)', cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(toggleInSet(selected, id))}
              />
              {getLabel(opt)}
            </label>
          );
        })}
      </div>
    </details>
  );
}

export default function CalendarFilters({ projects, members, filters, onChange }) {
  function patch(part) { onChange({ ...filters, ...part }); }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        marginBottom: 12,
        background: 'var(--clubpm-surface-100)',
        border: '1px solid var(--clubpm-border)',
        borderRadius: 10,
      }}
    >
      <MultiSelect
        label="Project"
        options={projects}
        getId={p => p.id}
        getLabel={p => p.name}
        selected={filters.projectIds}
        onChange={set => patch({ projectIds: set })}
        emptyHint="All projects"
      />

      <MultiSelect
        label="Member"
        options={members}
        getId={m => m.id}
        getLabel={m => m.displayName ?? m.slackHandle ?? m.id}
        selected={filters.memberIds}
        onChange={set => patch({ memberIds: set })}
        emptyHint="All members"
      />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {EVENT_TYPES.map(t => {
          const active = filters.types.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => patch({ types: toggleInSet(filters.types, t) })}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                border: `1px solid ${active ? TYPE_COLOR[t] : 'var(--clubpm-border)'}`,
                background: active ? TYPE_COLOR[t] : 'transparent',
                color: active ? '#0d0f14' : 'var(--clubpm-text-secondary)',
                transition: 'all 0.18s ease',
              }}
            >
              {t.toLowerCase()}
            </button>
          );
        })}
      </div>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginLeft: 'auto',
          fontSize: 12,
          color: 'var(--clubpm-text-secondary)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={filters.showTaskDeadlines}
          onChange={e => patch({ showTaskDeadlines: e.target.checked })}
        />
        Show task deadlines
      </label>
    </div>
  );
}

export { EVENT_TYPES };
