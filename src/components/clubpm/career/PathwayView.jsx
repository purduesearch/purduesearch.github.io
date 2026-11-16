import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { careerApi } from '../../../api/clubPmClient';

const STATUS = {
  demonstrated: { label: 'Demonstrated', tone: 'demonstrated' },
  learning: { label: 'Learning', tone: 'learning' },
  claimed: { label: 'Claimed', tone: 'claimed' },
  none: { label: 'No evidence yet', tone: 'none' },
};
const statusOf = s => STATUS[s] || STATUS.none;
const fmtDay = d => { try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };

function StatusDot({ status }) {
  const s = statusOf(status);
  return <span className={`pm-career-status pm-career-status--${s.tone}`}><i aria-hidden="true" />{s.label}</span>;
}

function Signals({ signals, snapshots }) {
  if (!signals.length) return null;
  const snapBy = Object.fromEntries((snapshots || []).filter(s => s.value > 0).map(s => [s.metricId, s]));
  return <section className="pm-career-section" aria-label="Hiring signals">
    <h3>2026 hiring signals</h3>
    <p className="pm-career-muted">Curated by admins, each with its source. Shown as context, never scored.</p>
    <ul className="pm-career-signals">{signals.map(sig => {
      const proof = (sig.metricIds || []).map(id => snapBy[id]).find(Boolean);
      return <li key={sig.id} className="pm-career-signal">
        <strong>{sig.title}</strong>
        <p>{sig.summary}</p>
        <small>
          <a href={sig.sourceUrl} target="_blank" rel="noopener noreferrer">{sig.sourceName}</a>
          {sig.publishedOn ? ` · ${fmtDay(sig.publishedOn)}` : ''}
        </small>
        {proof && <p className="pm-career-proofline">Your proof: {proof.value} {proof.label}</p>}
      </li>;
    })}</ul>
  </section>;
}

export default function PathwayView({ code, snapshots, attribution, onBack }) {
  const [data, setData] = useState(null);
  const [signals, setSignals] = useState([]);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const id = ++seq.current;
    setError(false); setData(null);
    try {
      const p = await careerApi.pathway(code);
      if (seq.current === id) setData(p);
    } catch { if (seq.current === id) setError(true); return; }
    try {
      const s = await careerApi.demandSignals();
      if (seq.current === id) setSignals(s?.signals || []);
    } catch { if (seq.current === id) setSignals([]); }
  }, [code]);
  useEffect(() => { load(); return () => { seq.current++; }; }, [load]);

  const back = <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={onBack}><i className="fas fa-arrow-left" aria-hidden="true" /> Career profile</button>;
  if (error) return <div className="pm-career-state" role="alert">{back}This role&apos;s pathway could not be loaded.<button type="button" className="pm-career-btn" onClick={load}>Try again</button></div>;
  if (!data) return <div className="pm-career-state" role="status">{back}Loading pathway…</div>;

  const { occupation, tools = [], skills = [], emerging = [], related = [] } = data;
  const empty = !tools.length && !skills.length && !emerging.length;
  return <div className="pm-career pm-career-pathway">
    <header className="pm-career-head">
      <div>
        {back}
        <h2>{occupation.title}</h2>
        <p><code className="pm-career-soc">{occupation.code}</code></p>
        {related.length > 0 && <p className="pm-career-related">Related roles: {related.map(r => r.title).join(', ')}</p>}
      </div>
    </header>

    {empty && <p className="pm-career-muted" role="status">O*NET lists no tools or skills for this role yet.</p>}

    {tools.length > 0 && <section className="pm-career-section" aria-label="Tools">
      <h3>Tools employers expect</h3>
      <div className="pm-career-table-wrap"><table className="pm-career-table">
        <thead><tr><th scope="col">Tool</th><th scope="col">Flags</th><th scope="col">Your evidence</th></tr></thead>
        <tbody>{tools.map(t => <tr key={`${t.categoryId}-${t.example}`}>
          <th scope="row">{t.example}<code>{t.categoryId}</code></th>
          <td>{t.hot && <span className="pm-career-flag pm-career-flag--hot">HOT</span>}{t.inDemand && <span className="pm-career-flag pm-career-flag--demand">IN DEMAND</span>}</td>
          <td><StatusDot status={t.status} /></td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    {skills.length > 0 && <section className="pm-career-section" aria-label="Skills rated most important">
      <h3>Skills rated most important</h3>
      <ul className="pm-career-imps">{skills.map(s => <li key={s.elementId}>
        <div className="pm-career-imp-head"><span>{s.name}</span><StatusDot status={s.notInferred ? 'none' : s.status} /></div>
        <div className="pm-career-bar" role="img" aria-label={`Importance ${s.importance} of 5`}>
          <i data-testid="imp-bar" style={{ width: `${(Math.max(0, Math.min(5, s.importance)) / 5) * 100}%` }} />
        </div>
        <small>Importance {s.importance} of 5{s.notInferred ? '. Constellation does not infer this skill from records.' : ''}</small>
      </li>)}</ul>
    </section>}

    {emerging.length > 0 && <section className="pm-career-section" aria-label="Emerging work">
      <h3>Emerging tasks in this role</h3>
      {emerging.map(e => <article key={e.id} className="pm-career-emerging">
        <h4>{e.task}</h4>
        <small>{e.category}</small>
        {e.tasks?.length > 0 ? <ul>{e.tasks.map(t => <li key={t.id}>
          <Link to={`/clubpm/projects/${t.projectId}`}>{t.title}</Link> <small>{t.projectName}</small>
        </li>)}</ul> : <p className="pm-career-muted">No open club tasks match yet.</p>}
      </article>)}
    </section>}

    <Signals signals={signals} snapshots={snapshots} />
    <footer className="pm-career-attribution">{attribution}</footer>
  </div>;
}
