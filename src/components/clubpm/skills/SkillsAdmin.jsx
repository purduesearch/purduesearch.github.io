// Admin: who is strong at what, with the evidence. Staffing search, natural
// language questions, and run control. Everything here is advisory: results are
// per skill with level and confidence side by side, never a total score or a
// leaderboard. Review queues and the taxonomy live in SkillsReview.

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { get, skillsAdminApi as api } from "../../../api/clubPmClient";
import SkillsReview from "./SkillsReview";
import { BAND_LABELS, LEVEL_LABELS, PROVENANCE_META, errorMessage, formatDay, formatMonth, sourceIcon } from "./skillsShared";

const ACTIVE_OPTIONS = [["", "Any time"], ["90", "Last 3 months"], ["180", "Last 6 months"], ["365", "Last year"]];

function StatusPanel({ status, members, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [dryRun, setDryRun] = useState(null);
  const latest = status?.latest;
  const running = !!status?.running;

  const act = async (fn, okMessage) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(); if (okMessage) toast.success(okMessage); onRefresh(); return r; }
    catch (err) { toast.error(errorMessage(err, "That did not work")); }
    finally { setBusy(false); }
    return undefined;
  };

  if (!status) return <div className="cpm-skills-admin-card">Loading status…</div>;
  return (
    <div className="cpm-skills-admin-card" aria-label="Last run status">
      <div className="cpm-skills-admin-status">
        <div>
          <strong>Last run</strong>{" "}
          {latest ? (
            <>
              <span className={`cpm-skill-pill cpm-skill-pill--${latest.status.toLowerCase()}`}>{latest.status.toLowerCase()}</span>{" "}
              {formatDay(latest.startedAt)} · {latest.trigger.toLowerCase()}
              <div className="cpm-skill-meta">
                {Object.entries(latest.counts ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "nothing to analyse"}
                {` · ${latest.tokensIn + latest.tokensOut} tokens · est $${(latest.estCostUsd ?? 0).toFixed(3)}`}
                {(latest.errors ?? []).length ? ` · ${latest.errors.length} issue${latest.errors.length === 1 ? "" : "s"}` : ""}
              </div>
            </>
          ) : <span className="cpm-skill-meta">No run yet.</span>}
        </div>
        <div className="cpm-skill-meta">
          {status.enabled ? `Scheduled: ${status.schedule}` : "Weekly schedule is off (set SKILLS_ENABLED=1)"}
          {!status.geminiConfigured ? " · Gemini key missing" : ""}
          <br />{status.evidenceCount} evidence items · {status.membersWithSkills} people with skills · {status.pendingProposals} proposed skills · {status.openDisputes} flagged tags
        </div>
      </div>
      {(latest?.errors ?? []).length > 0 && (
        <details className="cpm-skills-section"><summary>Issues from the last run</summary>
          <ul className="cpm-skill-provs">{latest.errors.slice(0, 10).map((e, i) => <li key={i}><strong>{e.stage}</strong>: {e.message}</li>)}</ul>
        </details>
      )}
      {running && <p className="cpm-skills-notice" role="status">A run is in progress (started {formatDay(status.running.startedAt)}). This page refreshes itself.</p>}
      <div className="cpm-skill-actions">
        <button type="button" className="cpm-profile-edit-save" disabled={busy || running || !status.geminiConfigured} onClick={() => act(() => api.startRun({}), "Run started")}>Run for everyone</button>
        <button type="button" className="cpm-profile-edit-cancel" disabled={busy} onClick={async () => { const r = await act(() => api.startRun({ dryRun: true })); if (r) setDryRun(r); }}>Estimate cost (dry run)</button>
        <select aria-label="Member for a manual check" value={memberId} onChange={e => setMemberId(e.target.value)}>
          <option value="">Check one member…</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
        </select>
        <button type="button" className="cpm-profile-edit-cancel" disabled={busy || running || !memberId || !status.geminiConfigured} onClick={() => act(() => api.startRun({ memberId, sinceDays: 90 }), "Check started")}>Check last 90 days</button>
        <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => act(() => api.recompute(), "Scores recomputed")}>Recompute scores</button>
      </div>
      {dryRun && <p className="cpm-skills-notice">Dry run: {dryRun.counts.toAnalyze ?? 0} new items to analyse, about {dryRun.tokensIn + dryRun.tokensOut} tokens, est ${dryRun.estCostUsd.toFixed(3)}. Nothing was sent or saved.</p>}
    </div>
  );
}

function PersonCard({ hit, onVerify }) {
  return (
    <li className="cpm-skills-admin-person">
      <div className="cpm-skills-admin-person-head">
        <strong>{hit.member.displayName}</strong>
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

function VerifyForm({ target, onDone, onCancel }) {
  const [level, setLevel] = useState(3);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await api.verify({ memberId: target.member.id, skillId: target.skill.skillId, level, note: note.trim() || null }); toast.success("Recorded as lead-verified"); onDone(); }
    catch (err) { toast.error(errorMessage(err, "Could not save")); }
    finally { setBusy(false); }
  };
  return (
    <form className="cpm-skills-admin-card cpm-skills-form" onSubmit={submit}>
      <strong>Verify {target.skill.name} for {target.member.displayName}</strong>
      <p className="cpm-skills-notice">Your verification is stored as its own line next to the analysis. It does not overwrite it.</p>
      <label>Level
        <select value={level} onChange={e => setLevel(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} · {LEVEL_LABELS[n]}</option>)}</select>
      </label>
      <label>Why (optional)<input value={note} onChange={e => setNote(e.target.value)} maxLength={280} /></label>
      <div className="cpm-skill-actions">
        <button type="button" className="cpm-profile-edit-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cpm-profile-edit-save" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

function FindPeople({ taxonomy }) {
  const [form, setForm] = useState({ skill: "", minLevel: "3", activeWithinDays: "180", minConfidence: "" });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(null);
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
      {verify && <VerifyForm target={verify} onCancel={() => setVerify(null)} onDone={() => { setVerify(null); run(); }} />}
      {result && (
        <>
          <p className="cpm-skills-notice">{result.advisory}</p>
          {result.people.length === 0
            ? <div className="cpm-skill-evidence-empty">No one matches. Try a lower level, a longer time window, or a broader skill (searching a parent skill includes the tools under it).</div>
            : <ul className="cpm-skills-admin-people">{result.people.map(h => <PersonCard key={h.member.id} hit={h} onVerify={(member, skill) => setVerify({ member, skill })} />)}</ul>}
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

export default function SkillsAdmin() {
  const [tab, setTab] = useState("find");
  const [status, setStatus] = useState(null);
  const [taxonomy, setTaxonomy] = useState([]);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const timer = useRef(null);

  const refresh = useCallback(() => api.status().then(setStatus).catch(() => setStatus(s => s)), []);
  useEffect(() => {
    refresh();
    api.taxonomy().then(r => setTaxonomy(r.skills.filter(s => s.status === "ACTIVE"))).catch(() => {});
    get("/api/members").then(r => setMembers(Array.isArray(r) ? r : [])).catch(() => {});
    get("/api/projects").then(r => setProjects(Array.isArray(r) ? r : [])).catch(() => {});
  }, [refresh]);

  // While a run is in progress, keep the panel current without a page reload.
  useEffect(() => {
    clearInterval(timer.current);
    if (status?.running) timer.current = setInterval(refresh, 10_000);
    return () => clearInterval(timer.current);
  }, [status?.running, refresh]);

  const TABS = [
    ["find", "Find people"],
    ["ask", "Ask"],
    ["review", `Review${status && status.pendingProposals + status.openDisputes ? ` (${status.pendingProposals + status.openDisputes})` : ""}`],
  ];

  return (
    <div className="cpm-profile-card cpm-skills-admin" data-testid="skills-admin">
      <h3 style={{ marginTop: 0 }}>Skills</h3>
      <p className="cpm-skills-notice">Inferred from tasks, CAD check-ins and GitHub work each week, with the evidence behind every skill. Advisory only: use it to find people and start a conversation, not to score anyone.</p>
      <StatusPanel status={status} members={members} onRefresh={refresh} />
      <div className="cpm-skills-admin-tabs" role="tablist" aria-label="Skills tools">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "find" && <FindPeople taxonomy={taxonomy} />}
      {tab === "ask" && <AskBox projects={projects} />}
      {tab === "review" && <SkillsReview onChanged={refresh} />}
    </div>
  );
}
