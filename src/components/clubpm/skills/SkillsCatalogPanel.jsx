import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { get, skillsAdminApi as api } from '../../../api/clubPmClient';
import SkillsRunPanel from './SkillsRunPanel';
import SkillsReview from './SkillsReview';
import { errorMessage, formatDay } from './skillsShared';

export default function SkillsCatalogPanel({ mode, isAdmin, taxonomy, taxonomyError, onRetry }) {
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [status, setStatus] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const guard = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [c, s] = await Promise.all([api.catalog(), api.status()]);
      if (mounted.current) { setCatalog(c); setStatus(s); setError(false); }
    } catch { if (mounted.current) setError(true); }
  }, [isAdmin]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; }; }, [refresh]);
  useEffect(() => {
    let live = true;
    if (isAdmin && mode === 'automation') get('/api/members').then(r => { if (live) setMembers(Array.isArray(r) ? r : []); }).catch(() => {});
    return () => { live = false; };
  }, [isAdmin, mode]);
  useEffect(() => {
    if (!status?.running && !status?.dryRun?.running) return undefined;
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh, status?.running, status?.dryRun?.running]);
  const mutate = async (fn, message) => {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try { await fn(); await refresh(); toast.success(message); }
    catch (e) { toast.error(errorMessage(e, 'Could not update the catalog')); }
    finally { guard.current = false; if (mounted.current) setBusy(false); }
  };
  const reversed = new Set(catalog?.changes.map(c => c.reversesId).filter(Boolean) ?? []);
  const source = taxonomy.find(s => s.id === sourceId), target = taxonomy.find(s => s.id === targetId);
  const policyChange = (key, value) => mutate(() => api.setCatalogPolicy({ revision: catalog.policy.revision, [key]: value }), 'Automation policy saved');
  return <section>
    <div className="pm-sk-section-head"><div><div className="pm-sk-eyebrow">{mode === 'automation' ? 'ADMIN / AUTOMATION' : 'THE SKILL LIBRARY'}</div><h2>{mode === 'automation' ? 'The system does the housekeeping.' : 'A shared language that grows with you.'}</h2><p>{mode === 'automation' ? 'Inspect source health, routine changes, and the decisions that need more context.' : 'Concepts come from real work. Equivalent names come together, with a history you can inspect.'}</p></div></div>
    {mode === 'library' && <>
      <label className="pm-sk-form-label">Search concepts and aliases<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try SolidWorks, Python, or another name" /></label>
      {taxonomyError ? <div className="pm-sk-empty" role="alert">The library could not be loaded. <button className="pm-sk-button secondary" onClick={onRetry}>Try again</button></div> : <div className="pm-sk-library-list">{taxonomy.filter(s => `${s.name} ${(s.aliases ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(s => <details className="pm-sk-card" key={s.id}><summary><strong>{s.name}</strong><span className={`pm-sk-pill ${s.lifecycle === 'PROVISIONAL' ? 'violet' : 'neutral'}`}>{s.lifecycle === 'PROVISIONAL' ? 'Provisional' : s.type.toLowerCase().replace('_', ' ')}</span></summary><p>{s.description || 'A curated concept in the club skill library. A definition can be added by an administrator.'}</p>{s.aliases.length > 0 && <p>Also known as: {s.aliases.join(', ')}</p>}<p>A concept’s existence does not establish anyone’s proficiency. Every assessment needs its own evidence or attributed statement.</p></details>)}</div>}
    </>}
    {isAdmin && error && <div className="pm-sk-empty" role="alert">Catalog status could not be loaded. <button className="pm-sk-button secondary" onClick={refresh}>Try again</button></div>}
    {isAdmin && !catalog && !error && <div className="pm-sk-empty" role="status">Loading automation history…</div>}
    {isAdmin && catalog && <>
      {mode === 'automation' && <>
        <div className="pm-sk-card pm-sk-policy"><div><span className={`pm-sk-pill ${catalog.policy.paused ? 'amber' : ''}`}>{catalog.policy.paused ? 'Automation paused' : 'Automation active'}</span><p>{catalog.policy.paused ? 'Future runs pause without deleting queued work or evidence.' : 'Source-backed discovery is automatic. Ambiguous candidates remain in review.'}</p></div><button className="pm-sk-button secondary" disabled={busy} onClick={() => policyChange('paused', !catalog.policy.paused)}>{catalog.policy.paused ? 'Resume automation' : 'Pause automation'}</button></div>
        <div className="pm-sk-card">
          <h3>Catalog policy</h3><label className="pm-sk-setting"><span>Automatically create supported provisional skills<small>Up to {catalog.policy.maxCreatesPerDay} concepts per UTC day</small></span><input type="checkbox" disabled={busy} checked={catalog.policy.autoCreate} onChange={e => policyChange('autoCreate', e.target.checked)} /></label>
          <label className="pm-sk-setting"><span>Automatically consolidate exact duplicate names<small>Matching type; no hierarchy, identity, or assertion conflicts</small></span><input type="checkbox" disabled={busy} checked={catalog.policy.autoConsolidate} onChange={e => policyChange('autoConsolidate', e.target.checked)} /></label>
          <p>Semantic consolidation stays in review until a separately validated equivalence policy is released. Existing-concept changes affecting more than {catalog.policy.maxAffectedMembers} members require review.</p>
          <form onSubmit={e => { e.preventDefault(); const value = Number(new FormData(e.currentTarget).get('budget')); policyChange('maxRunCostUsd', value); }}>
            <label className="pm-sk-form-label">Conservative per-run budget (USD)<input key={catalog.policy.maxRunCostUsd} name="budget" type="number" min="0.01" max="100" step="0.01" required defaultValue={catalog.policy.maxRunCostUsd} /></label>
            <p>Reserves generation, retries, and embedding costs before calls using configured token prices. Remaining work is deferred when the allowance is exhausted; provider billing may differ from the configured rates.</p><button className="pm-sk-button secondary" disabled={busy}>Save run budget</button>
          </form>
        </div>
        {status && <SkillsRunPanel status={status} members={members} onRefresh={refresh} />}
        <div className="pm-sk-section-head"><h2>Exceptions & corrections</h2></div><SkillsReview onChanged={refresh} />
      </>}
      <div className="pm-sk-section-head"><h2>Catalog change history</h2><small>Admin-only evidence and impact</small></div>
      {!catalog.changes.length && <div className="pm-sk-empty">No catalog decisions recorded yet. New automatic creations and consolidations will appear here.</div>}
      <div className="pm-sk-change-list">{catalog.changes.map(c => <article className="pm-sk-card" key={c.id}>
        <div className="pm-sk-section-head"><span className="pm-sk-pill">{c.automatic ? 'Automatic' : 'Admin'} · {c.kind.toLowerCase().replace('_', ' ')}</span><small>{formatDay(c.createdAt)}</small></div>
        <h3>{c.payload.sourceName ? `${c.payload.sourceName} → ${c.payload.targetName}` : c.payload.name || taxonomy.find(s => s.id === c.skillId)?.name || 'Catalog concept'}</h3><p>{c.reason}</p>
        {c.payload.definition && <p>{c.payload.definition}</p>}
        <small>Policy {c.policyVersion}{c.payload.memberIds ? ` · ${c.payload.memberIds.length} affected members` : ''} · {c.id}</small>
        {c.kind === 'CONSOLIDATE' && <div className="pm-sk-actions"><p>Original labels and statements retained. Duplicate credit is excluded; visibility remains restrictive.</p><button className="pm-sk-button secondary" disabled={busy || reversed.has(c.id)} onClick={() => mutate(() => api.reverseCatalogChange(c.id), 'Consolidation reversed; keep-separate decision recorded')}>{reversed.has(c.id) ? 'Reversed' : 'Undo consolidation'}</button></div>}
      </article>)}</div>
      {mode === 'library' && <form className="pm-sk-card" onSubmit={e => { e.preventDefault(); if (confirmed) mutate(async () => { await api.consolidate(sourceId, targetId); setSourceId(''); setTargetId(''); setConfirmed(false); onRetry(); }, 'Concepts consolidated; original records preserved'); }}>
        <h3>Consolidate an existing duplicate</h3><p>Choose two concepts only when their meaning, type, and scope are equivalent. Related concepts stay separate. The server rechecks hierarchy, disputes, conflicts, and dependencies before changing anything.</p>
        <div className="pm-sk-filters"><label className="pm-sk-form-label">Duplicate concept<select value={sourceId} onChange={e => { setSourceId(e.target.value); setConfirmed(false); }} required><option value="">Choose source</option>{taxonomy.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="pm-sk-form-label">Keep as canonical<select value={targetId} onChange={e => { setTargetId(e.target.value); setConfirmed(false); }} required><option value="">Choose target</option>{taxonomy.filter(s => s.id !== sourceId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
        {source && target && <div className="pm-sk-callout">{source.name} → {target.name}. Original evidence and human statements stay attached to their original identities. The most restrictive sharing choice applies.</div>}
        <label className="pm-sk-setting"><span>I checked that these describe the same concept and scope.</span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /></label><button className="pm-sk-button" disabled={busy || !confirmed || !source || !target}>Consolidate concepts</button>
      </form>}
    </>}
  </section>;
}
