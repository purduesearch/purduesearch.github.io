import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { get, askVault } from "../../../api/clubPmClient";
import VaultItemCard from "./VaultItemCard";
import VaultUploadModal from "./VaultUploadModal";
import VaultItemModal from "./VaultItemModal";
import ChangeRequestList from "./ChangeRequestList";

// Sub-view pills. "Review Queue" only shows for admins.
const SUB_VIEWS = [
  { id: "vault",          label: "Vault" },
  { id: "changeRequests", label: "Change Requests", tourId: "vault.tab.crs" },
  { id: "reviewQueue",    label: "Review Queue", adminOnly: true },
];

const FILTERS = [
  { id: "all",        label: "All" },
  { id: "parts",       label: "Parts" },
  { id: "released",   label: "Released" },
  { id: "checkedOut", label: "Checked out" },
];

export default function VaultTab({ project, member, isAdmin }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [health, setHealth] = useState(null);
  const [items, setItems] = useState([]);
  const [subView, setSubView] = useState("vault");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
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
    } catch (err) {
      setLoadError(err.message ?? "Failed to load vault");
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  // Non-admins can never land on the admin-only Review Queue pill (e.g. if an
  // admin session demotes mid-visit).
  useEffect(() => {
    if (!isAdmin && subView === "reviewQueue") setSubView("vault");
  }, [isAdmin, subView]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(item => {
      if (term) {
        const haystack = `${item.name} ${item.partNumber ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      switch (filter) {
        case "parts":       return !!item.partNumber;
        case "released":    return !!item.currentRevision;
        case "checkedOut":  return !!item.checkedOutById;
        default:            return true;
      }
    });
  }, [items, search, filter]);

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

  if (health?.status === "no-link") {
    return (
      <div className="cpm-vault-setup-card">
        <i className="fas fa-folder-open" aria-hidden="true" />
        <p>
          This project has no linked Drive folder yet. Link one from the <strong>Files</strong> tab
          to start the Vault.
        </p>
      </div>
    );
  }

  if (health?.status === "not-folder" || health?.status === "not-shared") {
    return (
      <div className="cpm-vault-setup-card">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <p>
          {health.status === "not-folder"
            ? "The linked Drive URL isn't a folder link. Update it from the Files tab."
            : "The linked Drive folder isn't shared with the Constellation service account yet."}
        </p>
        {health.serviceAccountEmail && (
          <div className="cpm-vault-sa-row">
            <code className="cpm-vault-sa-email">{health.serviceAccountEmail}</code>
            <button
              type="button"
              className="cpm-vault-copy-btn"
              onClick={handleCopySaEmail}
              title="Copy to clipboard"
              aria-label="Copy service account email"
            >
              <i className="fas fa-copy" aria-hidden="true" />
            </button>
          </div>
        )}
        <p className="cpm-vault-setup-hint">Share the linked folder with this address as Editor, then retry.</p>
        <button type="button" className="clubpm-btn-primary" onClick={load}>
          <i className="fas fa-rotate-right" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="cpm-vault-tab">
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
                <VaultItemCard key={item.id} item={item} tourId={index === 0 ? "vault.item" : undefined} onClick={() => setSelectedItemId(item.id)} />
              ))}
            </div>
          )}
        </>
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
          onClose={() => setShowUploadModal(false)}
          onDone={() => { setShowUploadModal(false); load(); }}
        />
      )}

      {selectedItemId && (
        <VaultItemModal
          itemId={selectedItemId}
          project={project}
          member={member}
          isAdmin={isAdmin}
          onClose={() => setSelectedItemId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
