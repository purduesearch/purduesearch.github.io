import React from 'react';

// Editable review of an AI-drafted CoursePlan (see backend/src/services/coursePlan.ts).
//
// Controlled: every edit calls onChange with a NEW outline object; the modal
// debounces the PATCH. The server re-validates whatever arrives, so nothing here
// is a trust boundary — the caps below are shown to inform the author, not to
// enforce anything.
//
// This screen exists because stage 2 is the expensive half: one model call per
// section, minutes long, and irreversible once it starts. Everything the author
// needs in order to decide "is this worth running" has to be visible here.

const KINDS = [
  { id: 'CONTENT', label: 'Content', hint: 'Written material' },
  { id: 'VIDEO',   label: 'Video',   hint: 'Placeholder — you add the video' },
  { id: 'QUIZ',    label: 'Quiz',    hint: 'Questions on this module' },
  { id: 'SLIDES',  label: 'Slides',  hint: 'Slide outline as prose' },
];

// Mirrors coursePlan.ts. Shown as guidance; the server clamps regardless.
const MAX_MODULES = 8;
const MAX_SECTIONS_PER_MODULE = 10;
const MAX_TOTAL_SECTIONS = 50;

function move(arr, from, to) {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function CourseOutlineReview({ outline, onChange, disabled = false }) {
  const modules = outline?.modules ?? [];

  // The section count IS the model-call count for stage 2, and the call budget
  // is the real constraint (25 complex-model requests a day, after which it
  // silently falls back to the weaker model). VIDEO sections are the exception:
  // they are a placeholder, not a call.
  const sectionCount = modules.reduce((n, m) => n + (m.sections?.length ?? 0), 0);
  const callCount = modules.reduce(
    (n, m) => n + (m.sections ?? []).filter((s) => s.kind !== 'VIDEO').length, 0,
  );

  const atModuleCap = modules.length >= MAX_MODULES;
  const atTotalCap = sectionCount >= MAX_TOTAL_SECTIONS;

  const patch = (next) => onChange({ ...outline, ...next });
  const setModules = (next) => patch({ modules: next });

  const updateModule = (mi, changes) =>
    setModules(modules.map((m, i) => (i === mi ? { ...m, ...changes } : m)));

  const updateSection = (mi, si, changes) =>
    updateModule(mi, {
      sections: modules[mi].sections.map((s, i) => (i === si ? { ...s, ...changes } : s)),
    });

  const addModule = () =>
    setModules([...modules, { title: 'New module', summary: '', sections: [], isRequired: true, sequential: true }]);

  const addSection = (mi) =>
    updateModule(mi, {
      sections: [...(modules[mi].sections ?? []), { kind: 'CONTENT', title: 'New section', brief: '', isRequired: true }],
    });

  return (
    <div className="pm-course-gen-outline">
      <div className="pm-course-gen-outline-head">
        <label className="cpm-form-label" htmlFor="cgen-title">Course title</label>
        <input
          id="cgen-title"
          className="cpm-form-input"
          value={outline?.title ?? ''}
          disabled={disabled}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <label className="cpm-form-label" htmlFor="cgen-summary">Summary</label>
        <textarea
          id="cgen-summary"
          className="cpm-form-input"
          rows={2}
          value={outline?.summary ?? ''}
          disabled={disabled}
          onChange={(e) => patch({ summary: e.target.value })}
        />

        {/* The author's only cost signal before the expensive stage runs. */}
        <div className="pm-course-gen-cost">
          <span className="cpm-tag">{modules.length} modules</span>
          <span className="cpm-tag">{sectionCount} sections</span>
          <span className="cpm-tag cpm-tag--accent">{callCount} model calls</span>
          <p className="pm-course-gen-cost-note">
            Generating writes one section at a time — <strong>{callCount} model calls</strong>, run
            sequentially, so this takes roughly {Math.max(1, Math.round(callCount * 0.5))}–
            {Math.max(2, callCount)} minutes. VIDEO sections are placeholders and cost nothing.
            Caps: {MAX_MODULES} modules, {MAX_SECTIONS_PER_MODULE} sections each,{' '}
            {MAX_TOTAL_SECTIONS} total.
          </p>
        </div>
      </div>

      <ul className="pm-course-gen-modules">
        {modules.map((mod, mi) => (
          <li key={mi} className="cpm-card pm-course-gen-module-card">
            <div className="pm-course-gen-module-head">
              <span className="pm-course-gen-module-index">{mi + 1}</span>
              <input
                className="cpm-form-input pm-course-gen-module-title"
                value={mod.title ?? ''}
                disabled={disabled}
                aria-label={`Module ${mi + 1} title`}
                onChange={(e) => updateModule(mi, { title: e.target.value })}
              />
              <div className="pm-course-gen-move">
                <button
                  type="button" className="clubpm-btn-secondary" title="Move module up"
                  aria-label={`Move module ${mi + 1} up`}
                  disabled={disabled || mi === 0}
                  onClick={() => setModules(move(modules, mi, mi - 1))}
                >
                  <i className="fas fa-arrow-up" aria-hidden="true" />
                </button>
                <button
                  type="button" className="clubpm-btn-secondary" title="Move module down"
                  aria-label={`Move module ${mi + 1} down`}
                  disabled={disabled || mi === modules.length - 1}
                  onClick={() => setModules(move(modules, mi, mi + 1))}
                >
                  <i className="fas fa-arrow-down" aria-hidden="true" />
                </button>
                <button
                  type="button" className="clubpm-btn-secondary pm-course-gen-danger"
                  title="Delete module" aria-label={`Delete module ${mi + 1}`}
                  disabled={disabled}
                  onClick={() => setModules(modules.filter((_, i) => i !== mi))}
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </div>
            </div>

            <textarea
              className="cpm-form-input pm-course-gen-module-summary"
              rows={2}
              placeholder="One line, shown to learners before the module unlocks"
              value={mod.summary ?? ''}
              disabled={disabled}
              aria-label={`Module ${mi + 1} summary`}
              onChange={(e) => updateModule(mi, { summary: e.target.value })}
            />

            <div className="pm-course-gen-module-opts">
              <label>
                Est. minutes
                <input
                  type="number" min="0" max="600" className="cpm-form-input"
                  value={mod.estimatedMinutes ?? ''}
                  disabled={disabled}
                  onChange={(e) => updateModule(mi, {
                    estimatedMinutes: e.target.value === '' ? undefined : Number(e.target.value),
                  })}
                />
              </label>
              <label>
                <input
                  type="checkbox" checked={mod.isRequired !== false} disabled={disabled}
                  onChange={(e) => updateModule(mi, { isRequired: e.target.checked })}
                />
                Required
              </label>
              <label>
                <input
                  type="checkbox" checked={mod.sequential !== false} disabled={disabled}
                  onChange={(e) => updateModule(mi, { sequential: e.target.checked })}
                />
                Sections in order
              </label>
            </div>

            <ul className="pm-course-gen-sections">
              {(mod.sections ?? []).map((sec, si) => (
                <li key={si} className="pm-course-gen-section-row">
                  <div className="pm-course-gen-section-head">
                    <select
                      className="cpm-form-input pm-course-gen-kind"
                      value={sec.kind}
                      disabled={disabled}
                      aria-label={`Section ${si + 1} kind`}
                      onChange={(e) => updateSection(mi, si, { kind: e.target.value })}
                    >
                      {KINDS.map((k) => (
                        <option key={k.id} value={k.id}>{k.label}</option>
                      ))}
                    </select>
                    <input
                      className="cpm-form-input"
                      value={sec.title ?? ''}
                      disabled={disabled}
                      aria-label={`Section ${si + 1} title`}
                      onChange={(e) => updateSection(mi, si, { title: e.target.value })}
                    />
                    <button
                      type="button" className="clubpm-btn-secondary" title="Move section up"
                      aria-label={`Move section ${si + 1} up`}
                      disabled={disabled || si === 0}
                      onClick={() => updateModule(mi, { sections: move(mod.sections, si, si - 1) })}
                    >
                      <i className="fas fa-arrow-up" aria-hidden="true" />
                    </button>
                    <button
                      type="button" className="clubpm-btn-secondary" title="Move section down"
                      aria-label={`Move section ${si + 1} down`}
                      disabled={disabled || si === mod.sections.length - 1}
                      onClick={() => updateModule(mi, { sections: move(mod.sections, si, si + 1) })}
                    >
                      <i className="fas fa-arrow-down" aria-hidden="true" />
                    </button>
                    <button
                      type="button" className="clubpm-btn-secondary pm-course-gen-danger"
                      title="Delete section" aria-label={`Delete section ${si + 1}`}
                      disabled={disabled}
                      onClick={() => updateModule(mi, { sections: mod.sections.filter((_, i) => i !== si) })}
                    >
                      <i className="fas fa-trash" aria-hidden="true" />
                    </button>
                  </div>

                  <label className="cpm-form-label pm-course-gen-brief-label">
                    Brief
                    {/* The brief is the ONLY instruction the writer of this section
                        receives — not the course title, not the other sections, not
                        this screen. Left as the model drafted it, the author gets
                        what the model planned; sharpened, they get what they wanted. */}
                    <span className="pm-course-gen-brief-hint">
                      This is the <strong>only</strong> instruction the writer of this section gets.
                      Everything it should cover has to be in here.
                    </span>
                  </label>
                  <textarea
                    className="cpm-form-input pm-course-gen-brief"
                    rows={3}
                    value={sec.brief ?? ''}
                    disabled={disabled}
                    aria-label={`Section ${si + 1} brief`}
                    onChange={(e) => updateSection(mi, si, { brief: e.target.value })}
                  />

                  <div className="pm-course-gen-section-opts">
                    <label>
                      <input
                        type="checkbox" checked={sec.isRequired !== false} disabled={disabled}
                        onChange={(e) => updateSection(mi, si, { isRequired: e.target.checked })}
                      />
                      Required
                    </label>
                    {sec.kind === 'QUIZ' && (
                      <>
                        <label>
                          Questions
                          <input
                            type="number" min="1" max="20" className="cpm-form-input"
                            value={sec.questionCount ?? 5}
                            disabled={disabled}
                            onChange={(e) => updateSection(mi, si, { questionCount: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          Pass %
                          <input
                            type="number" min="0" max="100" className="cpm-form-input"
                            value={sec.passThreshold ?? 80}
                            disabled={disabled}
                            onChange={(e) => updateSection(mi, si, { passThreshold: Number(e.target.value) })}
                          />
                        </label>
                      </>
                    )}
                    {sec.kind === 'SLIDES' && (
                      <label>
                        Slides
                        <input
                          type="number" min="1" max="60" className="cpm-form-input"
                          value={sec.slideCount ?? 10}
                          disabled={disabled}
                          onChange={(e) => updateSection(mi, si, { slideCount: Number(e.target.value) })}
                        />
                      </label>
                    )}
                    <span className="pm-course-gen-kind-hint">
                      {KINDS.find((k) => k.id === sec.kind)?.hint}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="clubpm-btn-secondary"
              disabled={disabled || atTotalCap || (mod.sections?.length ?? 0) >= MAX_SECTIONS_PER_MODULE}
              onClick={() => addSection(mi)}
            >
              <i className="fas fa-plus" aria-hidden="true" style={{ marginRight: 6 }} />
              Add section
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="clubpm-btn-secondary"
        disabled={disabled || atModuleCap}
        onClick={addModule}
      >
        <i className="fas fa-plus" aria-hidden="true" style={{ marginRight: 6 }} />
        Add module
      </button>
      {atModuleCap && (
        <span className="pm-course-gen-cap-note">Module cap reached ({MAX_MODULES}).</span>
      )}
    </div>
  );
}
