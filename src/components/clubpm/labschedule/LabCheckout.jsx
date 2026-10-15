import { useEffect, useMemo, useRef, useState } from 'react';
import MobileSheet from '../MobileSheet';
import { get, labCheckOut, suggestActions, executePlan } from '../../../api/clubPmClient';

const STATUSES = { TODO: 'To do', IN_PROGRESS: 'In progress', BLOCKED: 'Blocked', DONE: 'Done' };
const SUPPORTED = new Set(['CREATE_TASK', 'SET_STATUS', 'ADD_COMMENT']);

// Closing the visit and applying a reviewed plan are deliberately separate steps:
// an AI outage or a denied task change must never prevent someone leaving the lab.
export default function LabCheckout({ visit, tasks = [], onClose, onComplete }) {
  const [selected, setSelected] = useState([]);
  const [other, setOther] = useState(false);
  const [statuses, setStatuses] = useState({});
  const [query, setQuery] = useState('');
  const [recap, setRecap] = useState('');
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(tasks[0]?.projectId ?? '');
  const [plan, setPlan] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(null);
  const [applied, setApplied] = useState(0);
  const [declined, setDeclined] = useState([]);
  const inFlight = useRef(false);
  const endedAt = useRef(new Date().toISOString());
  const eligible = tasks.filter(t => t.status !== 'DONE');
  const visible = eligible.filter(t => `${t.title} ${t.project?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const minutes = Math.max(0, Math.floor((new Date(endedAt.current) - new Date(visit.checkedInAt)) / 60000));
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

  useEffect(() => {
    let alive = true;
    get('/api/projects').then(rows => {
      if (!alive) return;
      const available = (Array.isArray(rows) ? rows : []).filter(p => !p.trainingForMemberId && p.status !== 'ARCHIVED');
      setProjects(available);
      setProjectId(id => id || available[0]?.id || '');
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const manual = useMemo(() => selected.flatMap(id => {
    const task = tasks.find(t => t.id === id);
    return task && statuses[id] && statuses[id] !== task.status ? [{
      projectId: task.projectId, type: 'SET_STATUS', targetTaskId: id,
      params: { status: statuses[id] }, rationale: 'Status selected in your lab wrap-up.', accepted: !declined.includes(id),
    }] : [];
  }), [selected, statuses, tasks, declined]);
  // An explicit status choice wins over a generated suggestion for that task.
  const actions = [...manual, ...plan.filter(a => !(a.type === 'SET_STATUS' && manual.some(m => m.targetTaskId === a.targetTaskId)))];
  const accepted = actions.filter(a => a.accepted);

  async function run(label, fn) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(label); setError('');
    try { await fn(); } catch (err) { setError(err?.message || 'Something went wrong. Your choices are still here.'); }
    finally { inFlight.current = false; setBusy(''); }
  }

  function finish() { if (!inFlight.current) { if (closed) onComplete(closed); else onClose(); } }

  function generate() {
    run('plan', async () => {
      const context = selected.map(id => tasks.find(t => t.id === id)).filter(t => t?.projectId === projectId);
      const result = await suggestActions(projectId,
        `Turn this lab session recap into a small action plan. Only propose CREATE_TASK, SET_STATUS, or ADD_COMMENT. ` +
        `Only mark work DONE when explicitly stated; do not invent accomplishments. ` +
        `Selected tasks: ${JSON.stringify(context.map(t => ({ id: t.id, title: t.title, status: t.status })))}. ` +
        `Recap: ${recap.trim()}`);
      const items = (result.actions ?? []).filter(a => SUPPORTED.has(a.type) && (a.type === 'CREATE_TASK' || tasks.some(t => t.id === a.targetTaskId && t.projectId === projectId)))
        .map(a => ({ ...a, params: a.type === 'CREATE_TASK'
          ? { title: a.params.title, description: a.params.description, ...(visit.memberId ? { assigneeIds: [visit.memberId] } : {}) }
          : a.type === 'SET_STATUS' ? { status: a.params.status } : { content: a.params.content } }));
      setPlan(items.map(a => ({ ...a, projectId, accepted: true })));
      if (!items.length) setError('No task changes suggested. You can still save your recap and check out.');
    });
  }

  function checkout() {
    run('checkout', async () => {
      const result = await labCheckOut(endedAt.current, { visitId: visit.id, taskIds: selected, recap: recap.trim(), ...(other ? { other: true } : {}) });
      setClosed(result);
    });
  }

  function apply() {
    run('apply', async () => {
      // Remove each submitted group before sending: a lost response must not let
      // a retry create the same task/comment twice. Definite failures are restored.
      const groups = new Map();
      accepted.forEach(a => groups.set(a.projectId, [...(groups.get(a.projectId) ?? []), a]));
      let failures = 0;
      for (const [id, group] of groups) {
        setPlan(prev => prev.filter(a => !group.includes(a)));
        setStatuses(prev => Object.fromEntries(Object.entries(prev).filter(([taskId]) => !group.some(a => a.targetTaskId === taskId && manual.includes(a)))));
        let result;
        try { result = await executePlan(id, group.map(({ projectId: _, accepted: __, ...a }) => a)); }
        catch (err) { throw new Error(`Your visit is saved. Task update results could not be confirmed. Check the project before trying those changes again. ${err.message ?? ''}`); }
        const failed = [];
        for (let index = 0; index < group.length; index++) {
          const a = group[index];
          const r = result.results?.find(row => row.index === index);
          if (r?.ok) setApplied(n => n + 1);
          else { failures++; failed.push({ ...a, accepted: false, error: r?.error || 'Update was not confirmed.' }); }
        }
        setPlan(prev => [...prev, ...failed]);
      }
      if (failures) setError(`${failures} changes could not be applied. Review the messages below; your check-out is saved.`);
    });
  }

  function editPlan(item, patch) {
    if (manual.includes(item)) {
      if ('accepted' in patch) setDeclined(prev => patch.accepted ? prev.filter(id => id !== item.targetTaskId) : [...prev, item.targetTaskId]);
      if (patch.params) setStatuses(prev => ({ ...prev, [item.targetTaskId]: patch.params.status }));
    } else setPlan(prev => prev.map(a => a === item ? { ...a, ...patch } : a));
  }

  return (
    <MobileSheet title="Lab wrap-up" onClose={finish} variant="fullscreen" className="pm-lab-checkout-layer"
      footer={<div className="pm-lab-checkout-footer">
        <span>{closed ? 'Your visit is saved.' : 'Task changes are applied only after review.'}</span>
        {closed ? <>
          {accepted.length > 0 && <button className="cpm-btn cpm-btn-primary" disabled={!!busy} onClick={apply}>{busy === 'apply' ? 'Applying…' : `Apply ${accepted.length} ${accepted.length === 1 ? 'change' : 'changes'}`}</button>}
          <button className="cpm-btn cpm-btn-ghost" disabled={!!busy} onClick={finish}>Finish</button>
        </> : <button className="cpm-btn cpm-btn-primary" disabled={!!busy} onClick={checkout}>{busy === 'checkout' ? 'Saving…' : 'Save & check out'} <i className="fas fa-arrow-right" aria-hidden="true" /></button>}
      </div>}>
      <fieldset className="pm-lab-checkout" disabled={!!busy}>
        <div className={`pm-lab-checkout-hero${closed ? ' is-complete' : ''}`}>
          <div className="pm-lab-checkout-orbit"><i className={`fas ${closed ? 'fa-check' : 'fa-flask'}`} aria-hidden="true" /></div>
          <div><span className="pm-lab-checkout-eyebrow">{visit.workspace?.name} · {duration}</span>
            <h3>{closed ? 'Good work. You’re checked out.' : 'What did you work on?'}</h3>
            <p>{closed ? (actions.length ? 'One session closer. Review your task changes below, then finish.' : 'Your lab time is recorded. See you next session.') : 'Capture today’s progress and set up your next session.'}</p>
          </div>
        </div>
        {error && <div className="pm-lab-checkout-error" role="alert">{error}</div>}
        {closed ? <div className="pm-lab-checkout-receipt" role="status">
          <strong>{closed.discarded ? 'Short visit saved' : `${duration} in the lab`}</strong>
          {closed.discarded && <p>Short visits count toward your lab attendance, but do not log time to tasks.</p>}
          {(closed.allocations ?? []).map(a => <p key={a.taskId ?? a.title}><i className="fas fa-clock" aria-hidden="true" /> {a.minutes}m → {a.title}</p>)}
          {closed.unallocatedMinutes > 0 && <p>{closed.unallocatedMinutes}m saved for allocation later.</p>}
          {closed.otherMinutes > 0 && <p><i className="fas fa-user" aria-hidden="true" /> {closed.otherMinutes}m logged to you · Other</p>}
          {applied > 0 && <p>{applied} task {applied === 1 ? 'change' : 'changes'} applied.</p>}
        </div> : <>
          <section className="pm-lab-checkout-section">
            <div className="pm-lab-checkout-section-title"><h4><span>01</span> Your assigned tasks</h4><small>{other ? 'Other selected' : `${selected.length} selected`}</small></div>
            <p>Select the tasks you worked on to split time evenly, or choose Other to log the session just to you. All lab time counts toward your attendance.</p>
            <label className="pm-lab-checkout-search"><i className="fas fa-search" aria-hidden="true" /><input aria-label="Search assigned tasks" placeholder="Find a task or project…" value={query} onChange={e => setQuery(e.target.value)} /></label>
            <div className="pm-lab-checkout-tasks">
              {visible.map(task => <div key={task.id} className={`pm-lab-checkout-task${selected.includes(task.id) ? ' is-selected' : ''}`}>
                <label><input type="checkbox" checked={selected.includes(task.id)} onChange={e => { setOther(false); setSelected(prev => e.target.checked ? [...prev, task.id] : prev.filter(id => id !== task.id)); }} />
                  <span><strong>{task.title}</strong><small>{task.project?.name} · {STATUSES[task.status] ?? task.status}</small></span>
                </label>
                {selected.includes(task.id) && <select aria-label={`Status for ${task.title}`} value={statuses[task.id] ?? task.status} onChange={e => setStatuses(prev => ({ ...prev, [task.id]: e.target.value }))}>
                  {Object.entries(STATUSES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>}
              </div>)}
              {!visible.length && <div className="pm-lab-checkout-empty">{eligible.length ? 'No matching tasks.' : 'No open assigned tasks. Tell us what you worked on below.'}</div>}
            </div>
            <div className={`pm-lab-checkout-task pm-lab-checkout-other${other ? ' is-selected' : ''}`}>
              <label><input type="checkbox" checked={other} onChange={e => { setOther(e.target.checked); if (e.target.checked) setSelected([]); }} />
                <span><strong>Other</strong><small>Log the whole session to me, without a task.</small></span>
              </label>
              <i className="fas fa-user" aria-hidden="true" />
            </div>
          </section>
          <section className="pm-lab-checkout-section">
            <div className="pm-lab-checkout-section-title"><h4><span>02</span> The session recap</h4><small>Optional</small></div>
            <textarea aria-label="What you worked on" rows={4} maxLength={4000} placeholder="Tested the sensor mount. Finished the CAD review. Next time: print the revised bracket…" value={recap} onChange={e => { setRecap(e.target.value); setPlan([]); }} />
            <div className="pm-lab-checkout-compose">
              <select aria-label="Action plan project" value={projectId} onChange={e => { setProjectId(e.target.value); setPlan([]); }}>
                <option value="">Choose a project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="cpm-btn cpm-btn-ghost" disabled={!!busy || !projectId || !recap.trim()} onClick={generate}><i className={`fas ${busy === 'plan' ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`} aria-hidden="true" /> {busy === 'plan' ? 'Building plan…' : 'Build action plan'}</button>
            </div>
            <p>Your recap is saved with this visit. Build a plan for one project at a time; all changes are yours to review.</p>
          </section>
        </>}
        {actions.length > 0 && <section className="pm-lab-checkout-section">
          <div className="pm-lab-checkout-section-title"><h4><span>03</span> Your next moves</h4><small>{accepted.length} ready</small></div>
          <p>{closed ? 'Select the changes to apply now.' : 'Review these now; apply them after your visit is saved.'}</p>
          {actions.map((item, i) => <div key={i} className="pm-lab-checkout-action">
            <label><input type="checkbox" checked={item.accepted} disabled={!!busy} onChange={e => editPlan(item, { accepted: e.target.checked })} />
              <strong>{item.type === 'CREATE_TASK' ? 'Create task' : item.type === 'SET_STATUS' ? 'Change status' : 'Add comment'}{item.targetTaskId ? ` · ${tasks.find(t => t.id === item.targetTaskId)?.title ?? item.targetTaskId}` : ''}</strong>
            </label>
            {item.type === 'SET_STATUS' ? <select aria-label={`Proposed status ${i + 1}`} disabled={!!busy} value={item.params.status} onChange={e => editPlan(item, { params: { ...item.params, status: e.target.value } })}>{Object.entries(STATUSES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              : <textarea aria-label={`Proposed ${item.type === 'CREATE_TASK' ? 'task' : 'comment'} ${i + 1}`} disabled={!!busy} value={item.params[item.type === 'CREATE_TASK' ? 'title' : 'content'] ?? ''} onChange={e => editPlan(item, { params: { ...item.params, [item.type === 'CREATE_TASK' ? 'title' : 'content']: e.target.value } })} />}
            {item.type === 'CREATE_TASK' && <>
              <textarea aria-label={`Proposed description ${i + 1}`} disabled={!!busy} value={item.params.description ?? ''} placeholder="Task description" onChange={e => editPlan(item, { params: { ...item.params, description: e.target.value } })} />
              <small>New task · To do · Assigned to you</small>
            </>}
            <p>{item.rationale}</p>{item.error && <p role="alert">{item.error}</p>}
          </div>)}
        </section>}
      </fieldset>
    </MobileSheet>
  );
}
