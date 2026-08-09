import React, { useState } from 'react';
import toast from 'react-hot-toast';

const emptyPoint = () => ({ id: `r${Date.now().toString(36)}`, point: '', weight: 1 });

/**
 * Author surface for a LIT_REVIEW section.
 *
 * Everything below the divider — the reference summary and the rubric — is
 * withheld from learners by the server, which builds their payload from five
 * safe keys rather than stripping these off. Nothing here is hidden by CSS.
 */
export default function LitReviewBuilder({ section, onSave }) {
  const initial = section.litConfig ?? {};
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
  const setPoint = (index, patch) =>
    setCfg((prev) => ({
      ...prev,
      rubric: prev.rubric.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));

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

      <fieldset className="pm-lit-builder-rubric">
        <legend>Rubric points</legend>
        {cfg.rubric.map((p, i) => (
          <div key={p.id} className="pm-lit-builder-point">
            <input
              value={p.point}
              placeholder="e.g. Identifies that the 2× figure is transient, not a mean"
              onChange={(e) => setPoint(i, { point: e.target.value })}
            />
            <input
              type="number"
              min="1"
              value={p.weight}
              aria-label="Weight"
              onChange={(e) => setPoint(i, { weight: Number(e.target.value) || 1 })}
            />
            <button
              type="button"
              className="clubpm-btn-secondary"
              onClick={() => setCfg((prev) => ({
                ...prev,
                rubric: prev.rubric.filter((_, j) => j !== i),
              }))}
              aria-label="Remove point"
            >
              <i className="fas fa-trash" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="clubpm-btn-secondary"
          onClick={() => setCfg((prev) => ({ ...prev, rubric: [...prev.rubric, emptyPoint()] }))}
        >
          <i className="fas fa-plus" aria-hidden="true" /> Add point
        </button>
        <small>
          Ids are generated once and never change, so feedback already given stays attached
          when you reword a point.
        </small>
      </fieldset>

      <button type="button" className="clubpm-btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save paper review settings'}
      </button>
    </div>
  );
}
