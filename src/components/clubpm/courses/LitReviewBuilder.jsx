import React, { useState } from 'react';
import toast from 'react-hot-toast';
import RubricEditor, { emptyPoint } from './RubricEditor';

/**
 * Author surface for a LIT_REVIEW section.
 *
 * Everything below the divider — the reference summary and the rubric — is
 * withheld from learners by the server, which builds their payload from five
 * safe keys rather than stripping these off. Nothing here is hidden by CSS.
 *
 * `onSave` writes `litConfig`; `onSaveSection` writes plain columns on the
 * section. `passThreshold` is a column, not a config key, so it goes through
 * the second one — the same path the rail uses to rename a section.
 */
export default function LitReviewBuilder({ section, onSave, onSaveSection }) {
  const initial = section.litConfig ?? {};
  const [passThreshold, setPassThreshold] = useState(section.passThreshold ?? null);
  const [cfg, setCfg] = useState({
    pdfDriveFileId: initial.pdfDriveFileId ?? '',
    pdfTitle: initial.pdfTitle ?? '',
    citation: initial.citation ?? '',
    promptText: initial.promptText ?? '',
    minWords: initial.minWords ?? 150,
    referenceSummary: initial.referenceSummary ?? '',
    rubric: Array.isArray(initial.rubric) && initial.rubric.length ? initial.rubric : [emptyPoint()],
  });
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setCfg((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!cfg.pdfDriveFileId.trim()) { toast.error('A Drive file id is required'); return; }
    if (!cfg.referenceSummary.trim()) { toast.error('A reference summary is required'); return; }
    const rubric = cfg.rubric.filter((p) => p.point.trim());
    if (!rubric.length) { toast.error('Add at least one rubric point'); return; }
    setSaving(true);
    try {
      // Spread the previous value, like every other *Config writer: a partial
      // save must not drop keys this form does not own.
      await onSave({ ...initial, ...cfg, rubric, minWords: Number(cfg.minWords) || 150 });
      // A column, not a config key — a separate patch on the section itself.
      if (onSaveSection && passThreshold !== (section.passThreshold ?? null)) {
        await onSaveSection({ passThreshold });
      }
      toast.success('Paper review settings saved');
    } catch (err) {
      toast.error(err?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

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

      <button type="button" className="clubpm-btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save paper review settings'}
      </button>
    </div>
  );
}
