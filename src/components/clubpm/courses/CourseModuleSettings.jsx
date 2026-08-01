import React, { useEffect, useState } from 'react';

/**
 * The module's authoring surface, shown in the main column when a module header
 * is selected — the same slot CONTENT / VIDEO / QUIZ switch into.
 *
 * Text fields commit on blur, toggles commit immediately. The page's debounced
 * autosave owns section titles and prose; module fields are not part of it, so
 * they save themselves.
 */
export default function CourseModuleSettings({ module: mod, canEdit, onUpdate, sectionCount }) {
  const [title, setTitle] = useState(mod.title ?? '');
  const [summary, setSummary] = useState(mod.summary ?? '');
  // Kept as a string so an emptied input round-trips to null rather than NaN.
  const [minutes, setMinutes] = useState(mod.estimatedMinutes == null ? '' : String(mod.estimatedMinutes));

  useEffect(() => {
    setTitle(mod.title ?? '');
    setSummary(mod.summary ?? '');
    setMinutes(mod.estimatedMinutes == null ? '' : String(mod.estimatedMinutes));
  }, [mod.id, mod.title, mod.summary, mod.estimatedMinutes]);

  const commit = (patch) => { if (canEdit) onUpdate(mod.id, patch); };

  const allOptional = sectionCount > 0 && (mod.sections ?? []).every((s) => !s.isRequired);

  return (
    <div className="pm-course-module-settings">
      <label className="cpm-form-label" htmlFor={`mod-title-${mod.id}`}>Module title</label>
      <input
        id={`mod-title-${mod.id}`}
        className="cpm-form-input"
        value={title}
        disabled={!canEdit}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title.trim() && title !== mod.title) commit({ title: title.trim() }); }}
      />

      <label className="cpm-form-label" htmlFor={`mod-summary-${mod.id}`}>
        Summary <span className="pm-course-module-hint">Shown to learners even while this module is locked.</span>
      </label>
      <textarea
        id={`mod-summary-${mod.id}`}
        className="cpm-form-input"
        rows={2}
        value={summary}
        disabled={!canEdit}
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => { if (summary !== (mod.summary ?? '')) commit({ summary: summary.trim() || null }); }}
      />

      <label className="cpm-form-label" htmlFor={`mod-min-${mod.id}`}>Estimated minutes</label>
      <input
        id={`mod-min-${mod.id}`}
        className="cpm-form-input"
        type="number"
        min="0"
        value={minutes}
        disabled={!canEdit}
        onChange={(e) => setMinutes(e.target.value)}
        onBlur={() => {
          const next = minutes.trim() === '' ? null : Math.max(0, parseInt(minutes, 10) || 0);
          if (next !== mod.estimatedMinutes) commit({ estimatedMinutes: next });
        }}
      />

      <div className="pm-course-module-toggles">
        <label>
          <input
            type="checkbox"
            checked={!!mod.isRequired}
            disabled={!canEdit}
            onChange={(e) => commit({ isRequired: e.target.checked })}
          />
          <span>Required — this module blocks the ones after it</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!mod.sequential}
            disabled={!canEdit}
            onChange={(e) => commit({ sequential: e.target.checked })}
          />
          <span>Sections must be completed in order</span>
        </label>
      </div>

      {sectionCount === 0 && (
        <p className="pm-course-module-warning">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> This module has no sections,
          so it never blocks the next one.
        </p>
      )}
      {allOptional && (
        <p className="pm-course-module-warning">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> Every section here is optional,
          so this module never blocks the next one.
        </p>
      )}
    </div>
  );
}
