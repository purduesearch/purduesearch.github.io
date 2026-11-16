import { useEffect, useId, useRef, useState } from 'react';
import { careerApi } from '../../../api/clubPmClient';

export const MAX_TARGETS = 3;
const errText = (e, fallback) => (e?.message && e.message !== 'Unknown error' ? e.message : fallback);

/** Search O*NET occupations and add one as a target role. `onAdd(code)` must resolve once saved and reject with an Error on failure. */
export default function OccupationPicker({ targets, onAdd, onClose }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const guard = useRef(false);
  const full = targets.length >= MAX_TARGETS;
  const chosen = new Set(targets.map(t => t.code));

  useEffect(() => {
    const term = q.trim();
    const mine = ++seq.current;
    if (term.length < 2) { setResults(null); setSearching(false); return undefined; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await careerApi.searchOccupations(term);
        if (seq.current === mine) { setResults(r.results || []); setError(''); }
      } catch (e) {
        if (seq.current === mine) { setResults(null); setError(errText(e, 'Search failed. Try again.')); }
      } finally { if (seq.current === mine) setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const add = async occ => {
    if (guard.current || full) return;
    guard.current = true; setSaving(true); setError('');
    try { await onAdd(occ.code); setQ(''); setResults(null); }
    catch (e) { setError(errText(e, 'Could not save that role.')); }
    finally { guard.current = false; setSaving(false); }
  };

  return <div className="pm-career-picker">
    <label className="pm-career-edit-label" htmlFor={`${id}-q`}>Search occupations</label>
    <div className="pm-career-picker-row">
      <input id={`${id}-q`} type="search" className="pm-career-input" value={q} onChange={e => setQ(e.target.value)}
        placeholder="For example, mechanical engineers" disabled={full} autoComplete="off" maxLength={80} aria-describedby={`${id}-hint`} />
      {onClose && <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={onClose}>Done</button>}
    </div>
    <p id={`${id}-hint`} className="pm-career-muted">
      {full ? `You have ${MAX_TARGETS} target roles. Remove one to add another.` : `Type at least 2 letters. You can pick up to ${MAX_TARGETS} roles.`}
    </p>
    {error && <p className="pm-career-error" role="alert">{error}</p>}
    {searching && <p className="pm-career-muted" role="status">Searching…</p>}
    {results && !searching && (results.length === 0
      ? <p className="pm-career-muted" role="status">No occupations match that search.</p>
      : <ul className="pm-career-results" aria-label="Matching occupations">{results.map(r => <li key={r.code}>
        <button type="button" className="pm-career-result" disabled={saving || full || chosen.has(r.code)} onClick={() => add(r)}>
          <span>{r.title}</span><code>{r.code}</code>
          {chosen.has(r.code) && <small>Already a target</small>}
        </button>
      </li>)}</ul>)}
  </div>;
}
