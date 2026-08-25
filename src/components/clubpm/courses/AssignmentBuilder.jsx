import React, { useState, useEffect, useRef } from 'react';
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
 * Like LitReviewBuilder, this surface has no save button of its own: every edit
 * stages a whole-section patch with the page through `onChange`, and the page's
 * autosave / Save draft / Ctrl+S / section-switch save writes it with the
 * titles. The patch carries `assignmentConfig` (a whole merged object) and
 * `passThreshold`, which is a plain column rather than a config key.
 *
 * The handout is the exception and still saves on its own: it goes to Drive
 * through a dedicated route that writes three keys into this column
 * server-side, so it is already persisted by the time the picker closes.
 */
export default function AssignmentBuilder({ section, onChange }) {
  const sectionId = section.id;
  // The last config we know is persisted. The handout routes write into this
  // column server-side and hand the whole section back, so this is what a save
  // spreads — not the mount-time snapshot, which would clobber a handout
  // uploaded since.
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
  const [handoutBusy, setHandoutBusy] = useState(false);

  const set = (key, value) => setCfg((prev) => ({ ...prev, [key]: value }));

  // Read through a ref so a handout upload does not itself stage a patch — it
  // has already been written server-side — while the next real edit still
  // spreads the keys it added.
  const baseRef = useRef(base);
  baseRef.current = base;

  // Identity of the mount-time state; see LitReviewBuilder for why this is a
  // comparison rather than a first-run flag.
  const pristineCfg = useRef(cfg);
  const pristineThreshold = useRef(passThreshold);

  useEffect(() => {
    if (cfg === pristineCfg.current && passThreshold === pristineThreshold.current) return;
    onChange?.(sectionId, {
      assignmentConfig: {
        ...baseRef.current,
        ...cfg,
        minWords: Number(cfg.minWords) || 150,
        rubric: cfg.rubric.filter((p) => p.point.trim()),
      },
      passThreshold,
    });
  }, [cfg, passThreshold, sectionId, onChange]);

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

  // A readiness note, not a save gate — a draft may sit incomplete.
  const missing = [
    !cfg.promptText.trim() && 'a prompt',
    !cfg.referenceAnswer.trim() && 'a reference answer',
    !cfg.rubric.some((p) => p.point.trim()) && 'at least one rubric point',
  ].filter(Boolean);

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
          sign-in wall. Saved the moment you pick it.
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
    </div>
  );
}
