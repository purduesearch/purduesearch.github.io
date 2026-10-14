// "Skills" card on someone else's profile. Shows what the member has not hidden,
// with work from projects you share, and lets you endorse a skill at a level you
// have seen them work at. Your endorsement is its own line: it never changes the
// analysis or anyone else's statement. Advisory, never a score.

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { skillsApi } from "../../../api/clubPmClient";
import { BAND_LABELS, LEVEL_LABELS, PROVENANCE_META, TREND_META, errorMessage, formatDay, formatMonth, sourceIcon } from "./skillsShared";

export function LevelMeter({ level, band }) {
  return (
    <span className={`cpm-skill-meter${band ? ` cpm-skill-meter--${band.toLowerCase()}` : ""}`} role="img" aria-label={`Level ${level} of 5, ${LEVEL_LABELS[level] ?? ""}`}>
      {[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= level ? "on" : ""} />)}
    </span>
  );
}

function EndorseControl({ memberId, skill, onChanged }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(skill.myEndorsement ?? Math.min(5, Math.max(1, skill.level)));
  const [busy, setBusy] = useState(false);
  const act = async (fn, ok) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); toast.success(ok); setOpen(false); onChanged(); }
    catch (err) { toast.error(errorMessage(err, "Could not save that")); }
    finally { setBusy(false); }
  };
  if (!open) {
    return (
      <button type="button" className="cpm-skill-link" onClick={() => setOpen(true)}>
        {skill.myEndorsement ? `You endorsed level ${skill.myEndorsement}` : "Endorse"}
      </button>
    );
  }
  return (
    <div className="cpm-skill-endorse" role="group" aria-label={`Endorse ${skill.name}`}>
      <label>
        <span className="sr-only">Level you have seen</span>
        <select value={level} onChange={e => setLevel(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} · {LEVEL_LABELS[n]}</option>)}
        </select>
      </label>
      <button type="button" className="cpm-profile-edit-save" disabled={busy} onClick={() => act(() => skillsApi.endorse({ memberId, skillId: skill.skillId, level }), "Endorsement saved")}>Save</button>
      {skill.myEndorsement && (
        <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => act(() => skillsApi.unendorse(memberId, skill.skillId), "Endorsement removed")}>Remove</button>
      )}
      <button type="button" className="cpm-skill-link" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

function SkillItem({ memberId, skill, onChanged }) {
  const [open, setOpen] = useState(false);
  const trend = TREND_META[skill.trend] ?? TREND_META.STABLE;
  return (
    <li className="cpm-mskill">
      <div className="cpm-mskill-head">
        <button type="button" className="cpm-skill-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)} disabled={!skill.evidence.length}>
          <i className={`fas fa-chevron-${open ? "down" : "right"}`} aria-hidden="true" style={{ visibility: skill.evidence.length ? "visible" : "hidden" }} />
          <span className="cpm-skill-name">{skill.name}</span>
        </button>
        <LevelMeter level={skill.level} band={skill.confidence} />
        <span className="cpm-mskill-tags">
          {skill.verifiedByLead && <span className="cpm-skill-pill cpm-skill-pill--verified" title="A lead verified this level"><i className="fas fa-circle-check" aria-hidden="true" /> verified</span>}
          {skill.endorsements > 0 && <span className="cpm-skill-pill" title="Teammates who endorsed this"><i className="fas fa-handshake" aria-hidden="true" /> {skill.endorsements}</span>}
          {skill.lead === "SELF_CLAIMED" && <span className="cpm-skill-pill">{PROVENANCE_META.SELF_CLAIMED.label}</span>}
          {skill.confidence && <span className={`cpm-skill-band cpm-skill-band--${skill.confidence.toLowerCase()}`}>{BAND_LABELS[skill.confidence]}</span>}
        </span>
        <span className="cpm-skill-meta">
          {skill.lastDemonstrated ? `last used ${formatMonth(skill.lastDemonstrated)}` : ""}
          {skill.confidence ? <> · <i className={trend.icon} aria-hidden="true" /> {trend.label.toLowerCase()}</> : null}
        </span>
        <EndorseControl memberId={memberId} skill={skill} onChanged={onChanged} />
      </div>
      {open && (
        <ul className="cpm-skill-evidence cpm-mskill-evidence">
          {skill.evidence.map((e, i) => (
            <li key={i}>
              <i className={sourceIcon(e.source)} aria-hidden="true" />
              <div className="cpm-skill-evidence-body">
                <div>{e.summary}</div>
                <div className="cpm-skill-evidence-meta">
                  {formatDay(e.date)}{e.project ? ` · ${e.project}` : ""}
                  {e.link && /^https?:/.test(e.link) ? <> · <a href={e.link} target="_blank" rel="noreferrer">open</a></> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function MemberSkillsCard({ memberId, displayName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try { setData(await skillsApi.member(memberId)); setError(false); }
    catch { setError(true); }
  }, [memberId]);
  useEffect(() => { setData(null); load(); }, [load]);

  const name = displayName?.split(" ")[0] || "This member";
  if (error) return null; // a teammate's page should not shout about a side feature failing
  if (!data) return <div className="cpm-profile-card cpm-mskills"><h3 style={{ marginTop: 0 }}>Skills</h3><div className="cpm-skill-evidence-empty">Loading…</div></div>;

  const all = data.groups.flatMap(g => g.skills);
  const LIMIT = 8;
  return (
    <div className="cpm-profile-card cpm-mskills" data-testid="member-skills">
      <h3 style={{ marginTop: 0 }}>Skills {all.length > 0 && <span className="cpm-skill-count">{all.length}</span>}</h3>
      {data.hidden ? (
        <div className="cpm-skill-evidence-empty">{name} keeps their skills private.</div>
      ) : all.length === 0 ? (
        <div className="cpm-skill-evidence-empty">
          Nothing to show yet. Skills appear after the weekly analysis reads {name}&apos;s tasks, CAD check-ins{data.githubLinked ? " and pull requests" : ""}.
        </div>
      ) : (
        <>
          <p className="cpm-skills-notice">{data.notice}</p>
          {(showAll ? data.groups : [{ name: null, skills: [...all].sort((a, b) => b.level - a.level || b.endorsements - a.endorsements).slice(0, LIMIT) }]).map(g => (
            <section key={g.name ?? "top"} className="cpm-skill-group">
              {g.name && <h4>{g.name}</h4>}
              <ul>{g.skills.map(s => <SkillItem key={s.skillId} memberId={memberId} skill={s} onChanged={load} />)}</ul>
            </section>
          ))}
          {all.length > LIMIT && (
            <button type="button" className="cpm-skill-link cpm-mskills-more" onClick={() => setShowAll(v => !v)}>
              {showAll ? "Show top skills only" : `Show all ${all.length} skills by area`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
