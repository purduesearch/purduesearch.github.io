import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmInline from '../ConfirmInline';
import LabCheckInQr from './LabCheckInQr';
import {
  get, listWorkspaces, createWorkspace, updateWorkspace, archiveWorkspace,
  setWorkspaceProjects, setWorkspaceRequirements, listTrainings, listCourses,
} from '../../../api/clubPmClient';
import { fmtMin } from '../labschedule/labScheduleUtils';

const EMPTY = {
  name: '', description: '', location: '', color: '#00e5cc', capacity: '',
  timezone: 'America/New_York', openStartMin: 480, openEndMin: 1320, defaultEndsOn: '',
  projectIds: [], trainingIds: [], courseIds: [],
};
const TIMES = Array.from({ length: 49 }, (_, i) => i * 30);
const ZONES = ['America/New_York', 'America/Indiana/Indianapolis', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
const asList = (d, key) => (Array.isArray(d) ? d : (d?.[key] ?? []));

function ChipPicker({ items, selected, onToggle, label, empty }) {
  return (
    <div className="cpm-form-field is-wide">
      <span className="cpm-form-label">{label}</span>
      {items.length === 0 ? <span className="pm-lab-form-hint">{empty}</span> : (
        <div className="pm-lab-chip-picker">
          {items.map(it => (
            <button key={it.id} type="button" className={`pm-lab-chip${selected.includes(it.id) ? ' is-on' : ''}`}
              aria-pressed={selected.includes(it.id)} onClick={() => onToggle(it.id)}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkspaceAdminPanel() {
  const [spaces, setSpaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | workspace
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  const reload = useCallback(() => {
    listWorkspaces({ includeArchived: 1 }).then(l => setSpaces(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
    get('/api/projects').then(d => setProjects(asList(d, 'projects'))).catch(() => {});
    listTrainings().then(d => setTrainings(asList(d, 'trainings').filter(t => !t.archivedAt))).catch(() => {});
    listCourses().then(d => setCourses(asList(d, 'courses'))).catch(() => {});
  }, [reload]);

  function startEdit(ws) {
    setError('');
    if (ws === 'new') { setForm(EMPTY); setEditing('new'); return; }
    setForm({
      name: ws.name, description: ws.description ?? '', location: ws.location ?? '', color: ws.color,
      capacity: ws.capacity ?? '', timezone: ws.timezone, openStartMin: ws.openStartMin, openEndMin: ws.openEndMin,
      defaultEndsOn: ws.defaultEndsOn ?? '',
      projectIds: ws.projects.map(p => p.id),
      trainingIds: ws.requirements.filter(r => r.kind === 'training').map(r => r.refId),
      courseIds: ws.requirements.filter(r => r.kind === 'course').map(r => r.refId),
    });
    setEditing(ws);
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (k, id) => setForm(f => ({ ...f, [k]: f[k].includes(id) ? f[k].filter(x => x !== id) : [...f[k], id] }));

  async function save(e) {
    e.preventDefault();
    if (inFlight.current) return;
    if (!form.name.trim()) { setError('Give the space a name.'); return; }
    if (Number(form.openEndMin) <= Number(form.openStartMin)) { setError('Closing time must be after opening time.'); return; }
    inFlight.current = true;
    setSaving(true);
    setError('');
    const fields = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      color: form.color,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      timezone: form.timezone,
      openStartMin: Number(form.openStartMin),
      openEndMin: Number(form.openEndMin),
      defaultEndsOn: form.defaultEndsOn || null,
    };
    try {
      if (editing === 'new') {
        await createWorkspace({ ...fields, projectIds: form.projectIds, trainingIds: form.trainingIds, courseIds: form.courseIds });
      } else {
        await updateWorkspace(editing.id, fields);
        await setWorkspaceProjects(editing.id, form.projectIds);
        await setWorkspaceRequirements(editing.id, form.trainingIds, form.courseIds);
      }
      toast.success('Lab space saved');
      setEditing(null);
      reload();
    } catch (err) {
      setError(err?.message ?? 'Could not save the space.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="cpm-profile-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0 }}><i className="fas fa-flask" aria-hidden="true" style={{ marginRight: 8, color: 'var(--pm-accent-teal)' }} />Lab spaces</h3>
        {editing === null && (
          <button type="button" className="cpm-btn cpm-btn-primary" onClick={() => startEdit('new')}>
            <i className="fas fa-plus" aria-hidden="true" style={{ marginRight: 6 }} />New space
          </button>
        )}
      </div>

      {editing === null && (
        <div className="pm-lab-admin-list">
          {spaces.length === 0 && <span className="pm-lab-form-hint">No spaces yet. Add the labs and work rooms members book time in.</span>}
          {spaces.map(ws => (
            <button key={ws.id} type="button" className={`pm-lab-admin-row${ws.archived ? ' is-archived' : ''}`}
              style={{ '--pm-lab-space': ws.color }} onClick={() => startEdit(ws)}>
              <span className="pm-lab-space-dot" aria-hidden="true" style={{ '--pm-lab-space': ws.color }} />
              <span>
                <strong>{ws.name}</strong>{ws.archived && ' (archived)'}
                <small>
                  {ws.projects.map(p => p.name).join(', ') || 'No projects assigned'}
                  {ws.requirements.length > 0 && ` · ${ws.requirements.length} requirement${ws.requirements.length === 1 ? '' : 's'}`}
                </small>
              </span>
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {editing !== null && (
        <form className="pm-lab-admin-form" onSubmit={save}>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-name">Name</label>
            <input id="ws-name" className="cpm-form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Propulsion Lab" autoFocus />
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-location">Location</label>
            <input id="ws-location" className="cpm-form-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="ARMS 1010" />
          </div>
          <div className="cpm-form-field is-wide">
            <label className="cpm-form-label" htmlFor="ws-desc">Description</label>
            <textarea id="ws-desc" className="cpm-form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What happens here, access notes, PPE…" />
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-color">Colour</label>
            <input id="ws-color" type="color" className="cpm-form-input" value={form.color} onChange={e => set('color', e.target.value)} />
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-cap">Capacity (optional)</label>
            <input id="ws-cap" type="number" min={1} max={500} className="cpm-form-input" value={form.capacity} onChange={e => set('capacity', e.target.value)} />
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-open">Opens</label>
            <select id="ws-open" className="cpm-form-input" value={form.openStartMin} onChange={e => set('openStartMin', Number(e.target.value))}>
              {TIMES.slice(0, -1).map(m => <option key={m} value={m}>{fmtMin(m)}</option>)}
            </select>
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-close">Closes</label>
            <select id="ws-close" className="cpm-form-input" value={form.openEndMin} onChange={e => set('openEndMin', Number(e.target.value))}>
              {TIMES.slice(1).map(m => <option key={m} value={m}>{m === 1440 ? 'Midnight' : fmtMin(m)}</option>)}
            </select>
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-term">Term end</label>
            <input id="ws-term" type="date" className="cpm-form-input" value={form.defaultEndsOn} onChange={e => set('defaultEndsOn', e.target.value)} />
            <span className="pm-lab-form-hint">Weekly lab time ends here unless members pick an earlier date.</span>
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-tz">Time zone</label>
            <select id="ws-tz" className="cpm-form-input" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
              {[...new Set([form.timezone, ...ZONES])].map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <ChipPicker label="Projects that use this space" empty="No projects found."
            items={projects.map(p => ({ id: p.id, label: p.name }))} selected={form.projectIds} onToggle={id => toggle('projectIds', id)} />
          <ChipPicker label="Required trainings" empty="The training registry is empty."
            items={trainings.map(t => ({ id: t.id, label: t.name }))} selected={form.trainingIds} onToggle={id => toggle('trainingIds', id)} />
          <ChipPicker label="Required courses" empty="No courses found."
            items={courses.map(c => ({ id: c.id, label: c.title }))} selected={form.courseIds} onToggle={id => toggle('courseIds', id)} />
          {editing !== 'new' && !editing.archived && <LabCheckInQr space={editing} />}
          {error && <div className="pm-lab-admin-error" role="alert">{error}</div>}
          <div className="pm-lab-admin-actions">
            {editing !== 'new' && !editing.archived && (
              <ConfirmInline label="Archive" icon="fas fa-box-archive" prompt="Archive this space?" confirmLabel="Archive"
                onConfirm={async () => { await archiveWorkspace(editing.id); toast.success('Space archived'); setEditing(null); reload(); }} />
            )}
            <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
            <button type="submit" className="cpm-btn cpm-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save space'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
