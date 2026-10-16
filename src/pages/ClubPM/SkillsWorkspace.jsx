import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { skillsApi } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import MobileSheet from '../../components/clubpm/MobileSheet';
import SkillsSettings from '../../components/clubpm/skills/SkillsSettings';
import SkillsCatalogPanel from '../../components/clubpm/skills/SkillsCatalogPanel';
import { BAND_LABELS, LEVEL_LABELS, PROVENANCE_META, errorMessage, formatDay, sourceIcon } from '../../components/clubpm/skills/skillsShared';

function useMutation() {
  const guard = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try { await fn(); } catch (e) { toast.error(errorMessage(e, 'Could not save that change')); }
    finally { guard.current = false; setBusy(false); }
  };
  return [run, busy];
}
function Status({ children, error = false, onRetry }) {
  return <div className={`pm-sk-empty${error ? ' pm-sk-error' : ''}`} role={error ? 'alert' : 'status'}>{children}{onRetry && <button className="pm-sk-button secondary" onClick={onRetry}>Try again</button>}</div>;
}
function Pips({ level }) {
  return <span className="pm-sk-pips" role="img" aria-label={`Level ${level} of 5, ${LEVEL_LABELS[level]}`}>
    {[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= level ? 'on' : ''} />)}
  </span>;
}
const fromWork = s => s.provenances.find(p => p.provenance === 'AI_INFERRED');

function SkillDetail({ skill, data, onChanged, onClose }) {
  const [evidence, setEvidence] = useState(null);
  const [error, setError] = useState(false);
  const [reason, setReason] = useState('');
  const [flagging, setFlagging] = useState(false);
  const [run, busy] = useMutation();
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true; setEvidence(null); setError(false);
    skillsApi.evidence(skill.skillId).then(r => { if (live) setEvidence(r.evidence); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [skill.skillId, reload]);
  const isGoal = data.goals.some(g => g.id === skill.skillId);
  const disputed = data.disputes.some(d => d.status === 'OPEN' && (d.skillId === skill.skillId || skill.provenances.some(p => p.originalSkillId === d.skillId)));
  const toggleGoal = () => run(async () => {
    const ids = data.goals.map(g => g.id);
    if (!isGoal && ids.length >= 3) { toast.error('Choose up to three focus skills. Remove one in Growth first.'); return; }
    await skillsApi.setGoals(isGoal ? ids.filter(id => id !== skill.skillId) : [...ids, skill.skillId]);
    await onChanged(); toast.success(isGoal ? 'Focus skill removed' : 'Focus skill saved');
  });
  return <MobileSheet title={skill.name} onClose={onClose} variant="fullscreen" className="pm-skills-layer">
    <div className="pm-sk-detail">
      <div className="pm-sk-pills"><span className="pm-sk-pill">{skill.type.toLowerCase().replace('_', ' ')}</span>{skill.lifecycle === 'PROVISIONAL' && <span className="pm-sk-pill violet">Provisional concept</span>}{disputed && <span className="pm-sk-pill amber">Under review</span>}</div>
      {skill.description && <p>{skill.description}</p>}
      <h3>What the record says</h3>
      {skill.provenances.map((p, i) => <div className="pm-sk-assessment" key={`${p.originalSkillId ?? skill.skillId}-${p.provenance}-${p.assertedById}-${i}`}>
        <div><strong>{PROVENANCE_META[p.provenance].label}</strong><small>{p.provenance === 'AI_INFERRED' ? `${p.evidenceCount} supporting contributions · ${BAND_LABELS[p.confidenceBand]}` : `${p.assertedByName ? `${p.assertedByName} · ` : ''}${formatDay(p.computedAt)}`}</small>{p.note && <p>{p.note}</p>}{p.rationale && <p>{p.rationale}</p>}</div>
        <div>{LEVEL_LABELS[p.level]} · {p.level}/5<Pips level={p.level} /></div>
      </div>)}
      {skill.disagreement && <div className="pm-sk-callout">{skill.disagreement.detail}</div>}
      <h3>The work behind it</h3>
      {error ? <Status error onRetry={() => setReload(n => n + 1)}>Evidence could not be loaded.</Status> : evidence === null ? <Status>Loading evidence…</Status> : evidence.length === 0 ? <Status>No analyzed work is linked yet. Claims and endorsements remain separate statements.</Status> : evidence.map(e => <article className="pm-sk-story" key={e.id}>
        <div className="pm-sk-story-meta"><span className="pm-sk-pill"><i className={sourceIcon(e.source)} aria-hidden="true" /> {e.contribution.toLowerCase()}</span><small>{formatDay(e.occurredAt)}{e.projectName ? ` · ${e.projectName}` : ''}</small></div>
        <h4>{e.context?.title || 'Demonstrated contribution'}</h4><p>{e.summary}</p>
        {e.context?.role && <p><strong>Your connection:</strong> {e.context.role}</p>}
        <div className="pm-sk-source-meta">Outcome: {e.outcome.toLowerCase()} · Complexity {e.complexity}/5{e.modelVersion === 'manual' ? ' · Self-reported or lead-entered' : ''}</div>
        {e.context?.truncated && <div className="pm-sk-callout">The source context was truncated. This record may omit relevant details.</div>}
        {e.sourceUrl && /^https?:/.test(e.sourceUrl) && <a className="pm-sk-text-link" href={e.sourceUrl} target="_blank" rel="noreferrer">Open supporting source ↗</a>}
        {!e.sourceUrl && e.projectId && <Link className="pm-sk-text-link" to={`/clubpm/projects/${e.projectId}`} onClick={onClose}>Open source project ↗</Link>}
      </article>)}
      <div className="pm-sk-callout">An estimate describes the evidence available. Tool use does not establish every related technique, and old evidence does not prove current readiness. These are advisory estimates, not certifications.</div>
      <h3>Your next step</h3><p>Choose this as a focus skill to find accessible tasks that explicitly mention it. A suggestion never assigns work.</p>
      <button className="pm-sk-button" disabled={busy} onClick={toggleGoal}>{isGoal ? 'Remove focus skill' : 'Set as focus skill'}</button>
      <h3>Sharing</h3><p>New discoveries start privately. Public portfolio and teammate visibility are separate.</p>
      <label className="pm-sk-setting">Show to teammates<input type="checkbox" checked={skill.showToTeam === true} disabled={busy} onChange={e => { const checked = e.target.checked; run(async () => { await skillsApi.setSkillTeamVisible(skill.skillId, checked); await onChanged(); }); }} /></label>
      <label className="pm-sk-setting">Include in my portfolio when it is on<input type="checkbox" checked={skill.isPublic === true} disabled={busy} onChange={e => { const checked = e.target.checked; run(async () => { await skillsApi.setSkillPublic(skill.skillId, checked); await onChanged(); }); }} /></label>
      <button className="pm-sk-text-link" disabled={busy || disputed} onClick={() => setFlagging(!flagging)}>{disputed ? 'Correction awaiting review' : 'This looks wrong'}</button>
      {flagging && <form onSubmit={e => { e.preventDefault(); run(async () => { await skillsApi.dispute({ skillId: skill.skillId, reason }); await onChanged(); setFlagging(false); toast.success('Sent for review. The disputed result is withheld from shared views.'); }); }}>
        <label className="pm-sk-form-label">What looks wrong?<textarea required minLength={5} maxLength={500} rows={4} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button className="pm-sk-button" disabled={busy || reason.trim().length < 5}>Submit correction</button>
      </form>}
    </div>
  </MobileSheet>;
}

function Growth({ data, taxonomy, onChanged, openSettings }) {
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState(data.goals.map(g => g.id));
  const [query, setQuery] = useState('');
  const [run, busy] = useMutation();
  useEffect(() => { setChosen(data.goals.map(g => g.id)); }, [data.goals]);
  return <section>
    <div className="pm-sk-section-head"><div><div className="pm-sk-eyebrow">GROWTH THROUGH REAL WORK</div><h2>A next step worth taking.</h2><p>Pick a direction. Find useful work in projects you belong to.</p></div><button className="pm-sk-button secondary" onClick={() => setEditing(!editing)}>Edit focus skills</button></div>
    {editing && <form className="pm-sk-card" onSubmit={e => { e.preventDefault(); run(async () => { await skillsApi.setGoals(chosen); await onChanged(); setEditing(false); toast.success('Focus skills updated'); }); }}>
      <label className="pm-sk-form-label">Find a focus skill<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names and aliases" /></label>
      <fieldset className="pm-sk-goal-picker"><legend>Choose up to three ({chosen.length}/3)</legend>{taxonomy.filter(s => `${s.name} ${(s.aliases ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(s => <label key={s.id}><input type="checkbox" checked={chosen.includes(s.id)} disabled={busy || (!chosen.includes(s.id) && chosen.length === 3)} onChange={() => setChosen(ids => ids.includes(s.id) ? ids.filter(id => id !== s.id) : [...ids, s.id])} /> {s.name}</label>)}</fieldset>
      <button className="pm-sk-button" disabled={busy}>Save focus skills</button>
    </form>}
    <div className="pm-sk-goals">{data.goals.map(g => <div className="pm-sk-card" key={g.id}><span className="pm-sk-pill violet">Chosen by you</span><h3>{g.name}</h3><p>Your interest is separate from any assessment. Practice through an accessible project opportunity.</p></div>)}</div>
    {!data.goals.length && <Status>Choose a focus skill to personalize your next opportunities.</Status>}
    <div className="pm-sk-section-head"><h2>Opportunities for you</h2><small>No automatic assignments</small></div>
    <div className="pm-sk-opportunities">{data.opportunities.map(o => <article className="pm-sk-card" key={o.id}>
      <span className="pm-sk-pill violet">{o.saved ? 'Saved opportunity' : 'Open task'}</span><h3>{o.title}</h3><p>{o.projectName} · {o.estimatedHours != null ? `${o.estimatedHours}h estimated` : 'Estimate not set'}</p>
      {o.matches.map(m => <p className="pm-sk-match" key={m.skillId}>{m.reason}</p>)}
      {o.assigned && <p>This saved task now has assignees. Check with the project lead before joining.</p>}
      <div className="pm-sk-actions"><Link className="pm-sk-text-link" to={`/clubpm/projects/${o.projectId}?task=${o.id}`}>Open task ↗</Link><button className="pm-sk-button secondary" disabled={busy} aria-pressed={o.saved} onClick={() => run(async () => { await skillsApi.saveOpportunity(o.id, !o.saved); await onChanged(); })}>{o.saved ? 'Saved ✓' : 'Save'}</button></div>
    </article>)}</div>
    {!data.opportunities.length && <Status>No accessible open tasks explicitly match your focus skills yet. Try another focus, or ask a project lead about a paired opportunity.</Status>}
    <div className="pm-sk-callout"><strong>Learning doesn’t always leave a pull request.</strong> Capture fabrication, mentoring, outreach, and design-review work in your own words. <button className="pm-sk-text-link" onClick={openSettings}>Add work or context →</button></div>
  </section>;
}

function TeamCoverage({ projects }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true; setData(null); setError(false);
    if (projectId) skillsApi.coverage(projectId).then(r => { if (live) setData(r); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [projectId, retry]);
  const people = data?.members.filter(m => m.displayName.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <section>
    <div className="pm-sk-section-head"><div><div className="pm-sk-eyebrow">SHARED PROJECT CONTEXT</div><h2>Find someone to build with.</h2><p>Discover documented experience in your project. Ask about willingness and availability before planning work.</p></div></div>
    <div className="pm-sk-filters"><label className="pm-sk-form-label">Project<select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">Choose a project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="pm-sk-form-label">Find a teammate<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name" /></label></div>
    {!projectId ? <Status>Join a project to explore shared skill coverage.</Status> : error ? <Status error onRetry={() => setRetry(n => n + 1)}>Project coverage could not be loaded.</Status> : !data ? <Status>Loading shared project evidence…</Status> : <>
      <div className="pm-sk-callout">{data.notice}</div>
      <div className="pm-sk-team-list">{people.map(m => <article className="pm-sk-card" key={m.id}><div className="pm-sk-section-head"><div><Link className="pm-sk-text-link" to={`/clubpm/profile/${m.id}`}>{m.displayName}</Link>{m.title && <p>{m.title}</p>}</div><span className="pm-sk-pill neutral">Availability unknown</span></div>
        {m.hidden ? <p>This member keeps their skills private.</p> : !m.groups.length ? <p>No shared evidence available. Capability is unknown.</p> : m.groups.flatMap(g => g.skills).map(s => <div className="pm-sk-team-skill" key={s.skillId}><strong>{s.name}</strong><span>{LEVEL_LABELS[s.level]} · {s.confidence ? BAND_LABELS[s.confidence] : 'Member statement'}</span>{s.evidence.map((e, i) => <p key={i}>{e.summary} <small>{formatDay(e.date)}</small></p>)}</div>)}
      </article>)}</div>{!people.length && <Status>No matching teammates in this project.</Status>}{data.truncated && <p>Showing the first 150 project members.</p>}
    </>}
  </section>;
}

export default function SkillsWorkspace() {
  const { member } = useClubPmAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [taxonomy, setTaxonomy] = useState([]);
  const [taxonomyError, setTaxonomyError] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('all');
  const [settings, setSettings] = useState(false);
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadId.current;
    try { const r = await skillsApi.workspace(); if (loadId.current === id) { setData(r); setError(false); } }
    catch { if (loadId.current === id) setError(true); }
  }, []);
  const invalidateRequests = useCallback(() => { loadId.current++; }, []);
  useEffect(() => { load(); return invalidateRequests; }, [load, reload, invalidateRequests]);
  useEffect(() => {
    let live = true;
    skillsApi.taxonomy().then(r => { if (live) { setTaxonomy(r.skills); setTaxonomyError(false); } }).catch(() => { if (live) setTaxonomyError(true); });
    return () => { live = false; };
  }, [reload]);
  const canAdmin = member?.isAdmin || member?.role === 'ADMIN';
  const allowedViews = ['mine', 'growth', 'team', 'library', ...(canAdmin ? ['automation'] : [])];
  const active = allowedViews.includes(params.get('view')) ? params.get('view') : 'mine';
  const changeView = value => { const next = new URLSearchParams(params); next.set('view', value); next.delete('skill'); setParams(next); if (value === 'mine') load(); };
  const openSkill = id => { const next = new URLSearchParams(params); next.set('skill', id); setParams(next); };
  const closeSkill = () => { const next = new URLSearchParams(params); next.delete('skill'); setParams(next, { replace: true }); };
  const all = data?.groups.flatMap(g => g.skills.map(s => ({ ...s, area: g.groupName }))) ?? [];
  const selected = all.find(s => s.skillId === params.get('skill'));
  const filtered = all.filter(s => (area === 'all' || s.area === area) && `${s.name} ${s.area}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="pm-sk-workspace">
    <header className="pm-sk-header"><div><div className="pm-sk-eyebrow">CONSTELLATION / SKILLS</div><h1>Your next chapter starts here<span>.</span></h1><p>See what your work demonstrates. Find what you want to learn next.</p></div><button className="pm-sk-button secondary" aria-label="Portfolio and privacy" title="Portfolio and privacy" disabled={!data} onClick={() => setSettings(true)}>Portfolio & privacy <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /></button></header>
    <nav className="pm-sk-nav" aria-label="Skills sections">
      <button data-tour-id="skills.my" aria-current={active === 'mine' ? 'page' : undefined} onClick={() => changeView('mine')}>My skills</button>
      <button data-tour-id="skills.growth" aria-current={active === 'growth' ? 'page' : undefined} onClick={() => changeView('growth')}>Growth{data?.goals.length > 0 && <span>{data.goals.length}</span>}</button>
      <button data-tour-id="skills.team" aria-current={active === 'team' ? 'page' : undefined} onClick={() => changeView('team')}>Team coverage</button>
      <button data-tour-id="skills.library" aria-current={active === 'library' ? 'page' : undefined} onClick={() => changeView('library')}>Library</button>
      {canAdmin && <button data-tour-id="skills.automation" aria-current={active === 'automation' ? 'page' : undefined} onClick={() => changeView('automation')}>Automation <small>ADMIN</small></button>}
    </nav>
    {error ? <Status error onRetry={() => setReload(n => n + 1)}>Skills could not be loaded. Try again to refresh your record.</Status> : !data ? <Status>Loading your Skills workspace…</Status> : <>
      {active === 'mine' && <>
        <section className="pm-sk-hero"><div><div className="pm-sk-eyebrow">YOUR WORK, RECOGNIZED</div><h2>{all.length ? <>Your experience is<br /><em>taking shape.</em></> : <>Every skill starts<br /><em>with an experience.</em></>}</h2><p>{all.length ? 'Explore the contributions behind your skills, and choose where you want to go next.' : 'Connect your GitHub account, complete project work, or describe an experience to begin your record.'}</p><div className="pm-sk-stats"><div><strong>{all.length}</strong><small>skills in your record</small></div><div><strong>{data.summary.contributions}{data.summary.truncated ? '+' : ''}</strong><small>distinct contributions</small></div><div><strong>{data.summary.projects}</strong><small>projects explored</small></div></div></div><div className="pm-sk-orbit" aria-hidden="true"><div><i className="fas fa-star" /></div><i /><i /><i /><i /></div></section>
        <div className="pm-sk-section-head"><h2>Your skills <small>{all.length} in your record</small></h2><button className="pm-sk-text-link" onClick={() => setSettings(true)}>+ Add work or context</button></div>
        <div className="pm-sk-main-grid"><section><div className="pm-sk-filters"><label className="pm-sk-form-label"><span className="sr-only">Search your skills</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your skills…" /></label><label className="pm-sk-form-label"><span className="sr-only">Filter by area</span><select value={area} onChange={e => setArea(e.target.value)}><option value="all">All areas</option>{data.groups.map(g => <option key={g.groupId} value={g.groupName}>{g.groupName}</option>)}</select></label></div>
          <div className="pm-sk-list">{filtered.map(s => { const a = fromWork(s); const lead = a ?? s.provenances[0]; return <button className="pm-sk-row" key={s.skillId} onClick={() => openSkill(s.skillId)}><span><strong>{s.name}</strong><small>{s.area} · {s.type.toLowerCase().replace('_', ' ')}{s.lifecycle === 'PROVISIONAL' ? ' · Provisional' : ''}</small></span><span>{LEVEL_LABELS[lead.level]} · {lead.level}/5<Pips level={lead.level} /></span><span>{a ? BAND_LABELS[a.confidenceBand] : PROVENANCE_META[lead.provenance].label}<small>{a ? `${a.evidenceCount} contributions` : 'Statement recorded'}{lead.lastDemonstrated ? ` · ${formatDay(lead.lastDemonstrated)}` : ''}</small></span></button>; })}
            {!filtered.length && <Status>{all.length ? 'No matching skills. Try a different name or area.' : 'Nothing inferred yet. Weekly analysis reads completed tasks, Vault check-ins, and linked GitHub work. You can also add a claim or describe work.'}</Status>}
            <div className="pm-sk-list-foot">{data.lastAnalysisAt ? `Last successful analysis ${formatDay(data.lastAnalysisAt)}` : 'No completed analysis yet'} · Confidence and proficiency are separate</div>
          </div><div className="pm-sk-callout">{data.connections.githubLinked ? 'GitHub account linked.' : <Link to="/clubpm/profile">Link GitHub from your profile →</Link>} {data.connections.note}</div>
        </section><aside className="pm-sk-side"><div className="pm-sk-card violet"><div className="pm-sk-eyebrow">YOUR NEXT EXPERIENCE</div><h3>{data.goals[0] ? `Make room for ${data.goals[0].name}.` : 'Choose what you want to practice.'}</h3><p>Set up to three focus skills and explore real work in your projects.</p><button className="pm-sk-text-link" onClick={() => changeView('growth')}>Explore Growth ↗</button></div><div className="pm-sk-card"><h3>Recently recognized</h3>{data.recent.map(e => <div className="pm-sk-recent" key={e.id}><i className={sourceIcon(e.source)} aria-hidden="true" /><div><p>{e.summary}</p><small>{formatDay(e.occurredAt)}{e.projectName ? ` · ${e.projectName}` : ''}</small></div></div>)}{!data.recent.length && <p>Your recent project evidence will appear here.</p>}</div></aside></div>
      </>}
      {active === 'growth' && (taxonomyError ? <Status error onRetry={() => setReload(n => n + 1)}>The skill library could not be loaded.</Status> : <Growth data={data} taxonomy={taxonomy} onChanged={load} openSettings={() => setSettings(true)} />)}
      {active === 'team' && <TeamCoverage projects={data.projects} />}
      {(active === 'library' || active === 'automation') && <SkillsCatalogPanel mode={active} isAdmin={canAdmin} taxonomy={taxonomy} taxonomyError={taxonomyError} onRetry={() => setReload(n => n + 1)} />}
      {selected && <SkillDetail skill={selected} data={data} onChanged={load} onClose={closeSkill} />}
      {params.get('skill') && !selected && <div className="pm-sk-callout">This skill is not in your current record. <button className="pm-sk-text-link" onClick={closeSkill}>Dismiss</button></div>}
      {settings && <MobileSheet title="Your Skills settings" onClose={() => setSettings(false)} variant="fullscreen" className="pm-skills-layer"><div className="pm-sk-detail"><div className="pm-sk-callout">Choose teammate and public visibility separately by opening a skill. New discoveries start privately.</div><SkillsSettings data={{ ...data, projects: data.evidenceProjects ?? [] }} projects={data.projects} onChanged={load} /></div></MobileSheet>}
    </>}
    <footer className="pm-sk-footer">Evidence informs a conversation. Every level is an advisory estimate.</footer>
  </div>;
}
