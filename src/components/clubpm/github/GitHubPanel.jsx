// Top-level GitHub tab content for a project.
// Layout:
//   0) Repo switcher: a tab strip across every ProjectRepo linked to this
//      project (multi-repo, Workstream B — all repos are equal, no
//      "primary" — see docs/superpowers/specs/2026-07-06-clubpm-drive-multirepo-design.md §4),
//      plus an "Add repo" trigger.
//   1) Header strip with repo stats (stars, forks, open issues) for the
//      selected repo + per-repo CI-gating toggle + remove button
//   2) Sub-tab bar: Issues, Pull requests, Branches, Files, Commits
//   3) Active sub-panel content, scoped to the selected repo
//
// Mirrors DriveFilesPanel structure: lazy-loads from /api/github endpoints,
// degrades gracefully when no repo is linked, when the user hasn't connected
// GitHub yet, or when the API returns 4xx/5xx.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  get,
  listProjectRepos,
  updateProjectRepo,
  removeProjectRepo,
  apiBaseUrl,
  getStoredToken,
} from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import { formatRelativeTime, labelContrast } from "../../../utils/githubUtils";
import AddRepoModal from "./AddRepoModal";
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

export default function GitHubPanel({ project }) {
  const { member } = useClubPmAuth();
  const isAdmin = Boolean(member?.isAdmin);
  const projectId = project?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState(null);
  const [selectedRepoId, setSelectedRepoId] = useState(null);
  const [repoActionPending, setRepoActionPending] = useState(false);

  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [activeTab, setActiveTab] = useState("issues");

  const loadRepos = useCallback(() => {
    if (!projectId) {
      setRepos([]);
      setReposError(null);
      setReposLoading(false);
      return;
    }
    setReposLoading(true);
    listProjectRepos(projectId)
      .then(d => {
        const list = d?.repos ?? [];
        setRepos(list);
        setReposError(null);
        setSelectedRepoId(prev => {
          if (prev && list.some(r => r.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      })
      .catch(err => setReposError(err?.message ?? "Failed to load repos"))
      .finally(() => setReposLoading(false));
  }, [projectId]);

  useEffect(loadRepos, [loadRepos]);

  const selectedRepo = useMemo(
    () => repos.find(r => r.id === selectedRepoId) ?? null,
    [repos, selectedRepoId]
  );

  const loadStats = useCallback(() => {
    if (!selectedRepoId) {
      setStats(null);
      setStatsError(null);
      return;
    }
    get(`/api/github/repos/${selectedRepoId}/repo`)
      .then(setStats)
      .catch(err => setStatsError(err?.message ?? "Failed to load repo"));
  }, [selectedRepoId]);

  useEffect(loadStats, [loadStats]);

  // Auto-open the Add Repo modal when returning from the C1 reauth redirect
  // (see startAddRepoReauth below). Strip the intent flag once consumed so a
  // refresh doesn't reopen the modal.
  useEffect(() => {
    if (searchParams.get("intent") !== "addrepo") return;
    setAdding(true);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete("intent");
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function selectRepo(repoId) {
    setSelectedRepoId(repoId);
    setActiveTab("issues");
  }

  // "Add repo" doesn't open the modal directly — it forces a full-page GitHub
  // OAuth round-trip first (mirrors GitHubConnectButton's connect()) so any
  // repo newly accessible to the member's GitHub account shows up when the
  // modal's "Check repo" validation queries GET /api/github/repo. Returns to
  // this project with ?intent=addrepo, handled by the effect above.
  function startAddRepoReauth() {
    if (!projectId) return;
    // FilesTabContent persists the Drive/GitHub sub-tab choice in
    // sessionStorage (no URL scheme exists for it today); pre-set it so
    // landing back on the Files tab shows GitHub, not Drive.
    try {
      sessionStorage.setItem(`cpm.files.sub.${projectId}`, "github");
    } catch {
      /* ignore */
    }
    const returnTo = `/clubpm/projects/${projectId}?tab=files&sub=github&intent=addrepo`;
    const token = getStoredToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
    window.location.href = `${apiBaseUrl}/auth/github?returnTo=${encodeURIComponent(returnTo)}${tokenParam}`;
  }

  async function toggleCiGating(repo) {
    if (repoActionPending) return;
    setRepoActionPending(true);
    try {
      const updated = await updateProjectRepo(repo.id, { blockDoneOnCiFail: !repo.blockDoneOnCiFail });
      setRepos(prev => prev.map(r => (r.id === updated.id ? updated : r)));
      toast.success(updated.blockDoneOnCiFail ? "CI gating enabled" : "CI gating disabled");
    } catch (err) {
      toast.error(err?.message ?? "Failed to update CI gating");
    } finally {
      setRepoActionPending(false);
    }
  }

  async function handleRemoveRepo(repo) {
    if (repoActionPending) return;
    if (!window.confirm(`Remove ${repo.slug} from this project? This can't be undone.`)) return;
    setRepoActionPending(true);
    try {
      await removeProjectRepo(repo.id);
      toast.success(`${repo.slug} removed`);
      loadRepos();
    } catch (err) {
      toast.error(err?.message ?? "Failed to remove repo");
    } finally {
      setRepoActionPending(false);
    }
  }

  // ── Loading state ───────────────────────────────────────────

  if (reposLoading && repos.length === 0) {
    return (
      <div className="cpm-gh-panel">
        <p className="cpm-gh-loading">Loading repositories…</p>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────

  if (repos.length === 0) {
    return (
      <div className="cpm-gh-panel">
        <div className="cpm-gh-empty-card">
          <i className="fab fa-github" style={{ fontSize: 48 }} aria-hidden="true" />
          <h3>Add a repository</h3>
          <p>
            Add a repo to browse its issues, pull requests, branches, and source files
            without leaving ClubPM. You can link more than one.
          </p>
          {reposError && <p className="cpm-gh-error">{reposError}</p>}
          {isAdmin ? (
            <button className="clubpm-btn-primary" onClick={startAddRepoReauth}>
              Add a repository
            </button>
          ) : (
            <p className="cpm-gh-hint">An admin can add a repo from this tab.</p>
          )}
        </div>
        {adding && (
          <AddRepoModal
            projectId={projectId}
            onClose={() => setAdding(false)}
            onSaved={() => { setAdding(false); loadRepos(); }}
          />
        )}
      </div>
    );
  }

  // ── Linked: switcher + header + sub-tabs ────────────────────

  return (
    <div className="cpm-gh-panel">
      <div className="cpm-gh-subtabs" role="tablist" aria-label="Linked repositories">
        {repos.map(r => (
          <button
            key={r.id}
            role="tab"
            aria-selected={selectedRepoId === r.id}
            className={`cpm-gh-subtab ${selectedRepoId === r.id ? "is-active" : ""}`}
            onClick={() => selectRepo(r.id)}
            title={r.slug}
          >
            <i className="fab fa-github" aria-hidden="true" /> {r.slug}
          </button>
        ))}
        {isAdmin && (
          <button className="cpm-gh-subtab" onClick={startAddRepoReauth} title="Add a repository">
            <i className="fas fa-plus" aria-hidden="true" /> Add repo
          </button>
        )}
      </div>

      {selectedRepo && (
        <>
          <div className="cpm-gh-header">
            <div className="cpm-gh-header-main">
              <div className="cpm-gh-header-title">
                <i className="fab fa-github" aria-hidden="true" />
                <a href={stats?.htmlUrl ?? `https://github.com/${selectedRepo.slug}`} target="_blank" rel="noopener noreferrer">
                  {selectedRepo.slug}
                </a>
                {stats?.visibility && <span className="cpm-gh-visibility">{stats.visibility}</span>}
              </div>
              {stats?.description && <p className="cpm-gh-header-desc">{stats.description}</p>}
            </div>
            <div className="cpm-gh-header-actions">
              <label className="cpm-gh-toggle" title="Block moving a task to Done when this repo's linked PR has failing CI">
                <input
                  type="checkbox"
                  checked={selectedRepo.blockDoneOnCiFail ?? true}
                  onChange={() => toggleCiGating(selectedRepo)}
                  disabled={!isAdmin || repoActionPending}
                />
                <span>Block Done on CI fail</span>
              </label>
              <button className="cpm-gh-refresh-btn" onClick={loadStats} title="Refresh repo stats">
                <i className="fas fa-rotate" aria-hidden="true" />
              </button>
              <button className="cpm-gh-edit-btn" onClick={() => setImporting(true)} title="Import open issues as tasks">
                <i className="fas fa-download" aria-hidden="true" /> Import issues
              </button>
              {isAdmin && (
                <button
                  className="cpm-gh-modal-clear"
                  onClick={() => handleRemoveRepo(selectedRepo)}
                  disabled={repoActionPending}
                  title="Remove this repo from the project"
                >
                  <i className="fas fa-trash" aria-hidden="true" /> Remove
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
            {activeTab === "issues"   && <IssuesList repoId={selectedRepoId} />}
            {activeTab === "pulls"    && <PullsList repoId={selectedRepoId} />}
            {activeTab === "branches" && <BranchesList repoId={selectedRepoId} defaultBranch={stats?.defaultBranch} />}
            {activeTab === "files"    && <FilesBrowser repoId={selectedRepoId} defaultBranch={stats?.defaultBranch} />}
            {activeTab === "commits"  && <CommitsList repoId={selectedRepoId} />}
          </div>
        </>
      )}

      {adding && (
        <AddRepoModal
          projectId={projectId}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); loadRepos(); }}
        />
      )}
      {importing && selectedRepo && (
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

function IssuesList({ repoId }) {
  const [stateFilter, setStateFilter] = useState("open");
  const { data, loading, error } = useEndpoint(
    `/api/github/repos/${repoId}/issues?state=${stateFilter}`,
    [repoId, stateFilter]
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
          repoId={repoId}
          number={openIssue}
          onClose={() => setOpenIssue(null)}
        />
      )}
    </>
  );
}

function PullsList({ repoId }) {
  const [stateFilter, setStateFilter] = useState("open");
  const { data, loading, error } = useEndpoint(
    `/api/github/repos/${repoId}/pulls?state=${stateFilter}`,
    [repoId, stateFilter]
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
          repoId={repoId}
          number={openPr}
          onClose={() => setOpenPr(null)}
        />
      )}
    </>
  );
}

function BranchesList({ repoId, defaultBranch }) {
  const { data, loading, error } = useEndpoint(
    `/api/github/repos/${repoId}/branches`,
    [repoId]
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

function FilesBrowser({ repoId, defaultBranch }) {
  const [path, setPath] = useState("");
  const { data, loading, error } = useEndpoint(
    `/api/github/repos/${repoId}/contents?path=${encodeURIComponent(path)}`,
    [repoId, path]
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
          repoId={repoId}
          path={openFile}
          onClose={() => setOpenFile(null)}
        />
      )}
    </>
  );
}

function CommitsList({ repoId }) {
  const { data, loading, error } = useEndpoint(
    `/api/github/repos/${repoId}/commits`,
    [repoId]
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
