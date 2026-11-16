import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { careerApi } from '../../../api/clubPmClient';
import { useClubPmAuth } from '../../../clubpm/ClubPmAuth';
import ResumeBuilder from './ResumeBuilder';
import PathwayView from './PathwayView';
import OccupationPicker from './OccupationPicker';
import CareerSettings from './CareerSettings';
import IntroInbox from './IntroInbox';

/** Mirrors backend validateMemberTemplate: {n} exactly once, no other braces, 300 chars max. */
export function validateTemplate(t) {
  if (typeof t !== 'string' || !t.trim()) return 'Wording cannot be empty.';
  if (t.length > 300) return 'Wording must be at most 300 characters.';
  if ((t.match(/\{n\}/g) || []).length !== 1) return 'Wording must contain {n} exactly once. It becomes your counted number.';
  if (/[{}]/.test(t.replace('{n}', ''))) return 'Only the {n} placeholder is allowed. Remove other braces.';
  return null;
}

const errText = (e, fallback) => (e?.message && e.message !== 'Unknown error' ? e.message : fallback);

function ProofBadge({ proof, pending, status }) {
  let label; let tone;
  if (proof === 'RECORDS') { label = 'Counted from records'; tone = 'records'; }
  else if (proof === 'CLAIM') {
    if (status === 'VERIFIED') { label = 'Your claim · verified'; tone = 'verified'; }
    else if (status === 'NEEDS_PROOF') { label = 'Your claim · needs proof'; tone = 'pending'; }
    else { label = 'Your claim · pending'; tone = 'pending'; }
  } else if (pending) { label = 'Waiting for lead'; tone = 'pending'; }
  else { label = 'Lead-verified'; tone = 'verified'; }
  return <span className={`pm-career-proof pm-career-proof--${tone}`}>{label}</span>;
}

function BulletRow({ bullet, claim, value, onToggle, onSave, busy }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const err = editing ? validateTemplate(draft) : null;
  const startEdit = () => {
    const v = String(value ?? '');
    setDraft(v && bullet.text.includes(v) ? bullet.text.replace(v, '{n}') : '');
    setEditing(true);
  };
  const save = async () => { if (validateTemplate(draft)) return; if (await onSave(bullet, draft)) setEditing(false); };
  const source = bullet.proof === 'CLAIM' ? 'Your claim' : bullet.proof === 'CONFIRMED' ? 'Lead-confirmed' : 'Records';
  return <li className={`pm-career-bullet${bullet.pending ? ' is-pending' : ''}`}>
    <label className="pm-career-check">
      <input type="checkbox" checked={bullet.selected && !bullet.hidden} disabled={busy}
        onChange={e => onToggle(bullet, e.target.checked)} aria-label={`Include: ${bullet.text}`} />
    </label>
    <div className="pm-career-bullet-body">
      {editing ? <>
        <label className="pm-career-edit-label" htmlFor={`tpl-${bullet.key}`}>Wording (keep {'{n}'} where the number goes)</label>
        <textarea id={`tpl-${bullet.key}`} className="pm-career-input" rows={2} value={draft} onChange={e => setDraft(e.target.value)} aria-invalid={!!err} />
        {err && <p className="pm-career-error" role="alert">{err}</p>}
        <div className="pm-career-row-actions">
          <button type="button" className="pm-career-btn" onClick={save} disabled={!!err || busy}>Save wording</button>
          <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={() => setEditing(false)}>Cancel</button>
          {!claim && <button type="button" className="pm-career-btn pm-career-btn--ghost" disabled={busy}
            onClick={async () => { if (await onSave(bullet, null)) setEditing(false); }}>Reset to default</button>}
        </div>
      </> : <>
        <p>{bullet.text}</p>
        <div className="pm-career-pills">
          <span className="pm-career-pill">{source}</span>
          <ProofBadge proof={bullet.proof} pending={bullet.pending} status={claim?.status} />
          {bullet.pending && <span className="pm-career-pill pm-career-pill--warn">Pending: not in exports</span>}
          <button type="button" className="pm-career-link" onClick={startEdit} disabled={busy}>Edit wording</button>
        </div>
      </>}
    </div>
  </li>;
}

export default function CareerView() {
  const { member } = useClubPmAuth() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [openRole, setOpenRole] = useState(null);
  const [picking, setPicking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try { const r = await careerApi.me(); if (seq.current === id) { setData(r); setError(false); } }
    catch { if (seq.current === id) setError(true); }
  }, []);
  useEffect(() => { load(); return () => { seq.current++; }; }, [load]);

  const mutate = async fn => {
    if (guard.current) return false;
    guard.current = true; setBusy(true);
    try { await fn(); await load(); return true; }
    catch (e) { toast.error(errText(e, 'Could not save that change')); return false; }
    finally { guard.current = false; setBusy(false); }
  };
  const toggle = (b, included) => mutate(() => careerApi.setBullet(b.sourceKind, b.sourceId, { included }));
  const saveTemplate = (b, template) => mutate(() => careerApi.setBullet(b.sourceKind, b.sourceId, { template }));
  const recompute = async () => {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try { await careerApi.recompute(); await load(); toast.success('Impact recounted'); }
    catch (e) { toast.error(e?.status === 429 ? 'Recount is limited to once a minute. Try again shortly.' : errText(e, 'Could not recount')); }
    finally { guard.current = false; setBusy(false); }
  };

  const saveTargets = async codes => { await careerApi.setTargets(codes); await load(); };
  const removeTarget = code => mutate(() => careerApi.setTargets((data.targets || []).filter(t => t.code !== code).map(t => t.code)));

  if (error) return <div className="pm-career-state" role="alert">Your career profile could not be loaded.<button type="button" className="pm-career-btn" onClick={() => { setError(false); setData(null); load(); }}>Try again</button></div>;
  if (!data) return <div className="pm-career-state" role="status">Loading your career profile…</div>;

  if (openRole) return <PathwayView code={openRole} snapshots={data.snapshots} attribution={data.attribution} onBack={() => setOpenRole(null)} />;

  const claims = (data.attestations || []).filter(a => a.kind === 'CLAIM' && a.status !== 'DECLINED');
  const claimById = Object.fromEntries(claims.map(c => [c.id, c]));
  const snapById = Object.fromEntries((data.snapshots || []).map(s => [s.metricId, s]));
  const tiles = (data.snapshots || []).filter(s => s.value > 0);
  const bullets = data.bullets || [];
  const name = member?.displayName || member?.name || '';

  return <div className="pm-career">
    <header className="pm-career-head">
      <div>
        <h2>Career profile</h2>
        <p>Every number is counted from Constellation records, verified by a lead, or marked as your own claim. Only you see this page until you choose what to share.</p>
      </div>
      <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={recompute} disabled={busy}><i className="fas fa-rotate" aria-hidden="true" /> Recount</button>
    </header>

    <section className="pm-career-section" aria-label="Target roles">
      <h3>Target roles</h3>
      {data.targets?.length
        ? <ul className="pm-career-chips">{data.targets.map(t => <li key={t.code} className="pm-career-chip">
          <button type="button" className="pm-career-chip-open" onClick={() => setOpenRole(t.code)} aria-label={`Open pathway for ${t.title}`}>{t.title} <code>{t.code}</code></button>
          <button type="button" className="pm-career-chip-remove" onClick={() => removeTarget(t.code)} disabled={busy} aria-label={`Remove ${t.title}`}><i className="fas fa-xmark" aria-hidden="true" /></button>
        </li>)}</ul>
        : <p className="pm-career-muted">No target roles yet. Add up to three to see what employers expect.</p>}
      {picking
        ? <OccupationPicker targets={data.targets || []} onAdd={code => saveTargets([...(data.targets || []).map(t => t.code), code])} onClose={() => setPicking(false)} />
        : <button type="button" className="pm-career-btn pm-career-btn--ghost pm-career-add" onClick={() => setPicking(true)} disabled={(data.targets || []).length >= 3}><i className="fas fa-plus" aria-hidden="true" /> Add role</button>}
      <p className="pm-career-muted">Sponsor sharing: {data.profile?.shareWithSponsors ? 'On' : 'Off'}. Public page: {data.profile?.showOnPublicPage ? 'On' : 'Off'}.{' '}
        <button type="button" className="pm-career-link" onClick={() => setSettingsOpen(true)}>Change in settings</button></p>
    </section>

    {settingsOpen
      ? <CareerSettings profile={data.profile} claims={claims} onSaved={load} onClose={() => setSettingsOpen(false)} />
      : <div><button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={() => setSettingsOpen(true)}><i className="fas fa-gear" aria-hidden="true" /> Settings</button></div>}

    <IntroInbox bullets={bullets} onOpenSettings={() => setSettingsOpen(true)} />

    <section className="pm-career-section" aria-label="Verified impact">
      <h3>Verified impact</h3>
      {tiles.length || claims.length ? <ul className="pm-career-tiles">
        {tiles.map(s => <li key={s.metricId} className="pm-career-tile">
          <ProofBadge proof={s.proof} pending={s.pending} />
          <strong>{s.value}</strong>
          <span>{s.label}</span>
          <small>{s.unit}</small>
          {s.dwaId && <small className="pm-career-dwa">O*NET work activity · <code>{s.dwaId}</code>{s.dwaTitle ? ` ${s.dwaTitle}` : ''}</small>}
        </li>)}
        {claims.map(c => <li key={c.id} className="pm-career-tile">
          <ProofBadge proof="CLAIM" status={c.status} />
          <strong>{c.value}</strong>
          <span>{c.label}</span>
          {c.unit && <small>{c.unit}</small>}
          {c.reviewNote && <small>{c.reviewNote}</small>}
        </li>)}
      </ul> : <p className="pm-career-muted">No counted impact yet. As your work lands in Constellation, it shows up here.</p>}
    </section>

    <div className="pm-career-split">
      <section className="pm-career-section" aria-label="Résumé bullets">
        <h3>Résumé bullets</h3>
        {bullets.length ? <ul className="pm-career-bullets">{bullets.map(b => {
          const claim = b.claimId ? claimById[b.claimId] : null;
          const value = claim ? claim.value : snapById[b.metricId]?.value;
          return <BulletRow key={b.key} bullet={b} claim={claim} value={value} busy={busy} onToggle={toggle} onSave={saveTemplate} />;
        })}</ul> : <p className="pm-career-muted">Bullets appear once you have counted impact.</p>}
      </section>
      <ResumeBuilder name={name} profile={data.profile} bullets={bullets} certifications={data.certifications || []} skills={data.skills || []} badges={data.badges?.items || []} />
    </div>

    <footer className="pm-career-attribution">{data.attribution}</footer>
  </div>;
}
