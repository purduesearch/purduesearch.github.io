// Controls under the Skills card: portfolio + privacy, claiming a skill, and
// describing work that leaves few digital traces (mentoring, testing,
// coordination). Self-entered work is capped server-side at complexity 3 so an
// unverifiable entry cannot carry anyone to the top levels.

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { skillsApi } from "../../../api/clubPmClient";
import { CONTRIBUTIONS, LEVEL_LABELS, errorMessage } from "./skillsShared";

function useTaxonomy(enabled) {
  const [skills, setSkills] = useState(null);
  useEffect(() => {
    if (!enabled || skills) return undefined;
    let live = true;
    skillsApi.taxonomy().then(r => { if (live) setSkills(r.skills); }).catch(() => { if (live) setSkills([]); });
    return () => { live = false; };
  }, [enabled, skills]);
  return skills;
}

export function PortfolioSection({ data, onChanged }) {
  const p = data.portfolio;
  const [enabled, setEnabled] = useState(p?.enabled ?? false);
  const [slug, setSlug] = useState(p?.slug ?? "");
  const [headline, setHeadline] = useState(p?.headline ?? "");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const url = p?.enabled && p.slug ? `${window.location.origin}/portfolio/${p.slug}` : null;

  const save = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await skillsApi.setPortfolio({ enabled, ...(slug.trim() ? { slug } : {}), headline: headline.trim() || null });
      toast.success(enabled ? "Portfolio saved" : "Portfolio is off");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const toggleProfile = async (showOnProfile) => {
    try { await skillsApi.setPortfolio({ showOnProfile }); toast.success(showOnProfile ? "Teammates can see your selected skills" : "Hidden from teammates"); onChanged(); }
    catch (err) { toast.error(errorMessage(err, "Could not change that")); }
  };
  const toggleProject = async (id, isPublic) => {
    try { await skillsApi.setProjectPublic(id, isPublic); onChanged(); }
    catch (err) { toast.error(errorMessage(err, "Could not change that")); }
  };

  return (
    <details className="cpm-skills-section">
      <summary>Portfolio and privacy</summary>
      <label className="cpm-skills-check cpm-skills-profile-toggle">
        <input type="checkbox" checked={data.showOnProfile !== false} onChange={e => toggleProfile(e.target.checked)} />
        Show my selected teammate skills on my profile
      </label>
      <p className="cpm-skills-notice">
        Choose teammate visibility separately by opening a skill in the workspace. Teammates see eligible shared-project evidence. Flagged skills, private notes and rationale stay hidden.
      </p>
      <p className="cpm-skills-notice">
        Your portfolio is a link you can share with employers. It is off until you turn it on. When on, it shows only skills marked public that are lead-verified or
        have medium or higher confidence, with short summaries of the work behind them. New discoveries require your selection. Flagged skills stay out until a lead reviews them. It never shows your
        email, rationale text, or reviews.
      </p>
      <form onSubmit={save} className="cpm-skills-form">
        <label className="cpm-skills-check">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Turn my portfolio on
        </label>
        <label>Address
          <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="your-name" maxLength={40} />
        </label>
        <label>Headline
          <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Structures and CAD" maxLength={120} />
        </label>
        <div className="cpm-skill-actions">
          <button type="submit" className="cpm-profile-edit-save" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          {url && (
            <>
              <a href={url} target="_blank" rel="noreferrer" className="cpm-skill-link">Open my portfolio</a>
              <button type="button" className="cpm-skill-link" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"), () => {})}>Copy link</button>
            </>
          )}
        </div>
      </form>
      {data.projects.length > 0 && (
        <div className="cpm-skills-projects">
          <h5>Projects whose work can appear as evidence</h5>
          {data.projects.map(pr => (
            <label key={pr.id} className="cpm-skills-check">
              <input type="checkbox" checked={pr.isPublic} onChange={e => toggleProject(pr.id, e.target.checked)} /> {pr.name}
            </label>
          ))}
        </div>
      )}
    </details>
  );
}

export function ClaimSection({ onChanged }) {
  const [open, setOpen] = useState(false);
  const skills = useTaxonomy(open);
  const [skillId, setSkillId] = useState("");
  const [level, setLevel] = useState(3);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const save = async (e) => {
    e.preventDefault();
    if (busyRef.current || !skillId) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await skillsApi.claim(skillId, level, note.trim());
      toast.success("Claim added. It is shown next to what your work says, not instead of it.");
      setSkillId(""); setNote("");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Could not add that"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <details className="cpm-skills-section" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>Claim a skill</summary>
      <form onSubmit={save} className="cpm-skills-form">
        <label>Skill
          <select value={skillId} onChange={e => setSkillId(e.target.value)} required>
            <option value="">{skills ? "Choose a skill…" : "Loading…"}</option>
            {(skills ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Your level
          <select value={level} onChange={e => setLevel(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} · {LEVEL_LABELS[n]}</option>)}
          </select>
        </label>
        <label>Note (optional)
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={280} placeholder="Where you learned it, what you have used it for" />
        </label>
        <div className="cpm-skill-actions">
          <button type="submit" className="cpm-profile-edit-save" disabled={busy || !skillId}>{busy ? "Saving…" : "Add claim"}</button>
        </div>
      </form>
    </details>
  );
}

export function WorkSection({ projects, onChanged }) {
  const [open, setOpen] = useState(false);
  const skills = useTaxonomy(open);
  const blank = { title: "", description: "", link: "", occurredAt: "", contribution: "AUTHORED", projectId: "", skillIds: [] };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSkill = (id) => setForm(f => ({
    ...f,
    skillIds: f.skillIds.includes(id) ? f.skillIds.filter(x => x !== id) : f.skillIds.length >= 5 ? f.skillIds : [...f.skillIds, id],
  }));

  const save = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await skillsApi.addEvidence({
        title: form.title, description: form.description, link: form.link || null, contribution: form.contribution,
        occurredAt: form.occurredAt || undefined, projectId: form.projectId || undefined, skillIds: form.skillIds,
      });
      toast.success("Added. It counts as evidence, with a lower ceiling than verified work.");
      setForm(blank);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Could not add that"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <details className="cpm-skills-section" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>Add work that left no trace</summary>
      <p className="cpm-skills-notice">Mentoring, testing, coordinating, teaching. Describe what you did and pick up to five skills it shows. Entries you write yourself count, but cap at moderate complexity.</p>
      <form onSubmit={save} className="cpm-skills-form">
        <label>What did you do?
          <input value={form.title} onChange={e => set("title", e.target.value)} required minLength={5} maxLength={120} placeholder="Taught three new members to solder SMD parts" />
        </label>
        <label>Details
          <textarea value={form.description} onChange={e => set("description", e.target.value)} required minLength={10} maxLength={1500} rows={3} />
        </label>
        <label>When
          <input type="date" value={form.occurredAt} onChange={e => set("occurredAt", e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </label>
        <label>Your part
          <select value={form.contribution} onChange={e => set("contribution", e.target.value)}>
            {CONTRIBUTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        {projects.length > 0 && (
          <label>Project (optional)
            <select value={form.projectId} onChange={e => set("projectId", e.target.value)}>
              <option value="">None</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label>Link (optional)
          <input type="url" value={form.link} onChange={e => set("link", e.target.value)} placeholder="https://" />
        </label>
        <fieldset className="cpm-skills-picker">
          <legend>Skills it shows ({form.skillIds.length}/5)</legend>
          {skills === null ? <span className="cpm-skills-notice">Loading…</span> : skills.map(s => (
            <label key={s.id} className={`cpm-skills-chip${form.skillIds.includes(s.id) ? " on" : ""}`}>
              <input type="checkbox" checked={form.skillIds.includes(s.id)} onChange={() => toggleSkill(s.id)} /> {s.name}
            </label>
          ))}
        </fieldset>
        <div className="cpm-skill-actions">
          <button type="submit" className="cpm-profile-edit-save" disabled={busy || form.skillIds.length === 0}>{busy ? "Saving…" : "Add work"}</button>
        </div>
      </form>
    </details>
  );
}

export default function SkillsSettings({ data, projects, onChanged }) {
  return (
    <div className="cpm-skills-settings">
      <PortfolioSection data={data} onChanged={onChanged} />
      <ClaimSection onChanged={onChanged} />
      <WorkSection projects={projects} onChanged={onChanged} />
    </div>
  );
}
