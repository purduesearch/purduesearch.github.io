import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  listTrainings,
  createTraining,
  updateTraining,
  uploadTrainingExample,
  deleteTrainingExample,
  trainingExampleUrl,
} from '../../../api/clubPmClient';

const BLANK = {
  name: '',
  providerName: '',
  providerUrl: '',
  courseUrl: '',
  registrationUrl: '',
  description: '',
  renewalMonths: '',
};

/**
 * Author-side panel for a TRAINING section.
 *
 * The section's `trainingId` is staged with the page through `onChange(sectionId,
 * patch)` — the same handler LitReviewBuilder and AssignmentBuilder are given, so
 * Save draft, Ctrl+S, the autosave and the section-switch save all cover it. This
 * component never writes the section itself.
 *
 * `trainingId` is a plain column, so it patches like `passThreshold` — there is no
 * previous value to spread, unlike the JSON config columns.
 *
 * The registry rows themselves are a different matter: they are shared across
 * courses and save immediately, through their own endpoints.
 */
export default function TrainingBuilder({ section, onChange }) {
  const sectionId = section.id;
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]       = useState('pick');   // 'pick' | 'edit'
  const [draft, setDraft]     = useState(BLANK);
  const [saving, setSaving]   = useState(false);
  // The staged patch does not travel back down through `section`, so the picked
  // entry is held here rather than read off the prop — otherwise the <select>
  // would snap back to the saved value on every change.
  const [trainingId, setTrainingId] = useState(section.trainingId ?? null);

  const selected = rows.find((r) => r.id === trainingId) ?? null;

  const load = useCallback(async () => {
    try {
      setRows(await listTrainings());
    } catch {
      toast.error('Could not load the training registry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pick = (id) => {
    setTrainingId(id);
    onChange?.(sectionId, { trainingId: id });
  };

  const startNew = () => { setDraft(BLANK); setMode('edit'); };
  const startEdit = () => {
    if (!selected) return;
    setDraft({
      name:            selected.name ?? '',
      providerName:    selected.providerName ?? '',
      providerUrl:     selected.providerUrl ?? '',
      courseUrl:       selected.courseUrl ?? '',
      registrationUrl: selected.registrationUrl ?? '',
      description:     selected.description ?? '',
      renewalMonths:   selected.renewalMonths ?? '',
    });
    setMode('edit');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...draft,
        renewalMonths: draft.renewalMonths === '' ? null : Number(draft.renewalMonths),
      };
      // In 'edit' mode a selected row is always an update, and no selection is
      // always a create.
      const row = selected
        ? await updateTraining(selected.id, body)
        : await createTraining(body);
      await load();
      pick(row.id);
      setMode('pick');
      toast.success('Training saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save that training');
    } finally {
      setSaving(false);
    }
  };

  const attachExample = async (file) => {
    if (!selected || !file) return;
    try {
      await uploadTrainingExample(selected.id, file);
      await load();
      toast.success('Example certificate attached');
    } catch (err) {
      toast.error(err?.message || 'Could not attach that example');
    }
  };

  const removeExample = async () => {
    if (!selected) return;
    try {
      await deleteTrainingExample(selected.id);
      await load();
      toast.success('Example removed');
    } catch (err) {
      toast.error(err?.message || 'Could not remove that example');
    }
  };

  if (loading) return <p className="cpm-training-empty">Loading the registry…</p>;

  if (mode === 'edit') {
    return (
      <form className="cpm-card cpm-training-builder" onSubmit={save}>
        <h4>{selected ? 'Edit training' : 'New training'}</h4>

        {selected && (
          // A shared registry's one sharp edge, said out loud rather than
          // discovered. Editing this row changes it in every course that uses it.
          <p className="cpm-training-warn">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
            This entry is shared. Editing it changes it in <strong>every course</strong> that
            uses this training, not just this one.
          </p>
        )}

        <label className="cpm-form-label" htmlFor="tb-name">Name</label>
        <input id="tb-name" className="cpm-form-input" value={draft.name} required
               onChange={(e) => setDraft({ ...draft, name: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-provider">Provider</label>
        <input id="tb-provider" className="cpm-form-input" value={draft.providerName} required
               placeholder="CITI Program"
               onChange={(e) => setDraft({ ...draft, providerName: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-course-url">Link to the training</label>
        <input id="tb-course-url" className="cpm-form-input" type="url" value={draft.courseUrl}
               onChange={(e) => setDraft({ ...draft, courseUrl: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-reg-url">
          Registration instructions (optional)
        </label>
        <input id="tb-reg-url" className="cpm-form-input" type="url" value={draft.registrationUrl}
               onChange={(e) => setDraft({ ...draft, registrationUrl: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-desc">What it covers</label>
        <textarea id="tb-desc" className="cpm-form-input" rows={4} value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-renewal">
          Renews every … months (blank = never expires)
        </label>
        <input id="tb-renewal" className="cpm-form-input" type="number" min="0" max="120"
               value={draft.renewalMonths}
               onChange={(e) => setDraft({ ...draft, renewalMonths: e.target.value })} />

        <div className="cpm-training-builder-actions">
          <button className="clubpm-btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save training'}
          </button>
          <button className="clubpm-btn-secondary" type="button" onClick={() => setMode('pick')}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="cpm-card cpm-training-builder">
      <h4>Training for this section</h4>

      <label className="cpm-form-label" htmlFor="tb-pick">Registry entry</label>
      <select id="tb-pick" className="cpm-form-input" value={trainingId ?? ''}
              onChange={(e) => pick(e.target.value || null)}>
        <option value="">— pick a training —</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>{r.name} · {r.providerName}</option>
        ))}
      </select>

      <div className="cpm-training-builder-actions">
        <button className="clubpm-btn-secondary" type="button" onClick={startNew}>
          <i className="fas fa-plus" aria-hidden="true" /> New training
        </button>
        {selected && (
          <button className="clubpm-btn-secondary" type="button" onClick={startEdit}>
            <i className="fas fa-pen" aria-hidden="true" /> Edit “{selected.name}”
          </button>
        )}
      </div>

      {selected && (
        <div className="cpm-training-example-admin">
          <h5>Example certificate</h5>
          <p className="cpm-training-note">
            What an acceptable certificate looks like. Learners see this before they upload,
            which is most of the reason a wrong file gets submitted.
          </p>
          {selected.exampleFileId ? (
            <div className="cpm-training-builder-actions">
              <a className="clubpm-btn-secondary" href={trainingExampleUrl(selected.id)}
                 target="_blank" rel="noopener noreferrer">
                <i className="fas fa-eye" aria-hidden="true" /> {selected.exampleFileName}
              </a>
              <button className="clubpm-btn-secondary" type="button" onClick={removeExample}>
                <i className="fas fa-trash" aria-hidden="true" /> Remove
              </button>
            </div>
          ) : (
            <input className="cpm-form-input" type="file" accept="application/pdf,image/*"
                   onChange={(e) => attachExample(e.target.files?.[0])} />
          )}
        </div>
      )}
    </div>
  );
}
