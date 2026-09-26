import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useCompactLayout } from "../../../clubpm/layout/compactLayout";
import { searchVault, listVaultSavedViews, createVaultSavedView, deleteVaultSavedView } from "../../../api/clubPmClient";
import { formatRelativeTime } from "../../../utils/driveUtils";
import { CR_STATUS_LABEL } from "./vaultUtils";

// Server-side Vault search (Phase 8): item descriptions, file names, part
// numbers, check-in notes, change requests and GitHub commit messages, scoped
// by the server to projects the member can open. Filters and saved views are
// per member. Results in this project open in place; results elsewhere
// navigate to their deep link.

const KINDS = [
  { id: "ITEM", label: "Items" },
  { id: "VERSION", label: "Versions" },
  { id: "CR", label: "Change requests" },
  { id: "COMMIT", label: "Commits" },
];
const KIND_LABEL = { ITEM: "Item", VERSION: "Version", CR: "Change request", COMMIT: "Commit" };
const SINCE = [
  { id: "", label: "Any time" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
];

const EMPTY = { q: "", kinds: [], released: "", checkedOut: false, crStatus: "", fileExts: "", mine: false, watching: false, sinceDays: "", sort: "relevance", allProjects: false };

/** UI state → API params (and the shape a saved view stores). */
function toQuery(f) {
  return {
    q: f.q.trim(),
    kinds: f.kinds,
    released: f.released || undefined,
    checkedOut: f.checkedOut ? "true" : undefined,
    crStatus: f.crStatus || undefined,
    fileExts: f.fileExts.split(/[\s,]+/).map((e) => e.replace(/^\./, "")).filter(Boolean),
    authorId: f.mine ? "me" : undefined,
    watching: f.watching ? "true" : undefined,
    since: f.sinceDays ? new Date(Date.now() - Number(f.sinceDays) * 86400000).toISOString().slice(0, 10) : undefined,
    sort: f.sort,
  };
}

/** A saved view's stored query → UI state. A relative "since" is stored as an absolute date. */
function fromQuery(query, allProjects) {
  const since = query.since ? Math.round((Date.now() - new Date(query.since).getTime()) / 86400000) : null;
  const sinceDays = since == null ? "" : since <= 8 ? "7" : since <= 31 ? "30" : "90";
  return {
    ...EMPTY,
    q: query.q || "",
    kinds: query.kinds || [],
    released: query.released === true ? "true" : query.released === false ? "false" : "",
    checkedOut: query.checkedOut === true,
    crStatus: query.crStatus || "",
    fileExts: (query.fileExts || []).join(", "),
    mine: query.authorId === "me",
    watching: query.watching === true,
    sinceDays,
    sort: query.sort === "recent" ? "recent" : "relevance",
    allProjects,
  };
}

function activeFilterCount(f) {
  return f.kinds.length + (f.released ? 1 : 0) + (f.checkedOut ? 1 : 0) + (f.crStatus ? 1 : 0) + (f.fileExts.trim() ? 1 : 0) + (f.mine ? 1 : 0) + (f.watching ? 1 : 0) + (f.sinceDays ? 1 : 0);
}

export default function VaultSearchPanel({ project, onOpenItem, onOpenCr }) {
  const compact = useCompactLayout();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(EMPTY);
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(!compact);
  const [views, setViews] = useState([]);
  const [viewId, setViewId] = useState("");
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const requestSeq = useRef(0);
  const savingRef = useRef(false);

  const query = useMemo(() => toQuery(filters), [filters]);
  const hasCriteria = !!query.q || activeFilterCount(filters) > 0;

  const run = useCallback(async (offset) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await searchVault({ ...query, projectId: filters.allProjects ? undefined : project.id, limit: 25, offset });
      if (seq !== requestSeq.current) return;
      setResults((prev) => (offset ? [...prev, ...data.results] : data.results));
      setHasMore(!!data.hasMore);
    } catch (err) {
      if (seq === requestSeq.current) setError(err.message || "Search failed");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [query, filters.allProjects, project.id]);

  // Debounced search as the query or filters change.
  useEffect(() => {
    if (!hasCriteria) { requestSeq.current++; setResults([]); setHasMore(false); setLoading(false); return undefined; }
    const timer = setTimeout(() => run(0), 250);
    return () => clearTimeout(timer);
  }, [run, hasCriteria]);

  const loadViews = useCallback(() => {
    listVaultSavedViews(project.id).then((data) => setViews(data.views || [])).catch(() => setViews([]));
  }, [project.id]);
  useEffect(() => { loadViews(); }, [loadViews]);

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setViewId(""); };
  const toggleKind = (id) => set({ kinds: filters.kinds.includes(id) ? filters.kinds.filter((k) => k !== id) : [...filters.kinds, id] });

  function applyView(id) {
    setViewId(id);
    const view = views.find((v) => v.id === id);
    if (view) setFilters(fromQuery(view.query || {}, view.projectId === null));
  }

  async function saveView(e) {
    e.preventDefault();
    const name = viewName.trim();
    if (!name || savingRef.current) return;
    savingRef.current = true;
    try {
      const view = await createVaultSavedView({ name, projectId: filters.allProjects ? null : project.id, query });
      toast.success("View saved");
      setNaming(false);
      setViewName("");
      setViews((prev) => [...prev, view].sort((a, b) => a.name.localeCompare(b.name)));
      setViewId(view.id);
    } catch (err) {
      toast.error(err.message || "Could not save view");
    } finally {
      savingRef.current = false;
    }
  }

  async function removeView() {
    if (!viewId || !window.confirm("Delete this saved view?")) return;
    try {
      await deleteVaultSavedView(viewId);
      setViews((prev) => prev.filter((v) => v.id !== viewId));
      setViewId("");
    } catch (err) {
      toast.error(err.message || "Could not delete view");
    }
  }

  function open(result) {
    if (result.projectId !== project.id) { navigate(result.link); return; }
    if (result.kind === "CR" && result.crId) onOpenCr(result.crId);
    else if (result.itemId) onOpenItem(result.itemId, result.versionId);
    else if (result.githubUrl) window.open(result.githubUrl, "_blank", "noopener,noreferrer");
  }

  const filterCount = activeFilterCount(filters);

  return (
    <section className="cpm-vault-search" data-tour-id="vault.search" aria-label="Search the Vault">
      <div className="cpm-vault-search-bar">
        <input
          type="search"
          className="cpm-vault-search"
          placeholder="Search names, part numbers, files, notes, change requests, commits…"
          aria-label="Search the Vault"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <label className="cpm-vault-sort">
          Scope
          <select value={filters.allProjects ? "all" : "project"} onChange={(e) => set({ allProjects: e.target.value === "all" })}>
            <option value="project">This project</option>
            <option value="all">All my projects</option>
          </select>
        </label>
        <button type="button" className="cpm-vault-btn-ghost" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
          <i className="fas fa-sliders" aria-hidden="true" /> Filters{filterCount ? ` (${filterCount})` : ""}
        </button>
      </div>

      {filtersOpen && (
        <div className="cpm-vault-search-filters">
          <div className="cpm-vault-filters" role="group" aria-label="Result type">
            {KINDS.map((k) => (
              <button key={k.id} type="button" className={`cpm-vault-filter-chip${filters.kinds.includes(k.id) ? " active" : ""}`} aria-pressed={filters.kinds.includes(k.id)} onClick={() => toggleKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
          <div className="cpm-vault-search-fields">
            <label>Release
              <select value={filters.released} onChange={(e) => set({ released: e.target.value })}>
                <option value="">Any</option>
                <option value="true">Released</option>
                <option value="false">Unreleased</option>
              </select>
            </label>
            <label>Change request
              <select value={filters.crStatus} onChange={(e) => set({ crStatus: e.target.value })}>
                <option value="">Any status</option>
                {Object.entries(CR_STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label>File type
              <input type="text" value={filters.fileExts} placeholder="step, sldprt" onChange={(e) => set({ fileExts: e.target.value })} />
            </label>
            <label>Changed
              <select value={filters.sinceDays} onChange={(e) => set({ sinceDays: e.target.value })}>
                {SINCE.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label>Sort
              <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
                <option value="relevance">Best match</option>
                <option value="recent">Most recent</option>
              </select>
            </label>
            <label className="cpm-vault-search-check"><input type="checkbox" checked={filters.checkedOut} onChange={(e) => set({ checkedOut: e.target.checked })} /> Checked out</label>
            <label className="cpm-vault-search-check"><input type="checkbox" checked={filters.mine} onChange={(e) => set({ mine: e.target.checked })} /> By me</label>
            <label className="cpm-vault-search-check"><input type="checkbox" checked={filters.watching} onChange={(e) => set({ watching: e.target.checked })} /> Items I watch</label>
          </div>
        </div>
      )}

      <div className="cpm-vault-search-views">
        <label className="cpm-vault-sort">
          Saved views
          <select value={viewId} onChange={(e) => applyView(e.target.value)}>
            <option value="">{views.length ? "Choose a view" : "None yet"}</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}{v.projectId ? "" : " (all projects)"}</option>)}
          </select>
        </label>
        {viewId && <button type="button" className="cpm-vault-btn-ghost" onClick={removeView}>Delete view</button>}
        {!naming && hasCriteria && <button type="button" className="cpm-vault-btn-ghost" onClick={() => setNaming(true)}><i className="fas fa-bookmark" aria-hidden="true" /> Save view</button>}
        {!naming && (filterCount > 0 || filters.q) && <button type="button" className="cpm-vault-btn-ghost" onClick={() => { setFilters(EMPTY); setViewId(""); }}>Clear</button>}
        {naming && (
          <form className="cpm-vault-search-save" onSubmit={saveView}>
            <input type="text" autoFocus maxLength={80} placeholder="View name" aria-label="View name" value={viewName} onChange={(e) => setViewName(e.target.value)} />
            <button type="submit" className="clubpm-btn-primary" disabled={!viewName.trim()}>Save</button>
            <button type="button" className="cpm-vault-btn-ghost" onClick={() => { setNaming(false); setViewName(""); }}>Cancel</button>
          </form>
        )}
      </div>

      {error && <div className="cpm-vault-search-error" role="alert">{error}</div>}
      {!hasCriteria ? (
        <div className="cpm-vault-empty">Type to search, or pick filters or a saved view.</div>
      ) : results.length === 0 && !loading && !error ? (
        <div className="cpm-vault-empty">No matches.</div>
      ) : (
        <ul className="cpm-vault-search-results" aria-live="polite" aria-busy={loading}>
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="cpm-vault-search-result" onClick={() => open(r)}>
                <div className="cpm-vault-search-result-head">
                  <b className={`cpm-vault-search-kind cpm-vault-search-kind--${r.kind.toLowerCase()}`}>{KIND_LABEL[r.kind] || r.kind}</b>
                  <strong className="cpm-vault-search-title">{r.title}</strong>
                  {r.partNumber && <code className="cpm-vault-search-part">{r.partNumber}</code>}
                  {r.kind === "CR" && r.crStatus && <b className="cpm-vault-search-flag">{CR_STATUS_LABEL[r.crStatus] || r.crStatus}</b>}
                  {r.kind !== "CR" && r.kind !== "COMMIT" && <b className="cpm-vault-search-flag">{r.released ? "Released" : "Unreleased"}</b>}
                  {r.checkedOut && r.kind === "ITEM" && <b className="cpm-vault-search-flag">Checked out</b>}
                </div>
                {r.snippet && <div className="cpm-vault-search-snippet">{r.snippet}</div>}
                <div className="cpm-vault-search-meta">
                  {r.fileName && <code>{r.fileName}</code>}
                  {r.commitSha && <code>{r.commitSha.slice(0, 10)}</code>}
                  {r.authorName && <div>{r.authorName}</div>}
                  {r.occurredAt && <div>{formatRelativeTime(r.occurredAt)}</div>}
                  {r.projectId !== project.id && <div>Other project</div>}
                </div>
              </button>
              {r.githubUrl && <a className="cpm-vault-search-github" href={r.githubUrl} target="_blank" rel="noreferrer" aria-label={`Open commit ${r.commitSha?.slice(0, 10)} on GitHub`}><i className="fab fa-github" aria-hidden="true" /></a>}
            </li>
          ))}
        </ul>
      )}
      {loading && <div className="cpm-vault-loading"><div className="cpm-spinner" /></div>}
      {hasMore && !loading && <button type="button" className="cpm-vault-btn-ghost" onClick={() => run(results.length)}>Load more</button>}
    </section>
  );
}
