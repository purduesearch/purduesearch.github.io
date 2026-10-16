// Admin review queues: ambiguous/deferred concepts proposed by analysis,
// tags members flagged as wrong, and places where claims and data disagree.
// Approving, merging and upholding are the only ways any of this changes. The
// taxonomy itself has its own tab (SkillsTaxonomy).

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { skillsAdminApi as api } from "../../../api/clubPmClient";
import { PROVENANCE_META, errorMessage, formatDay, sourceIcon } from "./skillsShared";
import { SKILL_TYPES as TYPES, typeLabel } from "./SkillsTaxonomy";

const credited = (r) => (r?.credited ? ` and credited ${r.credited} piece${r.credited === 1 ? "" : "s"} of work` : "");

function useAction(onDone) {
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(); if (ok) toast.success(typeof ok === "function" ? ok(r) : ok); await onDone(); }
    catch (err) { toast.error(errorMessage(err, "That did not work")); }
    finally { setBusy(false); }
  };
  return [busy, run];
}

function Proposals({ skills, onChanged }) {
  const [items, setItems] = useState(null);
  const load = useCallback(async () => { try { setItems((await api.proposals()).proposals); } catch { setItems([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction(async () => { await load(); onChanged(); });
  const [mergeTarget, setMergeTarget] = useState({});
  const [types, setTypes] = useState({});
  const [parents, setParents] = useState({});
  const byId = useMemo(() => new Map(skills.map(s => [s.id, s])), [skills]);

  if (items === null) return <div className="cpm-skill-evidence-empty">Loading…</div>;
  if (!items.length) return <div className="cpm-skill-evidence-empty">No proposed skills waiting. Supported concepts can be created automatically; ambiguous or deferred candidates appear here.</div>;
  return (
    <ul className="cpm-skills-admin-people">
      {items.map(p => (
        <li key={p.id} className="cpm-skills-admin-person">
          <div className="cpm-skills-admin-person-head">
            <strong>{p.name}</strong>
            <span className="cpm-skill-meta">proposed {p.seenCount}×{p.suggestedType ? ` · suggested ${typeLabel(p.suggestedType)}` : ""}{p.evidenceIds?.length ? ` · approving credits ${p.evidenceIds.length} piece${p.evidenceIds.length === 1 ? "" : "s"} of work` : ""}</span>
          </div>
          {p.rationale && <p className="cpm-skills-notice">{p.rationale}</p>}
          {p.exceptionReason && <p className="cpm-skills-notice"><strong>Why review is needed:</strong> {p.exceptionReason}</p>}
          {p.description && <p className="cpm-skills-notice">Definition: {p.description}</p>}
          {p.supportingQuote && <blockquote className="cpm-skills-notice">{p.supportingQuote}</blockquote>}
          {p.nearSkillIds.length > 0 && (
            <p className="cpm-skills-notice">Looks close to: {p.nearSkillIds.map(id => byId.get(id)?.name).filter(Boolean).join(", ")}. Merge instead of adding a duplicate?</p>
          )}
          <div className="cpm-skill-actions">
            <select aria-label={`Type for ${p.name}`} value={types[p.id] ?? p.suggestedType ?? "TOOL"} onChange={e => setTypes(t => ({ ...t, [p.id]: e.target.value }))}>
              {TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <select aria-label={`Area for ${p.name}`} value={parents[p.id] ?? ""} onChange={e => setParents(x => ({ ...x, [p.id]: e.target.value }))}>
              <option value="">Top level</option>{skills.map(s => <option key={s.id} value={s.id}>under {s.name}</option>)}
            </select>
            <button type="button" className="cpm-profile-edit-save" disabled={busy} onClick={() => run(() => api.approveProposal(p.id, { type: types[p.id] ?? p.suggestedType ?? "TOOL", ...(parents[p.id] ? { parentIds: [parents[p.id]] } : {}) }), r => `Skill added${credited(r)}`)}>Add as new skill</button>
            <select aria-label={`Merge ${p.name} into`} value={mergeTarget[p.id] ?? ""} onChange={e => setMergeTarget(m => ({ ...m, [p.id]: e.target.value }))}>
              <option value="">Merge into…</option>{skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" className="cpm-profile-edit-cancel" disabled={busy || !mergeTarget[p.id]} onClick={() => run(() => api.mergeProposal(p.id, mergeTarget[p.id]), r => `Merged as another name${credited(r)}`)}>Merge</button>
            <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => run(() => api.rejectProposal(p.id), "Rejected. It will not be proposed again.")}>Reject</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Disputes({ onChanged }) {
  const [items, setItems] = useState(null);
  const [notes, setNotes] = useState({});
  const load = useCallback(async () => { try { setItems((await api.disputes()).disputes); } catch { setItems([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction(async () => { await load(); onChanged(); });

  if (items === null) return <div className="cpm-skill-evidence-empty">Loading…</div>;
  if (!items.length) return <div className="cpm-skill-evidence-empty">No flagged tags.</div>;
  return (
    <ul className="cpm-skills-admin-people">
      {items.map(d => (
        <li key={d.id} className="cpm-skills-admin-person">
          <div className="cpm-skills-admin-person-head"><strong>{d.memberName}</strong> flagged <strong>{d.skillName}</strong><span className="cpm-skill-meta">{formatDay(d.createdAt)}</span></div>
          <p className="cpm-skills-notice">“{d.reason}”</p>
          {d.evidence ? (
            <div className="cpm-skill-evidence-meta"><i className={sourceIcon(d.evidence.source)} aria-hidden="true" /> {d.evidence.summary} ({formatDay(d.evidence.occurredAt)})</div>
          ) : <div className="cpm-skill-evidence-meta">About the skill tag overall.</div>}
          <label className="cpm-skills-form">Note to the member (optional)
            <input value={notes[d.id] ?? ""} onChange={e => setNotes(n => ({ ...n, [d.id]: e.target.value }))} maxLength={500} />
          </label>
          <div className="cpm-skill-actions">
            <button type="button" className="cpm-profile-edit-save" disabled={busy} onClick={() => run(() => api.resolveDispute(d.id, "UPHELD", notes[d.id]), "Tag removed from scoring")}>They are right: remove the tag</button>
            <button type="button" className="cpm-profile-edit-cancel" disabled={busy} onClick={() => run(() => api.resolveDispute(d.id, "DISMISSED", notes[d.id]), "Kept")}>Keep the tag</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Disagreements() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.disagreements().then(r => setItems(r.items)).catch(() => setItems([])); }, []);
  if (items === null) return <div className="cpm-skill-evidence-empty">Loading…</div>;
  if (!items.length) return <div className="cpm-skill-evidence-empty">Claims and analysed work agree everywhere (within a level).</div>;
  return (
    <ul className="cpm-skills-admin-people">
      {items.map((d, i) => (
        <li key={i} className="cpm-skills-admin-person">
          <div className="cpm-skills-admin-person-head"><strong>{d.member.displayName}</strong> · {d.skill.name}</div>
          <div className="cpm-skill-meta">{d.detail}</div>
          <div className="cpm-skill-meta">{d.levels.map(l => `${PROVENANCE_META[l.provenance].label}: ${l.level}`).join(" · ")}</div>
        </li>
      ))}
    </ul>
  );
}

export default function SkillsReview({ onChanged }) {
  const [part, setPart] = useState("proposals");
  const [skills, setSkills] = useState([]);
  const loadSkills = useCallback(async () => { try { setSkills((await api.taxonomy()).skills); } catch { setSkills([]); } }, []);
  useEffect(() => { loadSkills(); }, [loadSkills]);
  const PARTS = [["proposals", "Proposed skills"], ["disputes", "Flagged tags"], ["disagreements", "Claims vs data"]];
  const active = skills.filter(s => s.status === "ACTIVE");

  return (
    <div>
      <div className="cpm-skills-admin-tabs cpm-skills-admin-tabs--sub" role="tablist" aria-label="Review queues">
        {PARTS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={part === id} className={part === id ? "on" : ""} onClick={() => setPart(id)}>{label}</button>)}
      </div>
      {part === "proposals" && <Proposals skills={active} onChanged={() => { loadSkills(); onChanged?.(); }} />}
      {part === "disputes" && <Disputes onChanged={() => onChanged?.()} />}
      {part === "disagreements" && <Disagreements />}
    </div>
  );
}
