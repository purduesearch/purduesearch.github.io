// "Skills" card on your own profile. Shows everything the weekly analysis inferred
// about you, grouped by area, with the work behind each skill. Every provenance
// (your claim, a peer, a lead, the analysis) is shown on its own line: they are
// never averaged. You can flag a tag you think is wrong and choose which skills
// are public.

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { skillsApi } from "../../../api/clubPmClient";
import SkillsSettings from "./SkillsSettings";
import {
  BAND_LABELS, LEVEL_LABELS, PROVENANCE_META, TREND_META, errorMessage, formatDay, formatMonth, sourceIcon,
} from "./skillsShared";

function Pips({ level }) {
  return (
    <span className="cpm-skill-pips" role="img" aria-label={`Level ${level} of 5, ${LEVEL_LABELS[level] ?? ""}`}>
      {[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= level ? "on" : ""} />)}
    </span>
  );
}

function FlagForm({ skillId, evidenceId, onDone, onCancel }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await skillsApi.dispute({ skillId, evidenceId, reason });
      toast.success("Thanks. A lead will review this tag.");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, "Could not send that"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="cpm-skill-flag" onSubmit={submit}>
      <label>
        What looks wrong?
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={500} required minLength={5}
          placeholder={evidenceId ? "This work does not show this skill because…" : "I do not have this skill because…"} />
      </label>
      <div className="cpm-skill-actions">
        <button type="button" className="cpm-profile-edit-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="cpm-profile-edit-save" disabled={busy || reason.trim().length < 5}>{busy ? "Sending…" : "Send for review"}</button>
      </div>
    </form>
  );
}

function EvidenceList({ skillId, onFlagged }) {
  const [items, setItems] = useState(null);
  const [flagging, setFlagging] = useState(null);
  useEffect(() => {
    let live = true;
    skillsApi.evidence(skillId)
      .then(r => { if (live) setItems(r.evidence); })
      .catch(err => { if (live) { setItems([]); toast.error(errorMessage(err, "Could not load the evidence")); } });
    return () => { live = false; };
  }, [skillId]);

  if (items === null) return <div className="cpm-skill-evidence-empty">Loading evidence…</div>;
  if (!items.length) return <div className="cpm-skill-evidence-empty">No analysed work is linked to this skill.</div>;
  return (
    <ul className="cpm-skill-evidence">
      {items.map(e => (
        <li key={e.id}>
          <i className={sourceIcon(e.source)} aria-hidden="true" />
          <div className="cpm-skill-evidence-body">
            <div>{e.summary}</div>
            <div className="cpm-skill-evidence-meta">
              {formatDay(e.occurredAt)}
              {e.projectName ? ` · ${e.projectName}` : ""}
              {` · ${e.contribution.toLowerCase()}, complexity ${e.complexity}/5, ${e.outcome.toLowerCase()}`}
              {e.sourceUrl && /^https?:/.test(e.sourceUrl) ? <> · <a href={e.sourceUrl} target="_blank" rel="noreferrer">open</a></> : null}
            </div>
            {flagging === e.id ? (
              <FlagForm skillId={skillId} evidenceId={e.id} onCancel={() => setFlagging(null)} onDone={() => { setFlagging(null); onFlagged(); }} />
            ) : (
              <button type="button" className="cpm-skill-link" onClick={() => setFlagging(e.id)}>This does not show this skill</button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SkillRow({ skill, openDispute, onChanged }) {
  const [open, setOpen] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [busy, setBusy] = useState(false);
  const ai = skill.provenances.find(p => p.provenance === "AI_INFERRED");
  const headline = ai ?? skill.provenances[0];
  const trend = TREND_META[headline.trend] ?? TREND_META.STABLE;
  const hasClaim = skill.provenances.some(p => p.provenance === "SELF_CLAIMED");

  const run = async (fn, failure) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); onChanged(); }
    catch (err) { toast.error(errorMessage(err, failure)); }
    finally { setBusy(false); }
  };

  return (
    <li className="cpm-skill">
      <div className="cpm-skill-head">
        <button type="button" className="cpm-skill-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <i className={`fas fa-chevron-${open ? "down" : "right"}`} aria-hidden="true" />
          <span className="cpm-skill-name">{skill.name}</span>
          <span className="cpm-skill-type">{skill.type.toLowerCase().replace("_", " ")}</span>
        </button>
        <Pips level={headline.level} />
        {ai && (
          <span className={`cpm-skill-band cpm-skill-band--${ai.confidenceBand.toLowerCase()}`} title="How sure the estimate is. Separate from the level.">
            {BAND_LABELS[ai.confidenceBand]}
          </span>
        )}
        {!ai && <span className="cpm-skill-pill">{PROVENANCE_META[headline.provenance].label}</span>}
        {headline.lastDemonstrated && <span className="cpm-skill-meta">last used {formatMonth(headline.lastDemonstrated)}</span>}
        {ai && <span className="cpm-skill-meta" title={trend.label}><i className={trend.icon} aria-hidden="true" /> {trend.label}</span>}
        {openDispute && <span className="cpm-skill-pill">under review</span>}
        <button type="button" className="cpm-skill-icon" disabled={busy} aria-pressed={skill.isPublic}
          onClick={() => run(() => skillsApi.setSkillPublic(skill.skillId, !skill.isPublic), "Could not change that")}
          title={skill.isPublic ? "Shown to teammates on your profile and on your portfolio (if on). Click to hide." : "Hidden from teammates and your portfolio. Click to show."}>
          <i className={skill.isPublic ? "fas fa-eye" : "fas fa-eye-slash"} aria-hidden="true" />
          <span className="sr-only">{skill.isPublic ? "Public" : "Hidden"}</span>
        </button>
      </div>

      {skill.disagreement && (
        <div className="cpm-skill-disagree" role="note">
          <i className="fas fa-scale-unbalanced" aria-hidden="true" /> {skill.disagreement.detail}
        </div>
      )}

      {open && (
        <div className="cpm-skill-detail">
          <ul className="cpm-skill-provs">
            {skill.provenances.map(p => {
              const meta = PROVENANCE_META[p.provenance];
              return (
                <li key={`${p.originalSkillId ?? skill.skillId}-${p.provenance}-${p.assertedById ?? ""}`}>
                  <i className={meta.icon} aria-hidden="true" />{" "}
                  <strong>{meta.label}</strong>: level {p.level} ({LEVEL_LABELS[p.level]})
                  {p.provenance === "AI_INFERRED" ? `, ${BAND_LABELS[p.confidenceBand].toLowerCase()}, ${p.evidenceCount} piece${p.evidenceCount === 1 ? "" : "s"} of work` : ""}
                  {p.note ? <span className="cpm-skill-note"> “{p.note}”</span> : null}
                  {p.rationale && p.provenance === "AI_INFERRED" ? <div className="cpm-skill-rationale">{p.rationale}</div> : null}
                </li>
              );
            })}
          </ul>
          {ai && <EvidenceList skillId={skill.skillId} onFlagged={onChanged} />}
          <div className="cpm-skill-actions">
            {ai && !flagging && <button type="button" className="cpm-skill-link" onClick={() => setFlagging(true)}>This skill tag is wrong</button>}
            {hasClaim && <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => run(() => skillsApi.unclaim(skill.skillId), "Could not remove that")}>Remove my claim</button>}
          </div>
          {flagging && <FlagForm skillId={skill.skillId} evidenceId={null} onCancel={() => setFlagging(false)} onDone={() => { setFlagging(false); onChanged(); }} />}
        </div>
      )}
    </li>
  );
}

export default function SkillsPanel({ projects = [] }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try { setData(await skillsApi.me()); setError(false); }
    catch (err) { console.error("Load skills error:", err); setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="cpm-profile-card"><h3 style={{ marginTop: 0 }}>Skills</h3><div className="cpm-skill-evidence-empty">Skills could not be loaded right now.</div></div>;
  if (!data) return <div className="cpm-profile-card"><h3 style={{ marginTop: 0 }}>Skills</h3><div className="cpm-skill-evidence-empty">Loading…</div></div>;

  const disputedSkills = new Set(data.disputes.filter(d => d.status === "OPEN").map(d => d.skillId));
  const count = data.groups.reduce((n, g) => n + g.skills.length, 0);

  return (
    <div className="cpm-profile-card cpm-skills" data-testid="skills-panel">
      <h3 style={{ marginTop: 0 }}>Skills <span className="cpm-skill-count">{count}</span></h3>
      <p className="cpm-skills-notice">{data.notice}</p>
      {data.lastAnalysisAt && <p className="cpm-skills-notice">Last analysed {formatDay(data.lastAnalysisAt)}.</p>}

      {count === 0 ? (
        <div className="cpm-skill-evidence-empty">
          Nothing inferred yet. Skills appear after the weekly analysis reads your tasks, CAD check-ins and GitHub pull requests. You can also add a claim or describe work below.
        </div>
      ) : data.groups.map(g => (
        <section key={g.groupId} className="cpm-skill-group">
          <h4>{g.groupName}</h4>
          <ul>
            {g.skills.map(s => <SkillRow key={s.skillId} skill={s} openDispute={disputedSkills.has(s.skillId)} onChanged={load} />)}
          </ul>
        </section>
      ))}

      <SkillsSettings data={data} projects={projects} onChanged={load} />
    </div>
  );
}
