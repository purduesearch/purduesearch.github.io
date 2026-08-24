import React, { useState } from 'react';
import toast from 'react-hot-toast';
import RubricEditor, { emptyPoint } from './RubricEditor';
import { uploadAssignmentHandout, deleteAssignmentHandout } from '../../../api/clubPmClient';

/**
 * Author surface for an ASSIGNMENT section.
 *
 * Everything below the divider — the reference answer and the rubric — is
 * withheld from learners by the server, which builds their payload from the
 * safe keys rather than stripping these off. Nothing here is hidden by CSS.
 *
 * `onSave` writes `assignmentConfig`; `onSaveSection` writes plain columns.
 * `passThreshold` is a column, not a config key, so it goes through the second
 * one — the same path the rail uses to rename a section.
 */
export default function AssignmentBuilder({ section, onSave, onSaveSection }) {
  // The last config we know is persisted. The handout routes write three keys
  // into this column server-side and hand the whole section back, so this is
  // what a save spreads — not the mount-time snapshot, which would clobber a
  // handout uploaded since.
  const [base, setBase] = useState(section.assignmentConfig ?? {});
  const [passThreshold, setPassThreshold] = useState(section.passThreshold ?? null);
  const [cfg, setCfg] = useState(() => {
    const initial = section.assignmentConfig ?? {};
    return {
      promptText: initial.promptText ?? '',
      minWords: initial.minWords ?? 150,
      referenceAnswer: initial.referenceAnswer ?? '',
      rubric: Array.isArray(initial.rubric) && initial.rubric.length ? initial.rubric : [emptyPoint()],
    };
  });
  const [saving, setSaving] = useState(false);
  const [handoutBusy, setHandoutBusy] = useState(false);

  const set = (key, value) => setCfg((prev) => ({ ...prev, [key]: value }));

  const handleHandoutUpload = async (file) => {
    if (!file) return;
    setHandoutBusy(true);
    try {
      const saved = await uploadAssignmentHandout(section.id, file);
      setBase(saved?.assignmentConfig ?? {});
      toast.success('Handout attached');
    } catch (err) {
      toast.error(err?.message ?? 'Could not attach that handout');
    } finally {
      setHandoutBusy(false);
    }
  };

  const handleHandoutRemove = async () => {
    setHandoutBusy(true);
    try {
      const saved = await deleteAssignmentHandout(section.id);
      setBase(saved?.assignmentConfig ?? {});
      toast.success('Handout removed');
    } catch (err) {
      toast.error(err?.message ?? 'Could not remove that handout');
    } finally {
      setHandoutBusy(false);
    }
  };

  const handleSave = async () => {
    if (!cfg.promptText.trim()) { toast.error('A prompt is required'); return; }
    if (!cfg.referenceAnswer.trim()) { toast.error('A reference answer is required'); return; }
    const rubric = cfg.rubric.filter((p) => p.point.trim());
    if (!rubric.length) { toast.error('Add at least one rubric point'); return; }
    setSaving(true);
    try {
      // Spread the previous value, like every other *Config writer: a partial
      // save must not drop the handout keys the upload route owns.
      const next = { ...base, ...cfg, rubric, minWords: Number(cfg.minWords) || 150 };
      await onSave(next);
      setBase(next);
      // A column, not a config key — a separate patch on the section itself.
      if (onSaveSection && passThreshold !== (section.passThreshold ?? null)) {
        await onSaveSection({ passThreshold });
      }
      toast.success('Assignment settings saved');
    } catch (err) {
      toast.error(err?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pm-lit-builder">
      <label>
        Prompt shown to the learner
        <textarea rows={4} value={cfg.promptText} onChange={(e) => set('promptText', e.target.value)} />
        <small>
          The task itself. The section body below is the context they read first; this is what
          they are being asked to hand in.
        </small>
      </label>

      <div className="pm-assign-builder-handout">
        <span className="pm-assign-builder-handout-label">Handout (optional)</span>
        {base.handoutDriveFileId ? (
          <div className="pm-assign-builder-handout-row">
            <i className="fas fa-paperclip" aria-hidden="true" />
            <span>{base.handoutName || 'Attached file'}</span>
            <button
              type="button"
              className="clubpm-btn-secondary"
              onClick={handleHandoutRemove}
              disabled={handoutBusy}
            >
              <i className="fas fa-trash" aria-hidden="true" /> Remove
            </button>
          </div>
        ) : (
          <input
            type="file"
            disabled={handoutBusy}
            onChange={(e) => { handleHandoutUpload(e.target.files?.[0]); e.target.value = ''; }}
          />
        )}
        <small>
          Uploaded through the club Drive and shared server-side, so a learner never lands on a
          sign-in wall. Saved the moment you pick it — no need to press Save below.
        </small>
      </div>

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
        Reference answer
        <textarea
          rows={10}
          value={cfg.referenceAnswer}
          onChange={(e) => set('referenceAnswer', e.target.value)}
        />
        <small>The ground truth the learner&apos;s submission is judged against.</small>
      </label>

      <RubricEditor
        points={cfg.rubric}
        onChange={(rubric) => set('rubric', rubric)}
        placeholder="e.g. Sizes the pump from the head loss, not the flow rate alone"
      />

      <button type="button" className="clubpm-btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save assignment settings'}
      </button>
    </div>
  );
}
