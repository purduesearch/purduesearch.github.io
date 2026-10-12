// Admin review queues: skills the analysis proposed (it can never add one itself),
// tags members flagged as wrong, places where claims and data disagree, and the
// taxonomy. Approving, merging and upholding are the only ways any of this changes.

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { skillsAdminApi as api } from "../../../api/clubPmClient";
import { PROVENANCE_META, errorMessage, formatDay, sourceIcon } from "./skillsShared";

const TYPES = ["TOOL", "TECHNIQUE", "DOMAIN", "SOFT_SKILL"];
const typeLabel = (t) => t.toLowerCase().replace("_", " ");

function useAction(onDone) {
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await onDone(); }
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
  const byId = useMemo(() => new Map(skills.map(s => [s.id, s])), [skills]);

  if (items === null) return <div className="cpm-skill-evidence-empty">Loading…</div>;
  if (!items.length) return <div className="cpm-skill-evidence-empty">No proposed skills waiting. New names only appear here; none are added automatically.</div>;
  return (
    <ul className="cpm-skills-admin-people">
      {items.map(p => (
        <li key={p.id} className="cpm-skills-admin-person">
          <div className="cpm-skills-admin-person-head">
            <strong>{p.name}</strong>
            <span className="cpm-skill-meta">seen {p.seenCount}×{p.suggestedType ? ` · suggested ${typeLabel(p.suggestedType)}` : ""}</span>
          </div>
          {p.rationale && <p className="cpm-skills-notice">{p.rationale}</p>}
          {p.nearSkillIds.length > 0 && (
            <p className="cpm-skills-notice">Looks close to: {p.nearSkillIds.map(id => byId.get(id)?.name).filter(Boolean).join(", ")}. Merge instead of adding a duplicate?</p>
          )}
          <div className="cpm-skill-actions">
            <select aria-label={`Type for ${p.name}`} value={types[p.id] ?? p.suggestedType ?? "TOOL"} onChange={e => setTypes(t => ({ ...t, [p.id]: e.target.value }))}>
              {TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <button type="button" className="cpm-profile-edit-save" disabled={busy} onClick={() => run(() => api.approveProposal(p.id, { type: types[p.id] ?? p.suggestedType ?? "TOOL" }), "Skill added")}>Add as new skill</button>
            <select aria-label={`Merge ${p.name} into`} value={mergeTarget[p.id] ?? ""} onChange={e => setMergeTarget(m => ({ ...m, [p.id]: e.target.value }))}>
              <option value="">Merge into…</option>{skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" className="cpm-profile-edit-cancel" disabled={busy || !mergeTarget[p.id]} onClick={() => run(() => api.mergeProposal(p.id, mergeTarget[p.id]), "Merged as an alias")}>Merge</button>
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

function Taxonomy({ skills, onChanged }) {
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", type: "TOOL", parentId: "", aliases: "" });
  const [aliasFor, setAliasFor] = useState({});
  const [busy, run] = useAction(async () => { await onChanged(); });
  const shown = useMemo(() => skills.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.aliases.some(a => a.alias.toLowerCase().includes(q.toLowerCase()))).slice(0, 60), [skills, q]);

  return (
    <div>
      <form className="cpm-skills-form" onSubmit={e => {
        e.preventDefault();
        run(async () => {
          await api.createSkill({ name: form.name, type: form.type, parentIds: form.parentId ? [form.parentId] : [], aliases: form.aliases.split(",").map(a => a.trim()).filter(Boolean) });
          setForm({ name: "", type: "TOOL", parentId: "", aliases: "" });
        }, "Skill added");
      }}>
        <strong>Add a skill</strong>
        <label>Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required maxLength={80} /></label>
        <label>Type<select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}</select></label>
        <label>Under<select value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}><option value="">Top level</option>{skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Other names (comma separated)<input value={form.aliases} onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))} placeholder="ReactJS, React.js" /></label>
        <div className="cpm-skill-actions"><button type="submit" className="cpm-profile-edit-save" disabled={busy || !form.name.trim()}>Add</button></div>
      </form>
      <label className="cpm-skills-form" style={{ marginTop: 14 }}>Find a skill<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search names and aliases" /></label>
      <ul className="cpm-skills-admin-people">
        {shown.map(s => (
          <li key={s.id} className="cpm-skills-admin-person">
            <div className="cpm-skills-admin-person-head"><strong>{s.name}</strong><span className="cpm-skill-meta">{typeLabel(s.type)} · {s.source} · {s.people} {s.people === 1 ? "person" : "people"}{s.status === "DEPRECATED" ? " · deprecated" : ""}</span></div>
            <div className="cpm-skill-meta">
              {s.aliases.length ? s.aliases.map(a => (
                <span key={a.id} className="cpm-skill-pill">{a.alias} <button type="button" className="cpm-skill-link" aria-label={`Remove alias ${a.alias}`} disabled={busy} onClick={() => run(() => api.removeAlias(a.id), "Alias removed")}>×</button></span>
              )) : "No other names."}
            </div>
            <div className="cpm-skill-actions">
              <input aria-label={`New alias for ${s.name}`} value={aliasFor[s.id] ?? ""} onChange={e => setAliasFor(a => ({ ...a, [s.id]: e.target.value }))} placeholder="Add another name" maxLength={80} />
              <button type="button" className="cpm-profile-edit-cancel" disabled={busy || !(aliasFor[s.id] ?? "").trim()} onClick={() => run(async () => { await api.addAlias(s.id, aliasFor[s.id]); setAliasFor(a => ({ ...a, [s.id]: "" })); }, "Alias added")}>Add name</button>
              <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => run(() => api.patchSkill(s.id, { status: s.status === "ACTIVE" ? "DEPRECATED" : "ACTIVE" }), s.status === "ACTIVE" ? "Deprecated" : "Restored")}>{s.status === "ACTIVE" ? "Deprecate" : "Restore"}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SkillsReview({ onChanged }) {
  const [part, setPart] = useState("proposals");
  const [skills, setSkills] = useState([]);
  const loadSkills = useCallback(async () => { try { setSkills((await api.taxonomy()).skills); } catch { setSkills([]); } }, []);
  useEffect(() => { loadSkills(); }, [loadSkills]);
  const PARTS = [["proposals", "Proposed skills"], ["disputes", "Flagged tags"], ["disagreements", "Claims vs data"], ["taxonomy", "Taxonomy"]];
  const active = skills.filter(s => s.status === "ACTIVE");

  return (
    <div>
      <div className="cpm-skills-admin-tabs cpm-skills-admin-tabs--sub" role="tablist" aria-label="Review queues">
        {PARTS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={part === id} className={part === id ? "on" : ""} onClick={() => setPart(id)}>{label}</button>)}
      </div>
      {part === "proposals" && <Proposals skills={active} onChanged={() => { loadSkills(); onChanged?.(); }} />}
      {part === "disputes" && <Disputes onChanged={() => onChanged?.()} />}
      {part === "disagreements" && <Disagreements />}
      {part === "taxonomy" && <Taxonomy skills={skills} onChanged={loadSkills} />}
    </div>
  );
}
