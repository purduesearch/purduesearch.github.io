// Top-level GitHub tab content for a project.
// Layout:
//   1) Header strip with repo stats (stars, forks, open issues) + Change/Link button
//   2) Sub-tab bar: Issues, Pull requests, Branches, Files, Commits
//   3) Active sub-panel content
//
// Mirrors DriveFilesPanel structure: lazy-loads from /api/github endpoints,
// degrades gracefully when no repo is linked, when the user hasn't connected
// GitHub yet, or when the API returns 4xx/5xx.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { get } from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import { formatRelativeTime, labelContrast } from "../../../utils/githubUtils";
import LinkRepoModal from "./LinkRepoModal";
import IssuePreviewModal from "./IssuePreviewModal";
import PrPreviewModal from "./PrPreviewModal";
import FilePreviewModal from "./FilePreviewModal";
import ImportIssuesModal from "./ImportIssuesModal";

const SUB_TABS = [
  { id: "issues",   label: "Issues",   icon: "fa-circle-dot" },
  { id: "pulls",    label: "Pull requests", icon: "fa-code-pull-request" },
  { id: "branches", label: "Branches", icon: "fa-code-branch" },
  { id: "files",    label: "Files",    icon: "fa-folder-tree" },
  { id: "commits",  label: "Commits",  icon: "fa-code-commit" },
];

function StatTile({ icon, label, value, href }) {
  const Inner = (
    <div className="cpm-gh-stat-tile">
      <i className={`fas ${icon}`} aria-hidden="true" />
      <div>
        <div className="cpm-gh-stat-value">{value ?? "—"}</div>
        <div className="cpm-gh-stat-label">{label}</div>
      </div>
    </div>
  );
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{Inner}</a> : Inner;
}

export default function GitHubPanel({ project, onProjectChange }) {
  const { member } = useClubPmAuth();
  const isAdmin = Boolean(member?.isAdmin);
  const projectId = project?.id;
  const repo = project?.githubRepo;

  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [activeTab, setActiveTab] = useState("issues");

  const loadStats = useCallback(() => {
    if (!projectId || !repo) {
      setStats(null);
      setStatsError(null);
      return;
    }
    get(`/api/github/projects/${projectId}/repo`)
      .then(setStats)
      .catch(err => setStatsError(err?.message ?? "Failed to load repo"));
  }, [projectId, repo]);

  useEffect(loadStats, [loadStats]);

  // ── Empty / disconnected states ─────────────────────────────

  if (!repo) {
    return (
      <div className="cpm-gh-panel">
        <div className="cpm-gh-empty-card">
          <i className="fab fa-github" style={{ fontSize: 48 }} aria-hidden="true" />
          <h3>No GitHub repository linked</h3>
          <p>
            Link a repo to browse its issues, pull requests, branches, and source files
            without leaving ClubPM.
          </p>
          {isAdmin ? (
            <button className="clubpm-btn-primary" onClick={() => setEditing(true)}>
              Link a repository
            </button>
          ) : (
            <p className="cpm-gh-hint">An admin can link a repo from this tab.</p>
          )}
        </div>
        {editing && (
          <LinkRepoModal
            projectId={projectId}
            currentRepo={null}
            onClose={() => setEditing(false)}
            onSaved={p => { onProjectChange?.(p); loadStats(); }}
          />
        )}
      </div>
    );
  }

  // ── Linked: header + sub-tabs ───────────────────────────────

  return (
    <div className="cpm-gh-panel">
      <div className="cpm-gh-header">
        <div className="cpm-gh-header-main">
          <div className="cpm-gh-header-title">
            <i className="fab fa-github" aria-hidden="true" />
            <a href={stats?.htmlUrl ?? `https://github.com/${repo}`} target="_blank" rel="noopener noreferrer">
              {repo}
            </a>
            {stats?.visibility && <span className="cpm-gh-visibility">{stats.visibility}</span>}
          </div>
          {stats?.description && <p className="cpm-gh-header-desc">{stats.description}</p>}
        </div>
        <div className="cpm-gh-header-actions">
          <button className="cpm-gh-refresh-btn" onClick={loadStats} title="Refresh repo stats">
            <i className="fas fa-rotate" aria-hidden="true" />
          </button>
          <button className="cpm-gh-edit-btn" onClick={() => setImporting(true)} title="Import open issues as tasks">
            <i className="fas fa-download" aria-hidden="true" /> Import issues
          </button>
          {isAdmin && (
            <button className="cpm-gh-edit-btn" onClick={() => setEditing(true)}>
              Change repo
            </button>
          )}
        </div>
      </div>

      <div className="cpm-gh-stats-row">
        <StatTile icon="fa-star" label="Stars" value={stats?.stars} />
        <StatTile icon="fa-code-fork" label="Forks" value={stats?.forks} />
        <StatTile icon="fa-circle-dot" label="Open issues" value={stats?.openIssues} />
        <StatTile icon="fa-code-branch" label="Default branch" value={stats?.defaultBranch} />
        <StatTile icon="fa-code" label="Language" value={stats?.language} />
      </div>

      {statsError && <p className="cpm-gh-error">{statsError}</p>}

      <div className="cpm-gh-subtabs" role="tablist">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`cpm-gh-subtab ${activeTab === t.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      <div className="cpm-gh-subpanel">
        {activeTab === "issues"   && <IssuesList projectId={projectId} />}
        {activeTab === "pulls"    && <PullsList projectId={projectId} />}
        {activeTab === "branches" && <BranchesList projectId={projectId} defaultBranch={stats?.defaultBranch} />}
        {activeTab === "files"    && <FilesBrowser projectId={projectId} defaultBranch={stats?.defaultBranch} />}
        {activeTab === "commits"  && <CommitsList projectId={projectId} />}
      </div>

      {editing && (
        <LinkRepoModal
          projectId={projectId}
          currentRepo={repo}
          currentBlockOnCiFail={project?.githubBlockDoneOnCiFail ?? true}
          onClose={() => setEditing(false)}
          onSaved={p => { onProjectChange?.(p); loadStats(); }}
        />
      )}
      {importing && (
        <ImportIssuesModal
          projectId={projectId}
          onClose={() => setImporting(false)}
          onImported={() => { loadStats(); }}
        />
      )}
    </div>
  );
}

// ── Sub-panels ───────────────────────────────────────────────

function useEndpoint(path, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    get(path)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(err?.message ?? "Request failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, deps);

  return { data, loading, error };
}

function IssuesList({ projectId }) {
  const [stateFilter, setStateFilter] = useState("open");
  const { data, loading, error } = useEndpoint(
    `/api/github/projects/${projectId}/issues?state=${stateFilter}`,
    [projectId, stateFilter]
  );
  const [openIssue, setOpenIssue] = useState(null);
  const issues = data?.issues ?? [];

  return (
    <>
      <div className="cpm-gh-filter-row">
        {["open", "closed", "all"].map(s => (
          <button
            key={s}
            className={`cpm-gh-filter-chip ${stateFilter === s ? "is-active" : ""}`}
            onClick={() => setStateFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {loading && <p className="cpm-gh-loading">Loading issues…</p>}
      {error && <p className="cpm-gh-error">{error}</p>}
      {!loading && !error && issues.length === 0 && (
        <p className="cpm-gh-empty">No {stateFilter !== "all" ? stateFilter : ""} issues.</p>
      )}
      <ul className="cpm-gh-list">
        {issues.map(i => (
          <li key={i.number} className="cpm-gh-list-row" onClick={() => setOpenIssue(i.number)}>
            <i
              className={`fas ${i.state === "closed" ? "fa-circle-check" : "fa-circle-dot"}`}
              style={{ color: i.state === "closed" ? "var(--cpm-gh-closed, #8957e5)" : "var(--cpm-gh-open, #1f883d)" }}
              aria-hidden="true"
            />
            <div className="cpm-gh-list-main">
              <div className="cpm-gh-list-title">
                <span>{i.title}</span>
                <span className="cpm-gh-list-num">#{i.number}</span>
                {i.labels.slice(0, 3).map(l => (
                  <span
                    key={l.name}
                    className="cpm-gh-label-chip cpm-gh-label-chip-sm"
                    style={{ background: `#${l.color}`, color: labelContrast(l.color) }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
              <div className="cpm-gh-list-sub">
                {i.author && <>@{i.author} · </>}
                updated {formatRelativeTime(i.updatedAt)}
                {i.comments > 0 && <> · {i.comments} 💬</>}
              </div>
            </div>
            {i.assignees.slice(0, 3).map(a => (
              <img key={a.login} src={a.avatarUrl} alt={a.login} title={`@${a.login}`} className="cpm-gh-avatar" />
            ))}
          </li>
        ))}
      </ul>
      {openIssue != null && (
        <IssuePreviewModal
          projectId={projectId}
          number={openIssue}
          onClose={() => setOpenIssue(null)}
        />
      )}
    </>
  );
}

function PullsList({ projectId }) {
  const [stateFilter, setStateFilter] = useState("open");
  const { data, loading, error } = useEndpoint(
    `/api/github/projects/${projectId}/pulls?state=${stateFilter}`,
    [projectId, stateFilter]
  );
  const [openPr, setOpenPr] = useState(null);
  const pulls = data?.pulls ?? [];

  function prStateIcon(p) {
    if (p.merged) return { icon: "fa-code-merge", color: "var(--cpm-gh-merged, #8957e5)" };
    if (p.state === "closed") return { icon: "fa-circle-xmark", color: "var(--cpm-gh-bad, #cf222e)" };
    if (p.draft) return { icon: "fa-pen-ruler", color: "var(--clubpm-text-secondary, #888)" };
    return { icon: "fa-code-pull-request", color: "var(--cpm-gh-ok, #1f883d)" };
  }

  return (
    <>
      <div className="cpm-gh-filter-row">
        {["open", "closed", "all"].map(s => (
          <button
            key={s}
            className={`cpm-gh-filter-chip ${stateFilter === s ? "is-active" : ""}`}
            onClick={() => setStateFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {loading && <p className="cpm-gh-loading">Loading pull requests…</p>}
      {error && <p className="cpm-gh-error">{error}</p>}
      {!loading && !error && pulls.length === 0 && (
        <p className="cpm-gh-empty">No {stateFilter !== "all" ? stateFilter : ""} pull requests.</p>
      )}
      <ul className="cpm-gh-list">
        {pulls.map(p => {
          const s = prStateIcon(p);
          return (
            <li key={p.number} className="cpm-gh-list-row" onClick={() => setOpenPr(p.number)}>
              <i className={`fas ${s.icon}`} style={{ color: s.color }} aria-hidden="true" />
              <div className="cpm-gh-list-main">
                <div className="cpm-gh-list-title">
                  <span>{p.title}</span>
                  <span className="cpm-gh-list-num">#{p.number}</span>
                </div>
                <div className="cpm-gh-list-sub">
                  {p.author && <>@{p.author} · </>}
                  <code>{p.headRef}</code> → <code>{p.baseRef}</code>
                  {" · "}updated {formatRelativeTime(p.updatedAt)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {openPr != null && (
        <PrPreviewModal
          projectId={projectId}
          number={openPr}
          onClose={() => setOpenPr(null)}
        />
      )}
    </>
  );
}

function BranchesList({ projectId, defaultBranch }) {
  const { data, loading, error } = useEndpoint(
    `/api/github/projects/${projectId}/branches`,
    [projectId]
  );
  const branches = data?.branches ?? [];
  return (
    <>
      {loading && <p className="cpm-gh-loading">Loading branches…</p>}
      {error && <p className="cpm-gh-error">{error}</p>}
      <ul className="cpm-gh-list">
        {branches.map(b => (
          <li key={b.name} className="cpm-gh-list-row cpm-gh-list-row-static">
            <i className="fas fa-code-branch" aria-hidden="true" />
            <div className="cpm-gh-list-main">
              <div className="cpm-gh-list-title">
                <span>{b.name}</span>
                {b.name === defaultBranch && <span className="cpm-gh-pill">default</span>}
                {b.protected && <span className="cpm-gh-pill cpm-gh-pill-protected">protected</span>}
              </div>
              <div className="cpm-gh-list-sub">
                <code>{b.sha.slice(0, 7)}</code>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function FilesBrowser({ projectId, defaultBranch }) {
  const [path, setPath] = useState("");
  const { data, loading, error } = useEndpoint(
    `/api/github/projects/${projectId}/contents?path=${encodeURIComponent(path)}`,
    [projectId, path]
  );
  const [openFile, setOpenFile] = useState(null);

  const crumbs = useMemo(() => {
    if (!path) return [];
    const parts = path.split("/");
    return parts.map((p, i) => ({ name: p, path: parts.slice(0, i + 1).join("/") }));
  }, [path]);

  return (
    <>
      <nav className="cpm-gh-breadcrumb">
        <button onClick={() => setPath("")} className="cpm-gh-crumb">
          <i className="fas fa-home" aria-hidden="true" /> {defaultBranch ?? "root"}
        </button>
        {crumbs.map((c, i) => (
          <React.Fragment key={c.path}>
            <span className="cpm-gh-crumb-sep">/</span>
            <button
              className="cpm-gh-crumb"
              onClick={() => setPath(c.path)}
              disabled={i === crumbs.length - 1}
            >
              {c.name}
            </button>
          </React.Fragment>
        ))}
      </nav>
      {loading && <p className="cpm-gh-loading">Loading folder…</p>}
      {error && <p className="cpm-gh-error">{error}</p>}
      {data?.kind === "dir" && (
        <ul className="cpm-gh-list">
          {data.entries.map(e => (
            <li
              key={e.path}
              className="cpm-gh-list-row"
              onClick={() => (e.type === "dir" ? setPath(e.path) : setOpenFile(e.path))}
            >
              <i
                className={`fas ${e.type === "dir" ? "fa-folder" : "fa-file"}`}
                style={{ color: e.type === "dir" ? "var(--cpm-gh-folder, #54aeff)" : "var(--clubpm-text-secondary, #888)" }}
                aria-hidden="true"
              />
              <div className="cpm-gh-list-main">
                <div className="cpm-gh-list-title">{e.name}</div>
                {e.type === "file" && <div className="cpm-gh-list-sub">{(e.size / 1024).toFixed(1)} KB</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {openFile && (
        <FilePreviewModal
          projectId={projectId}
          path={openFile}
          onClose={() => setOpenFile(null)}
        />
      )}
    </>
  );
}

function CommitsList({ projectId }) {
  const { data, loading, error } = useEndpoint(
    `/api/github/projects/${projectId}/commits`,
    [projectId]
  );
  const commits = data?.commits ?? [];
  return (
    <>
      {loading && <p className="cpm-gh-loading">Loading commits…</p>}
      {error && <p className="cpm-gh-error">{error}</p>}
      <ul className="cpm-gh-list">
        {commits.map(c => (
          <li key={c.sha} className="cpm-gh-list-row cpm-gh-list-row-static">
            {c.authorAvatar
              ? <img src={c.authorAvatar} alt="" className="cpm-gh-avatar" />
              : <i className="fas fa-user-circle" aria-hidden="true" />
            }
            <div className="cpm-gh-list-main">
              <div className="cpm-gh-list-title">
                <span>{c.message.split("\n")[0]}</span>
              </div>
              <div className="cpm-gh-list-sub">
                {c.author && <>@{c.author} · </>}
                <code>{c.shortSha}</code>
                {c.date && <> · {formatRelativeTime(c.date)}</>}
              </div>
            </div>
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="cpm-gh-list-link" onClick={e => e.stopPropagation()}>
              <i className="fas fa-external-link-alt" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
