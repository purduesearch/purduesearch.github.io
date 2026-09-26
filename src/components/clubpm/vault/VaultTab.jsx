import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { get, askVault, getVaultRepository, getVaultRepositoryHealth, getVaultCommits, listProjectRepos, setVaultRepository, verifyVaultRepository, setVaultGithubWrites } from "../../../api/clubPmClient";
import VaultItemCard from "./VaultItemCard";
import VaultUploadModal from "./VaultUploadModal";
import VaultItemModal from "./VaultItemModal";
import ChangeRequestList from "./ChangeRequestList";
import ChangeRequestModal from "./ChangeRequestModal";
import VaultSearchPanel from "./VaultSearchPanel";

// Sub-view pills. "Review Queue" only shows for admins.
const SUB_VIEWS = [
  { id: "vault",          label: "Vault" },
  { id: "search",         label: "Search", tourId: "vault.tab.search" },
  { id: "changeRequests", label: "Change Requests", tourId: "vault.tab.crs" },
  { id: "reviewQueue",    label: "Review Queue", adminOnly: true },
];

const FILTERS = [
  { id: "all",        label: "All" },
  { id: "parts",       label: "Parts" },
  { id: "released",   label: "Released" },
  { id: "unreleased", label: "Unreleased" },
  { id: "recent", label: "Changed recently" },
  { id: "review", label: "Review needed" },
  { id: "checkedOut", label: "Checked out" },
];

// deepLink: { itemId, versionId, crId } from ?vaultItem/vaultVersion/vaultCr —
// notification and search links land on the exact item, version or CR.
export default function VaultTab({ project, member, isAdmin, deepLink = null, onDeepLinkDone }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [health, setHealth] = useState(null);
  const [repository, setRepository] = useState(null);
  const [repoHealth, setRepoHealth] = useState(null);
  const [commits, setCommits] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkedRepos, setLinkedRepos] = useState([]);
  const [repoId, setRepoId] = useState("");
  const [branch, setBranch] = useState("vault");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [subView, setSubView] = useState("vault");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("activity");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(deepLink?.itemId ?? null);
  const [selectedVersionId, setSelectedVersionId] = useState(deepLink?.versionId ?? null);
  const [linkedCrId, setLinkedCrId] = useState(deepLink?.crId ?? null);
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState(null);
  const [askBusy, setAskBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await get(`/api/projects/${project.id}/vault`);
      setHealth(data.health);
      setItems(data.items || []);
      const binding = await getVaultRepository(project.id);
      setRepository(binding.repository);
      setRepoHealth(null);
      setCommits([]);
      if (binding.repository) {
        const [healthResult, commitResult] = await Promise.allSettled([getVaultRepositoryHealth(project.id), getVaultCommits(project.id)]);
        setRepoHealth(healthResult.status === "fulfilled" ? healthResult.value : { status: "UNAVAILABLE" });
        setCommits(commitResult.status === "fulfilled" ? commitResult.value.commits || [] : []);
      }
    } catch (err) {
      setLoadError(err.message ?? "Failed to load vault");
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!deepLink) return;
    if (deepLink.itemId) { setSelectedItemId(deepLink.itemId); setSelectedVersionId(deepLink.versionId ?? null); }
    if (deepLink.crId) setLinkedCrId(deepLink.crId);
  }, [deepLink]);
  const openItem = useCallback((itemId, versionId = null) => { setSelectedItemId(itemId); setSelectedVersionId(versionId); }, []);
  const closeItem = useCallback(() => { setSelectedItemId(null); setSelectedVersionId(null); onDeepLinkDone?.(); }, [onDeepLinkDone]);
  useEffect(() => {
    if (!settingsOpen || !isAdmin) return;
    listProjectRepos(project.id).then(data => setLinkedRepos(data.repos || [])).catch(err => toast.error(err.message));
  }, [settingsOpen, isAdmin, project.id]);
  useEffect(() => { if (repository) { setRepoId(repository.projectRepoId); setBranch(repository.branch); } }, [repository]);

  async function updateRepository(action) {
    if (settingsBusy) return;
    setSettingsBusy(true);
    try {
      if (action === "bind") await setVaultRepository(project.id, { projectRepoId: repoId, branch });
      if (action === "verify") await verifyVaultRepository(project.id);
      if (action === "toggle") await setVaultGithubWrites(project.id, !repository.writeEnabled);
      toast.success("Vault repository updated");
      await load();
    } catch (err) { toast.error(err.message || "Repository update failed"); }
    finally { setSettingsBusy(false); }
  }

  // Non-admins can never land on the admin-only Review Queue pill (e.g. if an
  // admin session demotes mid-visit).
  useEffect(() => {
    if (!isAdmin && subView === "reviewQueue") setSubView("vault");
  }, [isAdmin, subView]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(item => {
      if (term) {
        const haystack = `${item.name} ${item.partNumber ?? ""} ${item.description ?? ""} ${item.latestVersion?.fileName ?? ""} ${item.latestVersion?.note ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      switch (filter) {
        case "parts":       return !!item.partNumber;
        case "released":    return !!item.currentRevision;
        case "unreleased": return !item.currentRevision;
        case "recent": return !!item.latestVersion?.createdAt && Date.now() - new Date(item.latestVersion.createdAt).getTime() < 30 * 86400000;
        case "review": return item.openCrCount > 0;
        case "checkedOut":  return !!item.checkedOutById;
        default:            return true;
      }
    }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "part" ? (a.partNumber || "~").localeCompare(b.partNumber || "~") : new Date(b.latestVersion?.createdAt || b.updatedAt) - new Date(a.latestVersion?.createdAt || a.updatedAt));
  }, [items, search, filter, sort]);

  async function handleAsk() {
    const question = askQuestion.trim();
    if (!question || askBusy) return;
    setAskBusy(true);
    setAskAnswer(null);
    try {
      const res = await askVault(project.id, question);
      setAskAnswer(res.answer || "No answer.");
    } catch (err) {
      toast.error(err.message || "Failed to ask the vault");
    } finally {
      setAskBusy(false);
    }
  }

  function handleCopySaEmail() {
    if (!health?.serviceAccountEmail) return;
    navigator.clipboard?.writeText(health.serviceAccountEmail)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Could not copy — copy it manually"));
  }

  if (loading) {
    return (
      <div className="cpm-vault-loading">
        <div className="cpm-spinner" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="cpm-vault-setup-card">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <p>{loadError}</p>
        <button type="button" className="clubpm-btn-primary" onClick={load}>
          <i className="fas fa-rotate-right" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  // Legacy Vault writes use a bot-owned CAD folder, separate from the project's
  // linked Drive source. GitHub-enabled projects bypass this legacy health gate.
  // These errors concern the connected bot account.
  if (!isAdmin && !repository?.writeEnabled && health?.status === "no-link") {
    return (
      <div className="cpm-vault-setup-card">
        <i className="fas fa-folder-open" aria-hidden="true" />
        <p>
          No Google Drive account is connected for the Vault yet. An admin needs to connect one
          before files can be checked in.
        </p>
      </div>
    );
  }

  if (!isAdmin && !repository?.writeEnabled && (health?.status === "unauthorized" || health?.status === "drive-error" ||
      health?.status === "not-folder" || health?.status === "not-shared")) {
    const isTransient = health.status === "drive-error";
    return (
      <div className="cpm-vault-setup-card">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <p>
          {health.status === "unauthorized"
            ? "Google rejected the Vault's Drive account — its access was revoked or expired."
            : isTransient
              ? "Google Drive couldn't be reached. This is usually temporary."
              : "The Vault's Drive folder isn't writable by the connected account."}
        </p>
        {health.detail && <p className="cpm-vault-setup-hint">{health.detail}</p>}
        {health.serviceAccountEmail && (
          <div className="cpm-vault-sa-row">
            <code className="cpm-vault-sa-email">{health.serviceAccountEmail}</code>
            <button
              type="button"
              className="cpm-vault-copy-btn"
              onClick={handleCopySaEmail}
              title="Copy to clipboard"
              aria-label="Copy connected Drive account email"
            >
              <i className="fas fa-copy" aria-hidden="true" />
            </button>
          </div>
        )}
        {!isTransient && (
          <p className="cpm-vault-setup-hint">
            An admin needs to reconnect Google Drive in ClubPM admin settings, then retry.
          </p>
        )}
        <button type="button" className="clubpm-btn-primary" onClick={load}>
          <i className="fas fa-rotate-right" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="cpm-vault-tab">
      <section className="cpm-vault-repository" data-tour-id="vault.repository" aria-label="Vault storage">
        <div><strong>{repository ? repository.slug : "Drive Vault"}</strong>{repository && <> / {repository.branch} · {repository.migrationState === "FROZEN" ? "Cutover paused" : repository.writeEnabled ? "GitHub check-ins enabled" : "Drive check-ins"}</>}</div>
        {repository?.repair && <p role="alert">{repository.repair}</p>}
        {repository && <><div>Repository health: {repoHealth?.status || repository.setupStatus} · Visibility: {repoHealth?.visibility || "unknown"} · Last sync: {repository.lastSyncedAt ? new Date(repository.lastSyncedAt).toLocaleString() : "Pending"}</div><div>Last known commit: {repository.lastHeadSha?.slice(0, 12) || "None"} · Open change requests: {items.reduce((sum, item) => sum + (item.openCrCount || 0), 0)}</div><a href={`https://github.com/${repository.slug}/tree/${encodeURIComponent(repository.branch)}`} target="_blank" rel="noreferrer">Open on GitHub</a></>}
        {isAdmin && <button type="button" className="cpm-vault-btn-ghost" onClick={() => setSettingsOpen(open => !open)} aria-expanded={settingsOpen}>Repository settings</button>}
        {settingsOpen && isAdmin && <div className="cpm-vault-repo-settings"><label>Linked repository <select value={repoId} onChange={e => setRepoId(e.target.value)} disabled={settingsBusy}><option value="">Choose a linked repository</option>{linkedRepos.map(r => <option key={r.id} value={r.id}>{r.slug}</option>)}</select></label><label>Branch <input value={branch} onChange={e => setBranch(e.target.value)} disabled={settingsBusy} /></label><button type="button" onClick={() => updateRepository("bind")} disabled={!repoId || settingsBusy}>Save binding</button>{repository && <><button type="button" onClick={() => updateRepository("verify")} disabled={settingsBusy || repository.writeEnabled}>Verify App and LFS</button>{!["FROZEN", "GITHUB_ACTIVE", "DRIVE_ROLLBACK"].includes(repository.migrationState) && <button type="button" onClick={() => updateRepository("toggle")} disabled={settingsBusy || (!repository.writeEnabled && repository.setupStatus !== "READY")}>{repository.writeEnabled ? "Pause GitHub check-ins" : "Enable GitHub check-ins"}</button>}</>}</div>}
        {commits.length > 0 && <details><summary>Recent commits</summary><ol>{commits.map(c => <li key={c.sha}><a href={c.url} target="_blank" rel="noreferrer">{c.message}</a> · {c.author} · {c.at ? new Date(c.at).toLocaleString() : ""}</li>)}</ol></details>}
      </section>
      <div className="cpm-vault-subnav" role="tablist" aria-label="Vault sub-view">
        {SUB_VIEWS.filter(v => !v.adminOnly || isAdmin).map(v => (
          <button
            key={v.id}
            type="button"
            role="tab"
            data-tour-id={v.tourId}
            aria-selected={subView === v.id}
            className={`cpm-vault-pill${subView === v.id ? " active" : ""}`}
            onClick={() => setSubView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {subView === "vault" && (
        <>
          <div className="cpm-vault-toolbar">
            <input
              type="text"
              className="cpm-vault-search"
              placeholder="Search by name or part number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="cpm-vault-filters">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`cpm-vault-filter-chip${filter === f.id ? " active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="cpm-vault-sort">Sort <select value={sort} onChange={e => setSort(e.target.value)}><option value="activity">Recent activity</option><option value="name">Name</option><option value="part">Part number</option></select></label>
            <button
              type="button"
              className="cpm-vault-btn-ghost"
              aria-expanded={askOpen}
              onClick={() => setAskOpen((open) => !open)}
            >
              <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Ask the vault
            </button>
            <button
              type="button"
              className="clubpm-btn-primary"
              data-tour-id="vault.upload"
              onClick={() => setShowUploadModal(true)}
            >
              <i className="fas fa-file-arrow-up" aria-hidden="true" /> Check in file
            </button>
          </div>

          {askOpen && (
            <div className="cpm-vault-ask-panel">
              <textarea
                rows={2}
                placeholder="e.g. Which parts are still unreleased? Who has the bracket checked out?"
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                disabled={askBusy}
              />
              <div className="cpm-vault-ask-actions">
                <button
                  type="button"
                  className="clubpm-btn-primary"
                  onClick={handleAsk}
                  disabled={askBusy || !askQuestion.trim()}
                >
                  {askBusy ? "Thinking…" : "Ask"}
                </button>
              </div>
              {askBusy && <div className="cpm-vault-loading"><div className="cpm-spinner" /></div>}
              {askAnswer && !askBusy && <div className="cpm-vault-ask-answer">{askAnswer}</div>}
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div className="cpm-vault-empty">
              {items.length === 0 ? "No items in the vault yet." : "No items match your search."}
            </div>
          ) : (
            <div className="cpm-vault-grid" data-tour-id="vault.tree">
              {filteredItems.map((item, index) => (
                <VaultItemCard key={item.id} item={item} tourId={index === 0 ? "vault.item" : undefined} onClick={() => openItem(item.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {subView === "search" && (
        <VaultSearchPanel project={project} onOpenItem={openItem} onOpenCr={setLinkedCrId} />
      )}

      {subView === "changeRequests" && (
        <ChangeRequestList project={project} member={member} isAdmin={isAdmin} mode="all" />
      )}

      {subView === "reviewQueue" && isAdmin && (
        <ChangeRequestList project={project} member={member} isAdmin={isAdmin} mode="review" />
      )}

      {showUploadModal && (
        <VaultUploadModal
          project={project}
          repository={repository}
          onClose={() => setShowUploadModal(false)}
          onDone={() => { setShowUploadModal(false); load(); }}
        />
      )}

      {selectedItemId && (
        <VaultItemModal
          key={`${selectedItemId}:${selectedVersionId ?? ""}`}
          itemId={selectedItemId}
          initialVersionId={selectedVersionId}
          project={project}
          repository={repository}
          member={member}
          isAdmin={isAdmin}
          onClose={closeItem}
          onChanged={load}
        />
      )}

      {linkedCrId && (
        <ChangeRequestModal
          project={project}
          member={member}
          isAdmin={isAdmin}
          crId={linkedCrId}
          onClose={() => { setLinkedCrId(null); onDeepLinkDone?.(); }}
          onChanged={load}
        />
      )}
    </div>
  );
}
