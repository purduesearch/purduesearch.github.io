import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { careerApi } from '../../../api/clubPmClient';

const list = names => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** "Career & O*NET" section of the skill evidence drawer. Loads lazily; a failure never touches the evidence list. */
export default function SkillOnetSection({ skillId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const guard = useRef(false);
  useEffect(() => {
    let live = true; setData(null); setError(false); setAdded(false);
    Promise.resolve().then(() => careerApi.skillOnet(skillId))
      .then(r => { if (live) setData(r); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [skillId, reload]);

  const head = <h3>Career &amp; O*NET</h3>;
  if (error) return <section className="pm-career-onet" aria-label="Career and O*NET">
    {head}
    <p className="pm-career-muted" role="alert">O*NET details could not be loaded.</p>
    <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={() => setReload(n => n + 1)}>Try again</button>
  </section>;
  if (!data) return <section className="pm-career-onet" aria-label="Career and O*NET">{head}<p className="pm-career-muted" role="status">Loading O*NET details…</p></section>;

  const { placement = [], demand, numbers = [], suggestedBullet: sb, activities = [] } = data;
  if (!placement.length && !numbers.length && !activities.length) {
    return <section className="pm-career-onet" aria-label="Career and O*NET">{head}<p className="pm-career-muted">Not yet linked to O*NET.</p></section>;
  }
  const addBullet = async () => {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try { await careerApi.setBullet('METRIC', sb.metricId, { included: true }); setAdded(true); toast.success('Added to your résumé bullets'); }
    catch (e) { toast.error(e?.message && e.message !== 'Unknown error' ? e.message : 'Could not add that bullet'); }
    finally { guard.current = false; setBusy(false); }
  };
  const top = (demand?.topOccupations || []).map(o => o.title);
  return <section className="pm-career-onet" aria-label="Career and O*NET">
    {head}
    {placement.length > 0 && <nav className="pm-career-crumb" aria-label="O*NET placement" style={{ width: 'auto' }}>
      <ol>{placement.map((p, i) => <li key={`${p.id ?? 'x'}-${i}`}>{p.name}</li>)}</ol>
    </nav>}
    {demand?.hot && <p><span className="pm-career-flag pm-career-flag--hot">HOT</span></p>}
    {demand && demand.occupationsListed > 0 && <p className="pm-career-demand">
      Listed for {demand.occupationsListed} O*NET occupations; employers flag it as in demand for {demand.inDemandOccupations}{top.length ? `, including ${list(top)}` : ''}.
    </p>}
    {numbers.length > 0 && <>
      <h4>Your numbers</h4>
      <ul className="pm-career-tiles">{numbers.map(n => <li key={n.metricId} className="pm-career-tile">
        <strong>{n.value}</strong><span>{n.label}</span><small>{n.unit}</small>
      </li>)}</ul>
    </>}
    {sb && <div className="pm-career-suggest">
      <h4>Suggested résumé bullet</h4>
      <p>{sb.text}</p>
      <button type="button" className="pm-career-btn" onClick={addBullet} disabled={busy || added || sb.pending}>
        {sb.pending ? 'Waiting for verification' : added ? 'Added to résumé' : 'Add to résumé'}
      </button>
    </div>}
    {activities.length > 0 && <>
      <h4>Linked work activities</h4>
      <ul className="pm-career-dwa-list">{activities.map(a => <li key={a.dwaId}><code>{a.dwaId}</code> {a.name}</li>)}</ul>
    </>}
    <p className="pm-career-attribution">{data.attribution}</p>
  </section>;
}
