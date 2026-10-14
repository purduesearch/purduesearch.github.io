// Admin → Skills. Overview (setup, live run, history), People (coverage grid +
// a person's full record), Find (structured search), Ask (natural language),
// Review (proposals, flags, disagreements) and Taxonomy. Everything here is
// advisory: per skill, level and confidence side by side, never a total score or
// a leaderboard.

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { get, skillsAdminApi as api } from "../../../api/clubPmClient";
import SkillsReview from "./SkillsReview";
import SkillsRunPanel from "./SkillsRunPanel";
import SkillsMatrix, { PersonDetail, VerifyForm } from "./SkillsMatrix";
import SkillsTaxonomy from "./SkillsTaxonomy";
import { BAND_LABELS, LEVEL_LABELS, PROVENANCE_META, errorMessage, formatDay, formatMonth, sourceIcon } from "./skillsShared";

const ACTIVE_OPTIONS = [["", "Any time"], ["90", "Last 3 months"], ["180", "Last 6 months"], ["365", "Last year"]];

function PersonCard({ hit, onVerify, onOpen }) {
  return (
    <li className="cpm-skills-admin-person">
      <div className="cpm-skills-admin-person-head">
        <button type="button" className="cpm-sk-name-btn" onClick={() => onOpen(hit.member.id)}>{hit.member.displayName}</button>
        {hit.member.title && <span className="cpm-skill-meta">{hit.member.title}</span>}
      </div>
      {hit.skills.map(s => (
        <div key={s.skillId} className="cpm-skills-admin-skill">
          <div className="cpm-skill-name">{s.name}</div>
          <ul className="cpm-skill-provs">
            {s.rows.map((r, i) => (
              <li key={i}>
                <i className={PROVENANCE_META[r.provenance].icon} aria-hidden="true" /> {PROVENANCE_META[r.provenance].label}: level {r.level} ({LEVEL_LABELS[r.level]})
                {r.provenance === "AI_INFERRED" && <> · {BAND_LABELS[r.confidenceBand].toLowerCase()} · {r.evidenceCount} item{r.evidenceCount === 1 ? "" : "s"}</>}
                {r.lastDemonstrated && <> · last {formatMonth(r.lastDemonstrated)}</>}
              </li>
            ))}
          </ul>
          <ul className="cpm-skill-evidence">
            {s.evidence.map(e => (
              <li key={e.id}>
                <i className={sourceIcon(e.source)} aria-hidden="true" />
                <div className="cpm-skill-evidence-body">
                  <div>{e.summary}</div>
                  <div className="cpm-skill-evidence-meta">{formatDay(e.date)}{e.project ? ` · ${e.project}` : ""}{e.url && /^https?:/.test(e.url) ? <> · <a href={e.url} target="_blank" rel="noreferrer">open</a></> : null}</div>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="cpm-skill-link" onClick={() => onVerify(hit.member, s)}>Verify a level for this person</button>
        </div>
      ))}
    </li>
  );
}

function FindPeople({ taxonomy }) {
  const [form, setForm] = useState({ skill: "", minLevel: "3", activeWithinDays: "180", minConfidence: "" });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(null);
  const [person, setPerson] = useState(null);
  const closePerson = useCallback(() => setPerson(null), []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const run = useCallback(async (e) => {
    e?.preventDefault();
    if (!form.skill.trim() || busy) return;
    setBusy(true);
    try { setResult(await api.search(form)); }
    catch (err) { toast.error(errorMessage(err, "Search failed")); }
    finally { setBusy(false); }
  }, [form, busy]);

  return (
    <div>
      <form className="cpm-skills-admin-filters" onSubmit={run}>
        <label>Skill
          <input list="skills-admin-names" value={form.skill} onChange={e => set("skill", e.target.value)} placeholder="PCB design" required />
          <datalist id="skills-admin-names">{taxonomy.map(s => <option key={s.id} value={s.name} />)}</datalist>
        </label>
        <label>Minimum level
          <select value={form.minLevel} onChange={e => set("minLevel", e.target.value)}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}+ · {LEVEL_LABELS[n]}</option>)}</select>
        </label>
        <label>Active
          <select value={form.activeWithinDays} onChange={e => set("activeWithinDays", e.target.value)}>{ACTIVE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label>Confidence
          <select value={form.minConfidence} onChange={e => set("minConfidence", e.target.value)}>
            <option value="">Any</option><option value="MEDIUM">Medium or better</option><option value="HIGH">High only</option>
          </select>
        </label>
        <button type="submit" className="cpm-profile-edit-save" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
      </form>
      {verify && <VerifyForm member={verify.member} skill={verify.skill} onCancel={() => setVerify(null)} onDone={() => { setVerify(null); run(); }} />}
      {person && <PersonDetail memberId={person} onClose={closePerson} />}
      {result && (
        <>
          <p className="cpm-skills-notice">{result.advisory}</p>
          {result.people.length === 0
            ? <div className="cpm-skill-evidence-empty">No one matches. Try a lower level, a longer time window, or a broader skill (searching a parent skill includes the tools under it).</div>
            : <ul className="cpm-skills-admin-people">{result.people.map(h => <PersonCard key={h.member.id} hit={h} onOpen={setPerson} onVerify={(member, skill) => setVerify({ member, skill: { skillId: skill.skillId, name: skill.name } })} />)}</ul>}
        </>
      )}
    </div>
  );
}

function AskBox({ projects }) {
  const [question, setQuestion] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || question.trim().length < 5) return;
    setBusy(true);
    try { setRes(await api.ask(question.trim(), projectId)); }
    catch (err) { toast.error(errorMessage(err, "Could not answer that")); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <form className="cpm-skills-form" onSubmit={submit}>
        <label>Ask about who could do something
          <textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)} maxLength={500}
            placeholder="Who could take over thermal analysis on the rover enclosure? Someone with FEA at level 3 or better, active this year." />
        </label>
        {projects.length > 0 && (
          <label>About a project (optional)
            <select value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">Whole club</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <div className="cpm-skill-actions"><button type="submit" className="cpm-profile-edit-save" disabled={busy || question.trim().length < 5}>{busy ? "Thinking…" : "Ask"}</button></div>
      </form>
      <p className="cpm-skills-notice">You can also ask this in any project&apos;s assistant; it answers with that project&apos;s tasks and people in view.</p>
      {res && (
        <div className="cpm-skills-admin-card" role="region" aria-label="Answer">
          <p className="cpm-skills-answer">{res.answer}</p>
          <div className="cpm-skill-meta">
            {res.filters.skills.length ? `Skills: ${res.filters.skills.map(s => s.name).join(", ")}. ` : ""}
            {res.filters.minLevel ? `Level ${res.filters.minLevel}+. ` : ""}
            {res.filters.activeWithinDays ? `Active in last ${res.filters.activeWithinDays} days. ` : ""}
            Matched by {res.mode === "mixed" ? "filters and meaning" : res.mode === "structured" ? "filters" : res.mode === "semantic" ? "meaning of recorded work" : "nothing"}.
            {!res.modelAnswered && res.people.length ? " (Plain results: the written answer was not available.)" : ""}
          </div>
          <ul className="cpm-skills-admin-people">
            {res.people.map(p => (
              <li key={p.member.id} className="cpm-skills-admin-person">
                <div className="cpm-skills-admin-person-head">
                  <strong>{p.member.displayName}</strong>
                  {p.onProject === false && <span className="cpm-skill-pill">not on this project</span>}
                </div>
                {p.why && <p className="cpm-skills-notice">{p.why}</p>}
                <ul className="cpm-skill-provs">
                  {p.skills.map((s, i) => <li key={i}>{s.name}: level {s.level} · {PROVENANCE_META[s.provenance]?.label ?? s.provenance} · {s.confidenceBand.toLowerCase()} confidence</li>)}
                </ul>
                <ul className="cpm-skill-evidence">
                  {p.evidence.map(e => (
                    <li key={e.id} className={e.cited ? "cpm-skill-cited" : undefined}>
                      <i className={sourceIcon(e.source)} aria-hidden="true" />
                      <div className="cpm-skill-evidence-body">
                        <div>{e.summary}{e.cited ? <span className="cpm-skill-pill">cited</span> : null}</div>
                        <div className="cpm-skill-evidence-meta">{formatDay(e.date)}{e.project ? ` · ${e.project}` : ""} · {e.contribution.toLowerCase()}, complexity {e.complexity}/5{e.url && /^https?:/.test(e.url) ? <> · <a href={e.url} target="_blank" rel="noreferrer">open</a></> : null}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, value, label, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="cpm-sk-stat" {...(onClick ? { type: "button", onClick } : {})}>
      <i className={icon} aria-hidden="true" />
      <span className="cpm-sk-stat-value">{value}</span>
      <span className="cpm-sk-stat-label">{label}</span>
    </Tag>
  );
}

export default function SkillsAdmin() {
  const [tab, setTab] = useState("overview");
  const [status, setStatus] = useState(null);
  const [taxonomy, setTaxonomy] = useState([]);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const timer = useRef(null);

  const refresh = useCallback(() => api.status().then(setStatus).catch(() => setStatus(s => s)), []);
  const loadTaxonomy = useCallback(() => api.taxonomy().then(r => setTaxonomy(r.skills)).catch(() => {}), []);
  useEffect(() => {
    refresh();
    loadTaxonomy();
    get("/api/members").then(r => setMembers(Array.isArray(r) ? r : [])).catch(() => {});
    get("/api/projects").then(r => setProjects(Array.isArray(r) ? r : [])).catch(() => {});
  }, [refresh, loadTaxonomy]);

  // While a run or an estimate is in progress, keep the panel current without a reload.
  const busy = !!status?.running || !!status?.dryRun?.running;
  useEffect(() => {
    clearInterval(timer.current);
    if (busy) timer.current = setInterval(refresh, 4_000);
    return () => clearInterval(timer.current);
  }, [busy, refresh]);
  // A finished run can install the starter list: reload what depends on it.
  const wasBusy = useRef(false);
  useEffect(() => { if (wasBusy.current && !busy) loadTaxonomy(); wasBusy.current = busy; }, [busy, loadTaxonomy]);

  const reviewCount = status ? status.pendingProposals + status.openDisputes : 0;
  const active = taxonomy.filter(s => s.status === "ACTIVE");
  const TABS = [
    ["overview", "Overview", "fas fa-gauge-high"],
    ["people", "People", "fas fa-table-cells"],
    ["find", "Find people", "fas fa-magnifying-glass"],
    ["ask", "Ask", "fas fa-comments"],
    ["review", `Review${reviewCount ? ` (${reviewCount})` : ""}`, "fas fa-inbox"],
    ["taxonomy", "Taxonomy", "fas fa-sitemap"],
  ];
  const latest = status?.latest;

  return (
    <div className="cpm-profile-card cpm-skills-admin" data-testid="skills-admin">
      <header className="cpm-sk-header">
        <div>
          <h3>Skills</h3>
          <p className="cpm-skills-notice">Inferred each week from tasks, CAD check-ins and GitHub work, with the evidence behind every skill. Advisory only: use it to find people and start a conversation, not to score anyone.</p>
        </div>
        {status && (
          <div className={`cpm-sk-status-chip ${status.running ? "running" : latest ? latest.status.toLowerCase() : "none"}`}>
            {status.running ? <><span className="cpm-sk-pulse" aria-hidden="true" /> Running</> : latest ? <>Last run <b>{latest.status.toLowerCase()}</b> {formatDay(latest.startedAt)}</> : "No run yet"}
          </div>
        )}
      </header>

      {status && (
        <div className="cpm-sk-stats">
          <Stat icon="fas fa-users" value={status.membersWithSkills} label={`of ${status.totalMembers ?? "?"} people have skills`} onClick={() => setTab("people")} />
          <Stat icon="fas fa-file-lines" value={status.evidenceCount} label="pieces of work analysed" />
          <Stat icon="fas fa-sitemap" value={status.activeSkills ?? active.length} label="skills in the list" onClick={() => setTab("taxonomy")} />
          <Stat icon="fas fa-inbox" value={reviewCount} label={`to review: ${status.pendingProposals} proposed · ${status.openDisputes} flagged`} onClick={() => setTab("review")} />
        </div>
      )}

      <div className="cpm-skills-admin-tabs" role="tablist" aria-label="Skills tools">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <i className={icon} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "overview" && (status ? <SkillsRunPanel status={status} members={members} onRefresh={refresh} /> : <div className="cpm-skill-evidence-empty">Loading status…</div>)}
        {tab === "people" && <SkillsMatrix />}
        {tab === "find" && <FindPeople taxonomy={active} />}
        {tab === "ask" && <AskBox projects={projects} />}
        {tab === "review" && <SkillsReview onChanged={() => { refresh(); loadTaxonomy(); }} />}
        {tab === "taxonomy" && <SkillsTaxonomy skills={taxonomy} onChanged={() => { loadTaxonomy(); refresh(); }} />}
      </div>
    </div>
  );
}
