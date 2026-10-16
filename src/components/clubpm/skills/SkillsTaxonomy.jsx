// Admin → Skills → Taxonomy: the curated view of the evolving catalog, as a
// tree of areas. Adding a skill or another name for one also merges any pending
// proposal it now covers (server side) and credits the work behind it.

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { skillsAdminApi as api } from "../../../api/clubPmClient";
import { errorMessage } from "./skillsShared";

export const SKILL_TYPES = ["TOOL", "TECHNIQUE", "DOMAIN", "SOFT_SKILL"];
export const typeLabel = (t) => t.toLowerCase().replace("_", " ");

function useAction(onDone) {
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      const resolved = r?.proposalsResolved ? ` (${r.proposalsResolved} pending proposal${r.proposalsResolved === 1 ? "" : "s"} merged)` : "";
      if (ok) toast.success(ok + resolved);
      await onDone();
    } catch (err) { toast.error(errorMessage(err, "That did not work")); }
    finally { setBusy(false); }
  };
  return [busy, run];
}

function SkillRow({ s, depth, busy, run }) {
  const [alias, setAlias] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(s.name);
  return (
    <li className={`cpm-sk-tax-row${s.status === "DEPRECATED" ? " deprecated" : ""}`} style={{ "--depth": depth }}>
      <div className="cpm-sk-tax-main">
        {renaming ? (
          <form className="cpm-sk-inline" onSubmit={e => { e.preventDefault(); run(async () => { await api.patchSkill(s.id, { name }); setRenaming(false); }, "Renamed"); }}>
            <input aria-label={`New name for ${s.name}`} value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus />
            <button type="submit" className="cpm-profile-edit-save" disabled={busy || !name.trim()}>Save</button>
            <button type="button" className="cpm-skill-link" onClick={() => { setRenaming(false); setName(s.name); }}>Cancel</button>
          </form>
        ) : (
          <strong>{s.name}</strong>
        )}
        <span className="cpm-sk-type">{typeLabel(s.type)}</span>
        <span className="cpm-skill-meta">{s.people} {s.people === 1 ? "person" : "people"}{s.status === "DEPRECATED" ? " · deprecated" : ""}</span>
      </div>
      <div className="cpm-sk-tax-aliases">
        {s.aliases.map(a => (
          <span key={a.id} className="cpm-sk-alias">{a.alias}
            <button type="button" aria-label={`Remove alias ${a.alias}`} disabled={busy} onClick={() => run(() => api.removeAlias(a.id), "Alias removed")}><i className="fas fa-xmark" aria-hidden="true" /></button>
          </span>
        ))}
        <form className="cpm-sk-inline" onSubmit={e => { e.preventDefault(); run(async () => { const r = await api.addAlias(s.id, alias); setAlias(""); return r; }, "Alias added"); }}>
          <input aria-label={`New alias for ${s.name}`} value={alias} onChange={e => setAlias(e.target.value)} placeholder="+ other name" maxLength={80} />
          {alias.trim() && <button type="submit" className="cpm-profile-edit-cancel" disabled={busy}>Add</button>}
        </form>
      </div>
      <div className="cpm-sk-tax-actions">
        {!renaming && <button type="button" className="cpm-skill-link" onClick={() => setRenaming(true)}>Rename</button>}
        <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => run(() => api.patchSkill(s.id, { status: s.status === "ACTIVE" ? "DEPRECATED" : "ACTIVE" }), s.status === "ACTIVE" ? "Deprecated" : "Restored")}>
          {s.status === "ACTIVE" ? "Deprecate" : "Restore"}
        </button>
      </div>
    </li>
  );
}

export default function SkillsTaxonomy({ skills, onChanged }) {
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", type: "TOOL", parentId: "", aliases: "" });
  const [openRoots, setOpenRoots] = useState(() => new Set());
  const [busy, run] = useAction(async () => { await onChanged(); });

  const { roots, kids, byId } = useMemo(() => {
    const byId = new Map(skills.map(s => [s.id, s]));
    const kids = new Map();
    const hasParent = new Set();
    for (const s of skills) for (const l of s.links ?? []) {
      if (l.kind !== "PARENT" || !byId.has(l.toId)) continue;
      hasParent.add(s.id);
      kids.set(l.toId, [...(kids.get(l.toId) ?? []), s]);
    }
    for (const list of kids.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return { roots: skills.filter(s => !hasParent.has(s.id)).sort((a, b) => a.name.localeCompare(b.name)), kids, byId };
  }, [skills]);

  const needle = q.trim().toLowerCase();
  const matches = needle ? skills.filter(s => s.name.toLowerCase().includes(needle) || s.aliases.some(a => a.alias.toLowerCase().includes(needle))) : null;
  const toggle = (id) => setOpenRoots(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const renderTree = (s, depth, seen) => {
    if (seen.has(s.id)) return null; // multi-parent skills appear under each parent; guard against odd data loops
    const next = new Set(seen).add(s.id);
    return [
      <SkillRow key={`${s.id}-${depth}`} s={s} depth={depth} busy={busy} run={run} />,
      ...(kids.get(s.id) ?? []).flatMap(k => renderTree(k, depth + 1, next)),
    ];
  };

  if (!skills.length) {
    return (
      <div className="cpm-sk-empty">
        <i className="fas fa-sitemap" aria-hidden="true" />
        <p>No skills yet. The analysis can only tag skills from this list.</p>
        <button type="button" className="cpm-profile-edit-save" disabled={busy} onClick={() => run(async () => { const r = await api.seedTaxonomy(); return r; }, "Starter skills installed")}>Install about 130 starter skills</button>
      </div>
    );
  }

  return (
    <div className="cpm-sk-tax">
      <div className="cpm-sk-toolbar">
        <label className="cpm-sk-grow">Find a skill<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search names and other names" /></label>
        <span className="cpm-skill-meta">{skills.filter(s => s.status === "ACTIVE").length} active · {roots.length} areas</span>
        <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => run(() => api.seedTaxonomy(), "Starter list checked; missing skills added")}>Add missing starter skills</button>
      </div>

      <details className="cpm-sk-card cpm-sk-add">
        <summary><i className="fas fa-plus" aria-hidden="true" /> Add a skill</summary>
        <form className="cpm-sk-add-form" onSubmit={e => {
          e.preventDefault();
          run(async () => {
            const r = await api.createSkill({ name: form.name, type: form.type, parentIds: form.parentId ? [form.parentId] : [], aliases: form.aliases.split(",").map(a => a.trim()).filter(Boolean) });
            setForm({ name: "", type: "TOOL", parentId: "", aliases: "" });
            return r;
          }, "Skill added");
        }}>
          <label>Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required maxLength={80} /></label>
          <label>Type<select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{SKILL_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}</select></label>
          <label>Under<select value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}><option value="">Top level</option>{skills.filter(s => s.status === "ACTIVE").map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="cpm-sk-grow">Other names (comma separated)<input value={form.aliases} onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))} placeholder="ReactJS, React.js" /></label>
          <button type="submit" className="cpm-profile-edit-save" disabled={busy || !form.name.trim()}>Add</button>
        </form>
      </details>

      {matches ? (
        <ul className="cpm-sk-tax-list">
          {matches.length ? matches.slice(0, 80).map(s => <SkillRow key={s.id} s={s} depth={0} busy={busy} run={run} />) : <li className="cpm-skill-evidence-empty">No skill or other name matches.</li>}
        </ul>
      ) : (
        <div className="cpm-sk-tax-areas">
          {roots.map(r => {
            const open = openRoots.has(r.id);
            const children = kids.get(r.id) ?? [];
            const used = children.reduce((n, c) => n + c.people, r.people);
            return (
              <section key={r.id} className={`cpm-sk-area${open ? " open" : ""}`}>
                <button type="button" className="cpm-sk-area-head" aria-expanded={open} onClick={() => toggle(r.id)}>
                  <i className={`fas fa-chevron-${open ? "down" : "right"}`} aria-hidden="true" />
                  <strong>{r.name}</strong>
                  <span className="cpm-skill-meta">{children.length} skill{children.length === 1 ? "" : "s"} · {used} tag{used === 1 ? "" : "s"} held</span>
                </button>
                {open && <ul className="cpm-sk-tax-list">{renderTree(r, 0, new Set())}</ul>}
              </section>
            );
          })}
        </div>
      )}
      {byId.size > 0 && <p className="cpm-skills-notice">Deprecated skills stay resolvable, so old names keep mapping instead of being proposed again.</p>}
    </div>
  );
}
