// Admin → Skills → Overview: is the pipeline set up, what is it doing right now,
// and what did each recent run do. Runs start in the background on the server;
// this panel polls /status while one (or a cost estimate) is in progress.

import { useState } from "react";
import toast from "react-hot-toast";
import { skillsAdminApi as api } from "../../../api/clubPmClient";
import { errorMessage, formatDay } from "./skillsShared";

const WINDOWS = [["", "New work since the last run"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["180", "Last 6 months"], ["365", "Last year"]];

const COUNT_LABELS = {
  seen: "items found", toAnalyze: "to analyse", alreadyAnalyzed: "already done", analyzed: "analysed", evidenceWritten: "evidence written",
  noSkillSignal: "no skill shown", proposalsQueued: "new skill proposals", proposalsMapped: "proposals matched", membersRecomputed: "people updated",
  failed: "failed", invalid: "unusable answers", deferredOverCap: "left for next run", collectorsFailed: "sources down", unmapped: "unlinked GitHub users",
  starterSkillsInstalled: "starter skills installed", embedFailed: "missing embeddings", collectorWarnings: "source warnings",
};
const STAGE_LABELS = { "collect:github": "Reading GitHub", "collect:cad": "Reading CAD check-ins", "collect:task": "Reading finished tasks", analyze: "Analysing work", "analyze:batch": "Waiting on batch job", write: "Saving evidence", recompute: "Updating levels" };

function since(iso) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return formatDay(iso);
}
function duration(a, b) {
  if (!a || !b) return "";
  const s = Math.round((new Date(b) - new Date(a)) / 1000);
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
}
function scopeLabel(scope) {
  if (!scope) return "Everyone, new work";
  if (scope.memberIds?.length) return `${scope.memberIds.length === 1 ? "One member" : `${scope.memberIds.length} members`}`;
  if (scope.since) return `Window from ${formatDay(scope.since)}`;
  return "Custom";
}

function Countline({ counts }) {
  const keys = ["analyzed", "evidenceWritten", "proposalsQueued", "membersRecomputed", "failed", "invalid", "deferredOverCap", "starterSkillsInstalled"];
  const parts = keys.filter(k => counts?.[k]).map(k => `${counts[k]} ${COUNT_LABELS[k]}`);
  return <>{parts.join(" · ") || (counts?.seen ? `${counts.seen} items found, nothing new` : "Nothing new to analyse")}</>;
}

function Checklist({ status, onSeed, busy }) {
  const bad = status.checks.filter(c => !c.ok);
  return (
    <div className="cpm-sk-card">
      <div className="cpm-sk-card-head">
        <h4>Setup</h4>
        <span className={`cpm-skill-pill ${bad.length ? "cpm-skill-pill--partial" : "cpm-skill-pill--succeeded"}`}>{bad.length ? `${bad.length} to fix` : "ready"}</span>
      </div>
      <ul className="cpm-sk-checks">
        {status.checks.map(c => (
          <li key={c.id} className={c.ok ? "ok" : "bad"}>
            <i className={c.ok ? "fas fa-circle-check" : "fas fa-circle-exclamation"} aria-hidden="true" />
            <span className="cpm-sk-check-label">{c.label}</span>
            <span className="cpm-sk-check-detail">{c.detail}</span>
            {c.id === "taxonomy" && !c.ok && <button type="button" className="cpm-profile-edit-save" disabled={busy} onClick={onSeed}>Install starter skills</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LiveRun({ run, onCancel, busy }) {
  const p = run.progress ?? {};
  const pct = p.total ? Math.round((p.done / p.total) * 100) : null;
  return (
    <div className="cpm-sk-live" role="status" aria-live="polite">
      <div className="cpm-sk-live-head">
        <span className="cpm-sk-pulse" aria-hidden="true" />
        <strong>{STAGE_LABELS[p.stage] ?? "Starting"}</strong>
        <span className="cpm-skill-meta">started {since(run.startedAt)} · {run.trigger.toLowerCase()} · {scopeLabel(run.scope)}</span>
        <button type="button" className="cpm-profile-edit-cancel" disabled={busy || run.cancelRequested} onClick={onCancel}>{run.cancelRequested ? "Stopping…" : "Stop run"}</button>
      </div>
      <div className="cpm-sk-bar" aria-hidden="true"><span style={{ width: `${pct ?? 8}%` }} className={pct === null ? "indeterminate" : ""} /></div>
      {p.total ? <div className="cpm-skill-meta">{p.done} of {p.total}{p.stage === "analyze" ? " items analysed" : ""}</div> : null}
    </div>
  );
}

function RunControls({ status, members, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [windowDays, setWindowDays] = useState("");
  const running = !!status.running;
  const ready = status.geminiConfigured;
  const dry = status.dryRun;

  const act = async (fn, ok) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(); if (ok) toast.success(ok); onRefresh(); return r; }
    catch (err) { toast.error(errorMessage(err, "That did not work")); return undefined; }
    finally { setBusy(false); }
  };
  const body = () => ({ ...(memberId ? { memberId } : {}), ...(windowDays ? { sinceDays: Number(windowDays) } : memberId ? { sinceDays: 90 } : {}) });
  const custom = !!(memberId || windowDays);

  return (
    <div className="cpm-sk-card">
      <div className="cpm-sk-card-head">
        <h4>Run</h4>
        <span className="cpm-skill-meta">{status.enabled ? `Automatic: ${status.schedule}` : "Automatic weekly run is off"}</span>
      </div>
      {running && <LiveRun run={status.running} busy={busy} onCancel={() => act(() => api.cancelRun(status.running.id), "Stopping after the current item")} />}
      {status.staleRun && (
        <div className="cpm-sk-warn" role="alert">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> A run from {since(status.staleRun.startedAt)} stopped responding (usually a deploy or restart).
          <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => act(() => api.cancelRun(status.staleRun.id), "Closed")}>Close it</button>
        </div>
      )}
      {!ready && <div className="cpm-sk-warn" role="alert"><i className="fas fa-plug-circle-xmark" aria-hidden="true" /> {status.configProblems?.join("; ") || "Gemini is not configured on the server."}</div>}

      <div className="cpm-sk-run-form">
        <label>Who
          <select aria-label="Member for a manual check" value={memberId} onChange={e => setMemberId(e.target.value)}>
            <option value="">Everyone</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </label>
        <label>Which work
          <select aria-label="Time window" value={windowDays} onChange={e => setWindowDays(e.target.value)}>
            {WINDOWS.map(([v, l]) => <option key={v} value={v}>{memberId && !v ? "Last 90 days" : l}</option>)}
          </select>
        </label>
        <div className="cpm-sk-run-buttons">
          <button type="button" className="cpm-profile-edit-save" disabled={busy || running || !ready}
            onClick={() => act(() => api.startRun(body()), custom ? "Check started" : "Run started")}>
            <i className="fas fa-play" aria-hidden="true" /> {custom ? "Run for this selection" : "Run for everyone"}
          </button>
          <button type="button" className="cpm-profile-edit-cancel" disabled={busy || dry?.running}
            onClick={() => act(() => api.startRun({ ...body(), dryRun: true }), "Estimating…")}>
            {dry?.running ? "Estimating…" : "Estimate cost"}
          </button>
        </div>
      </div>
      <p className="cpm-skills-notice">
        A normal run reads only work since the last one, and never analyses the same item twice. A window or one member is a backfill: it does not move the run&apos;s bookmarks.
      </p>
      {dry && !dry.running && (dry.result || dry.error) && (
        <div className="cpm-sk-dry">
          <strong>Estimate</strong> ({dry.scope}, {since(dry.finishedAt)}):{" "}
          {dry.error ? <span className="cpm-sk-err">{dry.error}</span> : (
            <>{dry.result.counts?.toAnalyze ?? 0} new items to analyse ({dry.result.counts?.alreadyAnalyzed ?? 0} already done), about {(dry.result.tokensIn + dry.result.tokensOut).toLocaleString()} tokens, est ${dry.result.estCostUsd.toFixed(3)}. Nothing was sent or saved.</>
          )}
        </div>
      )}
      <div className="cpm-sk-run-extra">
        <button type="button" className="cpm-skill-link" disabled={busy} onClick={() => act(() => api.recompute(), "Levels recomputed")}>Recompute levels</button>
        <button type="button" className="cpm-skill-link" disabled={busy || !ready} onClick={() => act(async () => { const r = await api.embedMissing(); toast.success(`Embedded ${r?.embedded ?? 0} items`); }, null)}>Fill missing embeddings</button>
      </div>
    </div>
  );
}

function History({ runs }) {
  const [open, setOpen] = useState(null);
  if (!runs?.length) return <div className="cpm-sk-card"><h4>History</h4><div className="cpm-skill-evidence-empty">No runs yet. Start one above, or estimate the cost first.</div></div>;
  return (
    <div className="cpm-sk-card">
      <div className="cpm-sk-card-head"><h4>History</h4><span className="cpm-skill-meta">last {runs.length}</span></div>
      <ul className="cpm-sk-history">
        {runs.map(r => {
          const issues = r.errors ?? [];
          const expanded = open === r.id;
          return (
            <li key={r.id}>
              <button type="button" className="cpm-sk-history-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.id)}>
                <span className={`cpm-skill-pill cpm-skill-pill--${r.status.toLowerCase()}`}>{r.status.toLowerCase()}</span>
                <span className="cpm-sk-history-when">{formatDay(r.startedAt)}<small>{r.trigger.toLowerCase()} · {scopeLabel(r.scope)}{r.finishedAt ? ` · ${duration(r.startedAt, r.finishedAt)}` : ""}</small></span>
                <span className="cpm-sk-history-what"><Countline counts={r.counts} /></span>
                <span className="cpm-sk-history-cost">${(r.estCostUsd ?? 0).toFixed(3)}</span>
                <span className="cpm-sk-history-issues">{issues.length ? <><i className="fas fa-triangle-exclamation" aria-hidden="true" /> {issues.length}</> : ""}</span>
                <i className={`fas fa-chevron-${expanded ? "up" : "down"}`} aria-hidden="true" />
              </button>
              {expanded && (
                <div className="cpm-sk-history-detail">
                  <div className="cpm-sk-kv">
                    {Object.entries(r.counts ?? {}).filter(([, v]) => v).map(([k, v]) => <span key={k}><b>{v}</b> {COUNT_LABELS[k] ?? k}</span>)}
                    <span><b>{((r.tokensIn ?? 0) + (r.tokensOut ?? 0)).toLocaleString()}</b> tokens</span>
                    {r.modelVersion && <span>model <b>{r.modelVersion}</b></span>}
                  </div>
                  {issues.length > 0 ? (
                    <ul className="cpm-sk-issues">{issues.slice(0, 20).map((e, i) => <li key={i}><code>{e.stage}</code> {e.message}</li>)}</ul>
                  ) : <div className="cpm-skill-meta">No issues.</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SkillsRunPanel({ status, members, onRefresh }) {
  const [seeding, setSeeding] = useState(false);
  const seed = async () => {
    if (seeding) return;
    setSeeding(true);
    try { const r = await api.seedTaxonomy(); toast.success(`Installed ${r.created} skills`); onRefresh(); }
    catch (err) { toast.error(errorMessage(err, "Could not install the starter skills")); }
    finally { setSeeding(false); }
  };
  return (
    <div className="cpm-sk-overview">
      <RunControls status={status} members={members} onRefresh={onRefresh} />
      <Checklist status={status} onSeed={seed} busy={seeding} />
      <History runs={status.recent} />
    </div>
  );
}
