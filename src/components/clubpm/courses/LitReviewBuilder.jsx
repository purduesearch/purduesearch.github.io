import React, { useState, useEffect, useRef } from 'react';
import RubricEditor, { emptyPoint } from './RubricEditor';

/**
 * Author surface for a LIT_REVIEW section.
 *
 * Everything below the divider — the reference summary and the rubric — is
 * withheld from learners by the server, which builds their payload from five
 * safe keys rather than stripping these off. Nothing here is hidden by CSS.
 *
 * This surface has no save button of its own. Every edit stages a whole-section
 * patch with the page through `onChange`, and the page's normal save path —
 * autosave, Save draft, Ctrl+S, and the save that runs before a section switch
 * — writes it with the titles. An author editing one field at the top of a long
 * form should never have to scroll to the bottom to find out whether it stuck.
 *
 * The patch carries `litConfig` (a whole merged object, like every other
 * *Config writer — a partial save must not drop keys this form does not own)
 * and `passThreshold`, which is a plain column on the section rather than a key
 * inside the config.
 */
export default function LitReviewBuilder({ section, onChange }) {
  const sectionId = section.id;
  const [passThreshold, setPassThreshold] = useState(section.passThreshold ?? null);
  const [cfg, setCfg] = useState(() => {
    const initial = section.litConfig ?? {};
    return {
      pdfDriveFileId: initial.pdfDriveFileId ?? '',
      pdfTitle: initial.pdfTitle ?? '',
      citation: initial.citation ?? '',
      promptText: initial.promptText ?? '',
      minWords: initial.minWords ?? 150,
      referenceSummary: initial.referenceSummary ?? '',
      rubric: Array.isArray(initial.rubric) && initial.rubric.length ? initial.rubric : [emptyPoint()],
    };
  });

  const set = (key, value) => setCfg((prev) => ({ ...prev, [key]: value }));

  // Keys this form does not own — nothing writes into litConfig from elsewhere
  // today, but a save that silently dropped such a key would be very hard to
  // spot, so the spread stays.
  const carriedRef = useRef(null);
  carriedRef.current = section.litConfig ?? {};

  // Identity of the mount-time state. Comparing against it (rather than a
  // "first run" flag) is what keeps the mount from staging a patch and marking
  // the page dirty on every section visit — including under StrictMode's
  // double-invoked effects, where a flag would emit on the second run.
  const pristineCfg = useRef(cfg);
  const pristineThreshold = useRef(passThreshold);

  useEffect(() => {
    if (cfg === pristineCfg.current && passThreshold === pristineThreshold.current) return;
    onChange?.(sectionId, {
      litConfig: {
        ...carriedRef.current,
        ...cfg,
        minWords: Number(cfg.minWords) || 150,
        // Half-typed rubric rows stay in local state but are not persisted —
        // an empty point would otherwise reach the grader as a scoreable item.
        rubric: cfg.rubric.filter((p) => p.point.trim()),
      },
      passThreshold,
    });
  }, [cfg, passThreshold, sectionId, onChange]);

  // What grading needs. A draft may sit incomplete for as long as the author
  // likes — this is a readiness note, not a save gate, because refusing to save
  // an unfinished form is what forced the author to keep a second copy of their
  // work in the box.
  const missing = [
    !cfg.pdfDriveFileId.trim() && 'a Drive file id',
    !cfg.referenceSummary.trim() && 'a reference summary',
    !cfg.rubric.some((p) => p.point.trim()) && 'at least one rubric point',
  ].filter(Boolean);

  return (
    <div className="pm-lit-builder">
      <label>
        Drive file id
        <input value={cfg.pdfDriveFileId} onChange={(e) => set('pdfDriveFileId', e.target.value)} />
        <small>
          From the Drive URL: <code>drive.google.com/file/d/<b>THIS PART</b>/view</code>. The file
          must be link-shared, or every learner sees a sign-in wall instead of the paper.
        </small>
      </label>

      <label>
        Paper title
        <input value={cfg.pdfTitle} onChange={(e) => set('pdfTitle', e.target.value)} />
      </label>

      <label>
        Citation
        <input value={cfg.citation} onChange={(e) => set('citation', e.target.value)} />
      </label>

      <label>
        Prompt shown to the learner
        <textarea rows={3} value={cfg.promptText} onChange={(e) => set('promptText', e.target.value)} />
      </label>

      <label>
        Minimum words
        <input
          type="number"
          min="1"
          value={cfg.minWords}
          onChange={(e) => set('minWords', e.target.value)}
        />
        <small>The effort floor. A shorter submission is refused before Gemini is called.</small>
      </label>

      <label>
        Pass mark (%)
        <input
          type="number"
          min="0"
          max="100"
          value={passThreshold ?? ''}
          onChange={(e) => setPassThreshold(e.target.value === '' ? null : Number(e.target.value))}
        />
        <small>
          Leave blank for no gate — the section completes on effort and the learner never sees a
          score, which is how every existing section behaves. Set a number and the learner must
          reach it to continue; they will see their score, and they can revise as many times as
          they like. If AI grading is unavailable the submission passes anyway and is flagged for
          your review, so an outage never strands anyone.
        </small>
      </label>

      {missing.length > 0 && (
        <p className="pm-lit-builder-todo">
          <i className="fas fa-circle-info" aria-hidden="true" />
          {' '}Saved as a draft. Still needs {missing.join(', ')} before learners can be graded.
        </p>
      )}

      <hr />
      <p className="pm-lit-builder-warn">
        <i className="fas fa-user-shield" aria-hidden="true" />
        {' '}Never sent to learners — the server builds their payload from the fields above only.
      </p>

      <label>
        Reference summary
        <textarea
          rows={10}
          value={cfg.referenceSummary}
          onChange={(e) => set('referenceSummary', e.target.value)}
        />
        <small>The ground truth the learner&apos;s summary is judged against.</small>
      </label>

      <RubricEditor points={cfg.rubric} onChange={(rubric) => set('rubric', rubric)} />
    </div>
  );
}
