// Embedded inside TaskModal. Shows GitHub links for the task and provides
// quick actions: link existing issue, create issue, create branch, link PR.

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { get, post, del, listProjectRepos } from "../../../api/clubPmClient";
import IssuePickerModal from "./IssuePickerModal";
import BranchCreateModal from "./BranchCreateModal";
import IssuePreviewModal from "./IssuePreviewModal";
import PrPreviewModal from "./PrPreviewModal";

function StateBadge({ link }) {
  // Visual badge per link state (open/closed/merged/draft)
  let icon = "fa-circle-dot";
  let color = "var(--cpm-gh-open)";
  if (link.kind === "PR") {
    if (link.state === "merged") { icon = "fa-code-merge"; color = "var(--cpm-gh-merged)"; }
    else if (link.state === "closed") { icon = "fa-circle-xmark"; color = "var(--cpm-gh-bad)"; }
    else if (link.state === "draft") { icon = "fa-pen-ruler"; color = "var(--clubpm-text-secondary)"; }
    else { icon = "fa-code-pull-request"; color = "var(--cpm-gh-ok)"; }
  } else if (link.kind === "ISSUE") {
    if (link.state === "closed") { icon = "fa-circle-check"; color = "var(--cpm-gh-closed)"; }
  } else if (link.kind === "BRANCH") {
    icon = "fa-code-branch"; color = "var(--cpm-gh-folder)";
  }
  return <i className={`fas ${icon}`} style={{ color }} aria-hidden="true" />;
}

export default function GitHubTaskSection({ task, project, onTaskUpdate }) {
  const projectId = project?.id ?? task?.projectId;
  const taskId = task?.id;

  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showBranch, setShowBranch] = useState(false);
  const [previewIssue, setPreviewIssue] = useState(null);
  const [previewPr, setPreviewPr] = useState(null);

  // Multi-repo (Workstream B): the project may have more than one linked
  // repo. Fetch the set so we can silently target the sole repo, or offer a
  // compact selector when there's more than one. This is the repo used for
  // the inline "Create issue" action; IssuePickerModal / BranchCreateModal
  // pick their own target repo independently (they fetch the same list).
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [selectedRepoId, setSelectedRepoId] = useState(null);

  useEffect(() => {
    if (!projectId) { setRepos([]); setReposLoading(false); return; }
    let cancelled = false;
    setReposLoading(true);
    listProjectRepos(projectId)
      .then(d => {
        if (cancelled) return;
        const list = d?.repos ?? [];
        setRepos(list);
        setSelectedRepoId(prev => (prev && list.some(r => r.id === prev)) ? prev : (list[0]?.id ?? null));
      })
      .catch(() => { if (!cancelled) setRepos([]); })
      .finally(() => { if (!cancelled) setReposLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const repoLinked = repos.length > 0;

  const refresh = useCallback(() => {
    if (!taskId || !repoLinked) { setLinks([]); return; }
    setLoading(true);
    get(`/api/github/tasks/${taskId}`)
      .then(d => setLinks(d?.links ?? []))
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, [taskId, repoLinked]);

  useEffect(refresh, [refresh]);

  async function unlink(linkId) {
    if (!window.confirm("Remove this GitHub link?")) return;
    try {
      await del(`/api/github/links/${linkId}`);
      toast.success("Unlinked");
      refresh();
    } catch (err) {
      toast.error(err?.message ?? "Failed to unlink");
    }
  }

  async function createIssue() {
    if (!selectedRepoId) { toast.error("Select a repository first"); return; }
    if (!window.confirm("Create a new GitHub issue from this task?")) return;
    try {
      const r = await post(`/api/github/tasks/${taskId}/issue`, { repoId: selectedRepoId });
      toast.success(`Issue #${r.number} created`);
      refresh();
    } catch (err) {
      toast.error(err?.message ?? "Failed to create issue");
    }
  }

  async function pushToIssue() {
    try {
      await post(`/api/github/tasks/${taskId}/sync`, {});
      toast.success("Pushed to GitHub");
      refresh();
    } catch (err) {
      toast.error(err?.message ?? "Sync failed");
    }
  }

  if (reposLoading && repos.length === 0) {
    return (
      <div className="cpm-gh-task-section">
        <div className="cpm-gh-task-header">
          <i className="fab fa-github" aria-hidden="true" />
          <span>GitHub</span>
        </div>
        <p className="cpm-gh-hint" style={{ marginTop: 8 }}>Loading repositories…</p>
      </div>
    );
  }

  if (!repoLinked) {
    return (
      <div className="cpm-gh-task-section">
        <div className="cpm-gh-task-header">
          <i className="fab fa-github" aria-hidden="true" />
          <span>GitHub</span>
        </div>
        <p className="cpm-gh-hint" style={{ marginTop: 8 }}>
          Link a GitHub repository in the project's GitHub tab to enable issue & branch linking.
        </p>
      </div>
    );
  }

  const issueLinks  = links.filter(l => l.kind === "ISSUE");
  const prLinks     = links.filter(l => l.kind === "PR");
  const branchLinks = links.filter(l => l.kind === "BRANCH");

  return (
    <div className="cpm-gh-task-section">
      <div className="cpm-gh-task-header">
        <i className="fab fa-github" aria-hidden="true" />
        <span>GitHub</span>
        {loading && <span className="cpm-gh-task-loading">syncing…</span>}
        <div style={{ flex: 1 }} />
        {repos.length > 1 && (
          <select
            className="cpm-gh-input"
            style={{ width: "auto", padding: "3px 8px", fontSize: 11, marginRight: 6, textTransform: "none" }}
            value={selectedRepoId ?? ""}
            onChange={e => setSelectedRepoId(e.target.value)}
            title="Target repository for new GitHub actions"
            aria-label="Target repository"
          >
            {repos.map(r => (
              <option key={r.id} value={r.id}>{r.slug}</option>
            ))}
          </select>
        )}
        <button className="cpm-gh-task-refresh" onClick={refresh} title="Refresh">
          <i className="fas fa-rotate" aria-hidden="true" />
        </button>
      </div>

      {links.length === 0 && !loading && (
        <p className="cpm-gh-empty" style={{ textAlign: "left", padding: "8px 0" }}>
          No GitHub links yet.
        </p>
      )}

      {issueLinks.length > 0 && (
        <div className="cpm-gh-task-group">
          <div className="cpm-gh-task-group-label">Issues</div>
          {issueLinks.map(l => (
            <div key={l.id} className="cpm-gh-task-chip">
              <StateBadge link={l} />
              <button
                className="cpm-gh-task-chip-title"
                onClick={() => setPreviewIssue(l.refNumber)}
                title="Open preview"
              >
                #{l.refNumber} {l.title ?? ""}
              </button>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="cpm-gh-task-chip-ext"
                title="Open on GitHub"
              >
                <i className="fas fa-external-link-alt" aria-hidden="true" />
              </a>
              <button
                className="cpm-gh-task-chip-x"
                onClick={() => unlink(l.id)}
                title="Unlink"
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {prLinks.length > 0 && (
        <div className="cpm-gh-task-group">
          <div className="cpm-gh-task-group-label">Pull requests</div>
          {prLinks.map(l => (
            <div key={l.id} className="cpm-gh-task-chip">
              <StateBadge link={l} />
              <button
                className="cpm-gh-task-chip-title"
                onClick={() => setPreviewPr(l.refNumber)}
                title="Open preview"
              >
                #{l.refNumber} {l.title ?? ""}
              </button>
              {l.reviewState && l.reviewState !== "NONE" && (
                <span className={`cpm-gh-task-pr-pill cpm-gh-review-${l.reviewState.toLowerCase()}`}>
                  {l.reviewState.replace("_", " ").toLowerCase()}
                </span>
              )}
              {l.checksStatus && l.checksStatus !== "none" && (
                <span className={`cpm-gh-task-pr-pill cpm-gh-ci-${l.checksStatus}`}>
                  ci: {l.checksStatus}
                </span>
              )}
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="cpm-gh-task-chip-ext"
              >
                <i className="fas fa-external-link-alt" aria-hidden="true" />
              </a>
              <button className="cpm-gh-task-chip-x" onClick={() => unlink(l.id)}>
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {branchLinks.length > 0 && (
        <div className="cpm-gh-task-group">
          <div className="cpm-gh-task-group-label">Branches</div>
          {branchLinks.map(l => (
            <div key={l.id} className="cpm-gh-task-chip">
              <StateBadge link={l} />
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="cpm-gh-task-chip-title cpm-gh-task-chip-branch"
              >
                {l.refPath}
              </a>
              <button className="cpm-gh-task-chip-x" onClick={() => unlink(l.id)}>
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="cpm-gh-task-actions">
        <button className="cpm-gh-task-action" onClick={() => setShowPicker(true)}>
          <i className="fas fa-link" aria-hidden="true" /> Link issue
        </button>
        <button className="cpm-gh-task-action" onClick={createIssue}>
          <i className="fas fa-plus" aria-hidden="true" /> Create issue
        </button>
        <button className="cpm-gh-task-action" onClick={() => setShowBranch(true)}>
          <i className="fas fa-code-branch" aria-hidden="true" /> Create branch
        </button>
        {issueLinks.length > 0 && (
          <button className="cpm-gh-task-action" onClick={pushToIssue} title="Push task title/body/state to linked issue">
            <i className="fas fa-arrow-up-from-bracket" aria-hidden="true" /> Push to GitHub
          </button>
        )}
      </div>

      {showPicker && (
        <IssuePickerModal
          projectId={projectId}
          taskId={taskId}
          onClose={() => setShowPicker(false)}
          onLinked={refresh}
        />
      )}
      {showBranch && (
        <BranchCreateModal
          projectId={projectId}
          taskId={taskId}
          onClose={() => setShowBranch(false)}
          onCreated={refresh}
        />
      )}
      {previewIssue != null && (
        <IssuePreviewModal
          projectId={projectId}
          number={previewIssue}
          onClose={() => setPreviewIssue(null)}
        />
      )}
      {previewPr != null && (
        <PrPreviewModal
          projectId={projectId}
          number={previewPr}
          onClose={() => setPreviewPr(null)}
        />
      )}
    </div>
  );
}
