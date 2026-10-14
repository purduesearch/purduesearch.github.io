// Admin → Skills → People: club-wide coverage. Rows are people, columns are the
// skills of one area, each cell is the highest-trust level held (lead-verified,
// then peer, then the analysis, then a self-claim). It shows where the club is
// thin, not who is "best": rows are alphabetical and there is no total.
// Selecting a person opens everything recorded about them, with the work behind it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { skillsAdminApi as api } from "../../../api/clubPmClient";
import { BAND_LABELS, LEVEL_LABELS, PROVENANCE_META, TREND_META, errorMessage, formatDay, formatMonth, sourceIcon } from "./skillsShared";
import { LevelMeter } from "./MemberSkillsCard";

const ALL = "__top";
const TOP_N = 18;

function cellTitle(member, skill, c) {
  return `${member.displayName} · ${skill.name}: level ${c.level} (${LEVEL_LABELS[c.level]}), ${PROVENANCE_META[c.provenance].label.toLowerCase()}${c.provenance === "AI_INFERRED" ? `, ${BAND_LABELS[c.band].toLowerCase()}` : ""}${c.lastDemonstrated ? `, last ${formatMonth(c.lastDemonstrated)}` : ""}`;
}

export function VerifyForm({ member, skill, onDone, onCancel }) {
  const [level, setLevel] = useState(3);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await api.verify({ memberId: member.id, skillId: skill.skillId, level, note: note.trim() || null }); toast.success("Recorded as lead-verified"); onDone(); }
    catch (err) { toast.error(errorMessage(err, "Could not save")); }
    finally { setBusy(false); }
  };
  return (
    <form className="cpm-sk-verify cpm-skills-form" onSubmit={submit}>
      <strong>Verify {skill.name} for {member.displayName}</strong>
      <p className="cpm-skills-notice">Your verification is stored as its own line next to the analysis. It does not overwrite it.</p>
      <div className="cpm-sk-verify-row">
        <label>Level
          <select value={level} onChange={e => setLevel(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} · {LEVEL_LABELS[n]}</option>)}</select>
        </label>
        <label className="cpm-sk-grow">Why (optional)<input value={note} onChange={e => setNote(e.target.value)} maxLength={280} /></label>
      </div>
      <div className="cpm-skill-actions">
        <button type="button" className="cpm-profile-edit-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cpm-profile-edit-save" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

function PersonEvidence({ memberId, skillId }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    api.personEvidence(memberId, skillId).then(r => { if (live) setItems(r.evidence); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [memberId, skillId]);
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
              {formatDay(e.occurredAt)}{e.projectName ? ` · ${e.projectName}` : ""} · {e.contribution.toLowerCase()}, complexity {e.complexity}/5, {e.outcome.toLowerCase()} · fit {Math.round((e.fit ?? 0) * 100)}%
              {e.sourceUrl && /^https?:/.test(e.sourceUrl) ? <> · <a href={e.sourceUrl} target="_blank" rel="noreferrer">open</a></> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PersonDetail({ memberId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [verify, setVerify] = useState(null);
  const load = useCallback(() => api.person(memberId).then(setData).catch(err => { toast.error(errorMessage(err, "Could not load this person")); onClose(); }), [memberId, onClose]);
  useEffect(() => { setData(null); setOpen(null); setVerify(null); load(); }, [load]);

  if (!data) return <aside className="cpm-sk-person" aria-busy="true"><div className="cpm-skill-evidence-empty">Loading…</div></aside>;
  const count = data.groups.reduce((n, g) => n + g.skills.length, 0);
  return (
    <aside className="cpm-sk-person" aria-label={`Skills of ${data.member.displayName}`}>
      <header className="cpm-sk-person-head">
        {data.member.avatarUrl ? <img src={data.member.avatarUrl} alt="" /> : <span className="cpm-sk-avatar" aria-hidden="true">{data.member.displayName.slice(0, 1)}</span>}
        <div>
          <h4>{data.member.displayName}</h4>
          <div className="cpm-skill-meta">
            {data.member.title ? `${data.member.title} · ` : ""}{count} skill{count === 1 ? "" : "s"} · {data.evidenceCount} pieces of work
            {data.lastEvidenceAt ? ` · last ${formatDay(data.lastEvidenceAt)}` : ""}{data.member.githubLinked ? "" : " · GitHub not linked"}
          </div>
        </div>
        <Link className="cpm-skill-link" to={`/clubpm/profile/${data.member.id}`}>Profile</Link>
        <button type="button" className="cpm-sk-close" aria-label="Close" onClick={onClose}><i className="fas fa-xmark" aria-hidden="true" /></button>
      </header>
      {verify && <VerifyForm member={data.member} skill={verify} onCancel={() => setVerify(null)} onDone={() => { setVerify(null); load(); onChanged?.(); }} />}
      {count === 0 && <div className="cpm-skill-evidence-empty">Nothing recorded yet.</div>}
      {data.groups.map(g => (
        <section key={g.groupId} className="cpm-skill-group">
          <h4>{g.groupName}</h4>
          <ul>
            {g.skills.map(s => {
              const lead = s.provenances[0];
              const ai = s.provenances.find(p => p.provenance === "AI_INFERRED");
              const isOpen = open === s.skillId;
              return (
                <li key={s.skillId} className="cpm-skill">
                  <div className="cpm-skill-head">
                    <button type="button" className="cpm-skill-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.skillId)}>
                      <i className={`fas fa-chevron-${isOpen ? "down" : "right"}`} aria-hidden="true" />
                      <span className="cpm-skill-name">{s.name}</span>
                    </button>
                    <LevelMeter level={lead.level} band={ai?.confidenceBand} />
                    <span className="cpm-skill-meta">{PROVENANCE_META[lead.provenance].label}{ai ? ` · ${BAND_LABELS[ai.confidenceBand].toLowerCase()}` : ""}</span>
                    {ai && <span className="cpm-skill-meta"><i className={(TREND_META[ai.trend] ?? TREND_META.STABLE).icon} aria-hidden="true" /> {(TREND_META[ai.trend] ?? TREND_META.STABLE).label.toLowerCase()}</span>}
                    {s.disagreement && <span className="cpm-skill-pill cpm-skill-pill--partial" title={s.disagreement.detail}>disagree</span>}
                  </div>
                  {isOpen && (
                    <div className="cpm-skill-detail">
                      <ul className="cpm-skill-provs">
                        {s.provenances.map(p => (
                          <li key={`${p.provenance}-${p.assertedById ?? ""}`}>
                            <i className={PROVENANCE_META[p.provenance].icon} aria-hidden="true" /> <strong>{PROVENANCE_META[p.provenance].label}</strong>: level {p.level} ({LEVEL_LABELS[p.level]})
                            {p.provenance === "AI_INFERRED" ? ` · ${p.evidenceCount} piece${p.evidenceCount === 1 ? "" : "s"} of work` : ""}
                            {p.note ? <span className="cpm-skill-note"> “{p.note}”</span> : null}
                            {p.rationale && p.provenance === "AI_INFERRED" ? <div className="cpm-skill-rationale">{p.rationale}</div> : null}
                          </li>
                        ))}
                      </ul>
                      {ai && <PersonEvidence memberId={data.member.id} skillId={s.skillId} />}
                      <div className="cpm-skill-actions">
                        <button type="button" className="cpm-skill-link" onClick={() => setVerify({ skillId: s.skillId, name: s.name })}>Verify a level for this person</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}

export default function SkillsMatrix() {
  const [data, setData] = useState(null);
  const [area, setArea] = useState(ALL);
  const [q, setQ] = useState("");
  const [strongOnly, setStrongOnly] = useState(false);
  const [person, setPerson] = useState(null);

  const load = useCallback(() => api.matrix().then(setData).catch(err => { toast.error(errorMessage(err, "Could not load the matrix")); setData({ groups: [], members: [], singlePoints: [] }); }), []);
  useEffect(() => { load(); }, [load]);
  const closePerson = useCallback(() => setPerson(null), []);

  const columns = useMemo(() => {
    if (!data) return [];
    if (area !== ALL) return data.groups.find(g => g.id === area)?.skills ?? [];
    return data.groups.flatMap(g => g.skills).sort((a, b) => b.holders - a.holders || a.name.localeCompare(b.name)).slice(0, TOP_N);
  }, [data, area]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.members.filter(m => (!needle || m.displayName.toLowerCase().includes(needle))
      && columns.some(c => { const cell = m.cells[c.id]; return cell && (!strongOnly || cell.level >= 3); }));
  }, [data, columns, q, strongOnly]);

  if (!data) return <div className="cpm-skill-evidence-empty">Loading…</div>;
  if (!data.members.length) {
    return <div className="cpm-sk-empty"><i className="fas fa-table-cells" aria-hidden="true" /><p>No skills recorded yet. Run the analysis from Overview; the grid fills in as work is analysed.</p></div>;
  }

  return (
    <div className="cpm-sk-people">
      {data.singlePoints.length > 0 && (
        <div className="cpm-sk-card cpm-sk-single">
          <div className="cpm-sk-card-head">
            <h4><i className="fas fa-user-shield" aria-hidden="true" /> Only one strong person</h4>
            <span className="cpm-skill-meta">level 3+ from work or a lead. Worth pairing someone up.</span>
          </div>
          <div className="cpm-sk-chips">
            {data.singlePoints.slice(0, 24).map(p => (
              <button key={p.skillId} type="button" className="cpm-sk-chip" onClick={() => setPerson(p.memberId)}>
                <b>{p.name}</b> {p.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cpm-sk-toolbar">
        <label>Area
          <select value={area} onChange={e => setArea(e.target.value)}>
            <option value={ALL}>Most common skills</option>
            {data.groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.skills.length})</option>)}
          </select>
        </label>
        <label>Person
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name" />
        </label>
        <label className="cpm-skills-check"><input type="checkbox" checked={strongOnly} onChange={e => setStrongOnly(e.target.checked)} /> Level 3+ only</label>
        <div className="cpm-sk-legend" aria-label="Legend">
          {[1, 2, 3, 4, 5].map(n => <span key={n}><i className={`cpm-sk-cell lv-${n}`} aria-hidden="true" />{n}</span>)}
          <span><i className="cpm-sk-cell lv-3 low" aria-hidden="true" />low confidence</span>
          <span><i className="cpm-sk-cell lv-3 self" aria-hidden="true" />self-claimed</span>
          <span><i className="cpm-sk-cell lv-3 verified" aria-hidden="true" />verified</span>
        </div>
      </div>

      <div className={`cpm-sk-matrix-wrap${person ? " with-person" : ""}`}>
        <div className="cpm-sk-matrix-scroll" tabIndex={0} role="region" aria-label="Skill coverage grid">
          <table className="cpm-sk-matrix">
            <thead>
              <tr>
                <th scope="col" className="cpm-sk-corner">{rows.length} {rows.length === 1 ? "person" : "people"}</th>
                {columns.map(c => (
                  <th key={c.id} scope="col" className="cpm-sk-colhead" title={`${c.name}: ${c.holders} ${c.holders === 1 ? "person" : "people"}, ${c.strong} at level 3+`}>
                    <span className="cpm-sk-colname">{c.name}</span>
                    <span className={`cpm-sk-colcount${c.strong <= 1 ? " thin" : ""}`}>{c.strong}/{c.holders}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} className={person === m.id ? "on" : ""}>
                  <th scope="row">
                    <button type="button" className="cpm-sk-rowname" onClick={() => setPerson(person === m.id ? null : m.id)} aria-pressed={person === m.id}>
                      {m.displayName}<small>{m.skillCount} skill{m.skillCount === 1 ? "" : "s"}</small>
                    </button>
                  </th>
                  {columns.map(c => {
                    const cell = m.cells[c.id];
                    if (!cell || (strongOnly && cell.level < 3)) return <td key={c.id} />;
                    const cls = [`lv-${cell.level}`, cell.provenance === "SELF_CLAIMED" ? "self" : "", cell.provenance === "MANAGER_VERIFIED" ? "verified" : "", cell.provenance === "AI_INFERRED" && cell.band === "LOW" ? "low" : "", cell.trend === "FADING" ? "fading" : ""].filter(Boolean).join(" ");
                    return (
                      <td key={c.id}>
                        <span className={`cpm-sk-cell ${cls}`} title={cellTitle(m, c, cell)}>{cell.level}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="cpm-skill-evidence-empty">No one in this area matches the filters.</div>}
        </div>
        {person && <PersonDetail memberId={person} onClose={closePerson} onChanged={load} />}
      </div>
      <p className="cpm-skills-notice">{data.advisory} Column counts read strong / total: people at level 3+ (not self-claimed) out of everyone with the skill.</p>
    </div>
  );
}
