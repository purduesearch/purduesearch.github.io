import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { get, previewBulkMove } from "../../api/clubPmClient";

const PRIORITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUS_LEVELS = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
];
const DUE_SHIFTS = [-7, -1, 1, 7];

// One toolbar button that opens a panel above the bar. `children` receives a
// `close` callback so a panel can dismiss itself after applying.
function BarMenu({ icon, label, disabled, title, width = 240, align = "left", children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  return (
    <div
      ref={ref}
      className="cpm-bulk-bar-menu"
      onKeyDown={(e) => {
        // Escape closes this panel only; the page-level Escape handler would
        // otherwise also clear the whole selection.
        if (e.key === "Escape" && open) { e.nativeEvent.stopPropagation(); setOpen(false); }
      }}
    >
      <button
        type="button"
        className={`cpm-bulk-bar-btn${open ? " cpm-bulk-bar-btn--open" : ""}`}
        disabled={disabled}
        title={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <i className={`fas ${icon}`} aria-hidden="true" /> {label}
        <i className="fas fa-chevron-up cpm-bulk-bar-caret" aria-hidden="true" />
      </button>
      {open && (
        <div
          className={`cpm-bulk-bar-popover${align === "right" ? " cpm-bulk-bar-popover--right" : ""}`}
          style={{ width }}
          role="dialog"
          aria-label={label}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function PanelHeading({ children }) {
  return <div className="cpm-bulk-bar-popover-heading">{children}</div>;
}

function Empty({ children }) {
  return <p className="cpm-bulk-bar-popover-empty">{children}</p>;
}

// Searchable single-choice list. Each item: { id, label, hint?, color?, avatarUrl? }.
function PickList({ items, onPick, placeholder = "Search…", emptyText = "Nothing to show", autoFocus = true }) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((i) => i.label?.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      {items.length > 6 && (
        <input
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="cpm-bulk-bar-popover-search"
        />
      )}
      <div className="cpm-bulk-bar-popover-list">
        {filtered.length === 0 ? <Empty>{emptyText}</Empty> : filtered.map((item) => (
          <button key={item.id ?? "none"} type="button" className="cpm-bulk-bar-popover-item" onClick={() => onPick(item)}>
            <ItemLead item={item} />
            <span className="cpm-bulk-bar-popover-label">{item.label}</span>
            {item.hint && <span className="cpm-bulk-bar-popover-hint">{item.hint}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

function ItemLead({ item }) {
  if (item.avatarUrl) return <img src={item.avatarUrl} alt="" className="cpm-bulk-bar-popover-avatar" />;
  if (item.initial) return <span className="cpm-bulk-bar-popover-item-fallback" aria-hidden="true">{item.initial}</span>;
  if (item.color) return <span className="cpm-bulk-bar-swatch" style={{ background: item.color }} aria-hidden="true" />;
  if (item.icon) return <i className={`fas ${item.icon} cpm-bulk-bar-popover-icon`} aria-hidden="true" />;
  return null;
}

// Multi-select checklist with Add / Remove / Replace modes. `count` on each
// item is how many selected tasks already have it, shown as "n/total".
function SetEditor({ items, total, noun, onApply, allowReplace = true, emptyText }) {
  const [mode, setMode] = useState("add");
  const [picked, setPicked] = useState([]);
  const [search, setSearch] = useState("");
  const filtered = items.filter((i) => i.label?.toLowerCase().includes(search.toLowerCase()));
  const modes = allowReplace ? ["add", "remove", "replace"] : ["add", "remove"];

  const toggle = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const canApply = picked.length > 0 || mode === "replace";
  const applyLabel = mode === "add" ? `Add to ${total}`
    : mode === "remove" ? `Remove from ${total}`
    : picked.length === 0 ? `Clear all ${noun}s on ${total}` : `Set on ${total}`;

  return (
    <>
      <div className="cpm-bulk-bar-segment" role="radiogroup" aria-label="Mode">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={`cpm-bulk-bar-segment-btn${mode === m ? " cpm-bulk-bar-segment-btn--active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m === "add" ? "Add" : m === "remove" ? "Remove" : "Replace"}
          </button>
        ))}
      </div>
      {items.length > 6 && (
        <input
          autoFocus
          placeholder={`Search ${noun}s…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="cpm-bulk-bar-popover-search"
        />
      )}
      <div className="cpm-bulk-bar-popover-list">
        {filtered.length === 0 ? <Empty>{emptyText ?? `No ${noun}s found`}</Empty> : filtered.map((item) => {
          const checked = picked.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={checked}
              className={`cpm-bulk-bar-popover-item${checked ? " cpm-bulk-bar-popover-item--checked" : ""}`}
              onClick={() => toggle(item.id)}
            >
              <ItemLead item={item} />
              <span className="cpm-bulk-bar-popover-label">{item.label}</span>
              {item.count > 0 && <span className="cpm-bulk-bar-popover-hint" title={`${item.count} of ${total} selected tasks`}>{item.count}/{total}</span>}
              {checked && <i className="fas fa-check cpm-bulk-bar-popover-check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="cpm-bulk-bar-popover-apply"
        disabled={!canApply}
        onClick={() => { onApply(mode, picked); setPicked([]); }}
      >
        {applyLabel}
      </button>
    </>
  );
}

function countBy(tasks, pick) {
  const counts = new Map();
  for (const t of tasks) for (const id of pick(t)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function DuePanel({ onPatch, close, total, withDue }) {
  const [date, setDate] = useState("");
  return (
    <>
      <PanelHeading>Set due date</PanelHeading>
      <div className="cpm-bulk-bar-inline">
        <input type="date" className="cpm-bulk-bar-date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" />
        <button
          type="button"
          className="cpm-bulk-bar-popover-apply"
          disabled={!date}
          onClick={() => { onPatch({ dueDate: new Date(`${date}T12:00:00`).toISOString() }); close(); }}
        >
          Set on {total}
        </button>
      </div>
      <PanelHeading>Shift existing due dates</PanelHeading>
      <div className="cpm-bulk-bar-chips">
        {DUE_SHIFTS.map((d) => (
          <button key={d} type="button" className="cpm-bulk-bar-chip" disabled={withDue === 0} onClick={() => onPatch({ dueShiftDays: d })}>
            {d > 0 ? `+${d}` : d} {Math.abs(d) === 1 ? "day" : "days"}
          </button>
        ))}
      </div>
      <p className="cpm-bulk-bar-popover-note">{withDue} of {total} have a due date; the rest are left alone.</p>
      <button type="button" className="cpm-bulk-bar-popover-link" disabled={withDue === 0} onClick={() => { onPatch({ dueDate: null }); close(); }}>
        <i className="fas fa-calendar-xmark" aria-hidden="true" /> Clear due dates
      </button>
    </>
  );
}

function EstimatePanel({ onPatch, close, total }) {
  const [points, setPoints] = useState("");
  const [hours, setHours] = useState("");
  const apply = () => {
    const patch = {};
    if (points !== "") patch.storyPoints = Math.max(0, Math.round(Number(points)));
    if (hours !== "") patch.estimatedHours = Math.max(0, Number(hours));
    if (Object.keys(patch).length) { onPatch(patch); close(); }
  };
  return (
    <>
      <PanelHeading>Estimate</PanelHeading>
      <label className="cpm-bulk-bar-field">
        <span>Story points</span>
        <input type="number" min="0" step="1" value={points} onChange={(e) => setPoints(e.target.value)} className="cpm-bulk-bar-popover-search" />
      </label>
      <label className="cpm-bulk-bar-field">
        <span>Estimated hours</span>
        <input type="number" min="0" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} className="cpm-bulk-bar-popover-search" />
      </label>
      <button type="button" className="cpm-bulk-bar-popover-apply" disabled={points === "" && hours === ""} onClick={apply}>
        Set on {total}
      </button>
      <div className="cpm-bulk-bar-chips">
        <button type="button" className="cpm-bulk-bar-chip" onClick={() => { onPatch({ storyPoints: null }); close(); }}>Clear points</button>
        <button type="button" className="cpm-bulk-bar-chip" onClick={() => { onPatch({ estimatedHours: null }); close(); }}>Clear hours</button>
      </div>
    </>
  );
}

// "More" panel: a short list of actions, some of which open a sub-view.
function MorePanel({ close, total, blockers, blockerCounts, blockersDisabledReason, onPatch, onDuplicate, onCopyLinks, onArchive }) {
  const [view, setView] = useState(null);
  if (view === "estimate") return <EstimatePanel onPatch={onPatch} close={close} total={total} />;
  if (view === "blockers") {
    return (
      <>
        <PanelHeading>Category blockers</PanelHeading>
        <SetEditor
          items={blockers.map((b) => ({ id: b.id, label: b.label, color: b.color || "#e17055", count: blockerCounts.get(b.id) ?? 0 }))}
          total={total}
          noun="blocker"
          allowReplace={false}
          emptyText="No open blockers in this project"
          onApply={(mode, ids) => { onPatch(mode === "add" ? { addBlockerIds: ids } : { removeBlockerIds: ids }); close(); }}
        />
      </>
    );
  }
  const items = [
    { id: "estimate", icon: "fa-stopwatch", label: "Estimate (points, hours)…", run: () => setView("estimate") },
    { id: "blockers", icon: "fa-hand", label: "Category blockers…", run: () => setView("blockers"), disabledReason: blockersDisabledReason },
    { id: "duplicate", icon: "fa-clone", label: `Duplicate ${total}`, run: () => { onDuplicate(); close(); } },
    { id: "links", icon: "fa-link", label: "Copy links", run: () => { onCopyLinks(); close(); } },
    { id: "archive", icon: "fa-box-archive", label: `Archive ${total}`, run: () => { onArchive(); close(); } },
  ];
  return (
    <div className="cpm-bulk-bar-popover-list">
      {items.map((item) => (
        <button key={item.id} type="button" className="cpm-bulk-bar-popover-item" onClick={item.run} disabled={!!item.disabledReason} title={item.disabledReason}>
          <ItemLead item={item} />
          <span className="cpm-bulk-bar-popover-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

const STATUS_LABEL = Object.fromEntries(STATUS_LEVELS.map((s) => [s.value, s.label]));

function ReviewChips({ title, items, project }) {
  if (items.length === 0) return null;
  const creating = items.filter((i) => !i.exists).length;
  return (
    <div className="cpm-bulk-move-section">
      <PanelHeading>{title}</PanelHeading>
      <div className="cpm-bulk-bar-chips">
        {items.map((i) => (
          <span key={i.name} className="cpm-bulk-move-chip">
            {i.color && <span className="cpm-bulk-bar-swatch" style={{ background: i.color }} aria-hidden="true" />}
            {i.name}
            {!i.exists && <span className="cpm-bulk-move-new">new</span>}
          </span>
        ))}
      </div>
      <p className="cpm-bulk-bar-popover-note">
        {creating === 0 ? `All already exist in ${project}; the tasks keep them.` : `${creating} will be created in ${project}; the rest are matched by name.`}
      </p>
    </div>
  );
}

// Second step of "Move to another project": fetches a dry run and shows what
// will be matched, created or changed. Dependency-linked tasks are offered as
// "move these too"; ticking one re-runs the preview with it included.
function MoveReview({ selectedIds, target, onBack, onConfirm }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [included, setIncluded] = useState(() => new Set());
  const [offered, setOffered] = useState(() => new Map());
  const [addMembers, setAddMembers] = useState(true);

  const ids = useMemo(() => [...selectedIds, ...included], [selectedIds, included]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    previewBulkMove(ids, target.id)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        // Keep every task ever offered so ticking one does not make it vanish
        // (once included it is no longer a neighbor of the moved set).
        setOffered((prev) => {
          const next = new Map(prev);
          for (const t of p.linkedTasks ?? []) if (!next.has(t.id)) next.set(t.id, t);
          return next;
        });
      })
      .catch((err) => { if (!cancelled) setError(err?.message ?? "Could not preview this move"); });
    return () => { cancelled = true; };
  }, [ids, target.id]);

  const toggle = (id) => setIncluded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const linked = [...offered.values()];
  const missing = preview?.missingAssignees ?? [];

  return (
    <>
      <div className="cpm-bulk-move-head">
        <button type="button" className="cpm-bulk-bar-text-btn" onClick={onBack} aria-label="Back to project list">
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>
        <span>Move to <strong>{target.name}</strong></span>
      </div>

      {error && <p className="cpm-bulk-move-error" role="alert">{error}</p>}
      {!preview && !error && <p className="cpm-bulk-bar-popover-empty"><i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> Checking…</p>}

      {preview && (
        <div className="cpm-bulk-move-body">
          <ReviewChips title="Tags" items={preview.tags} project={target.name} />
          <ReviewChips title="Blockers" items={preview.blockers} project={target.name} />
          <ReviewChips title="Milestones" items={preview.milestones} project={target.name} />

          {missing.length > 0 && (
            <div className="cpm-bulk-move-section cpm-bulk-move-section--warn">
              <PanelHeading>
                <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {missing.length} assignee{missing.length === 1 ? " is" : "s are"} not in {target.name}
              </PanelHeading>
              <p className="cpm-bulk-bar-popover-note">{missing.map((m) => m.displayName).join(", ")}</p>
              <label className="cpm-bulk-move-option">
                <input type="radio" name="cpm-move-members" checked={addMembers} onChange={() => setAddMembers(true)} />
                Add them to {target.name} and keep them assigned
              </label>
              <label className="cpm-bulk-move-option">
                <input type="radio" name="cpm-move-members" checked={!addMembers} onChange={() => setAddMembers(false)} />
                Unassign them from the moved tasks
              </label>
            </div>
          )}

          {linked.length > 0 && (
            <div className="cpm-bulk-move-section">
              <PanelHeading>Linked by dependencies</PanelHeading>
              <p className="cpm-bulk-bar-popover-note">Dependencies are kept either way. Move these too?</p>
              <div className="cpm-bulk-bar-popover-list">
                {linked.map((t) => (
                  <label key={t.id} className="cpm-bulk-move-option cpm-bulk-move-linked">
                    <input type="checkbox" checked={included.has(t.id)} onChange={() => toggle(t.id)} />
                    <span className="cpm-bulk-bar-popover-label" title={t.title}>{t.title}</span>
                    <span className="cpm-bulk-bar-popover-hint">
                      {t.relation === "blocks" ? "blocks" : "waits on"} · {STATUS_LABEL[t.status] ?? t.status}{t.sameProject ? "" : " · other project"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <div className="cpm-bulk-move-section cpm-bulk-move-section--warn">
              <PanelHeading>{preview.skipped.length} will not move</PanelHeading>
              <p className="cpm-bulk-bar-popover-note">{[...new Set(preview.skipped.map((s) => s.reason))].join("; ")}</p>
            </div>
          )}

          <p className="cpm-bulk-bar-popover-note">
            <i className="fas fa-bell-slash" aria-hidden="true" /> No one is notified.
          </p>
        </div>
      )}

      <button
        type="button"
        className="cpm-bulk-bar-popover-apply"
        disabled={!preview || preview.taskCount === 0}
        onClick={() => onConfirm({ extraIds: [...included], addMissingMembers: addMembers })}
      >
        {preview ? `Move ${preview.taskCount} task${preview.taskCount === 1 ? "" : "s"}` : "Move"}
      </button>
    </>
  );
}

function MovePanel({ close, total, selectedIds, currentProjectId, projects, parentCandidates, onPatch, onMove, anySubtask }) {
  const [view, setView] = useState(null);
  const [target, setTarget] = useState(null);
  const nestTargets = parentCandidates.filter((t) => !selectedIds.has(t.id));
  const moveTargets = projects.filter((p) => p.id !== currentProjectId && p.status !== "ARCHIVED");

  if (view === "parent") {
    return (
      <>
        <PanelHeading>Make subtasks of…</PanelHeading>
        <PickList
          items={nestTargets.map((t) => ({ id: t.id, label: t.title, icon: "fa-list-check" }))}
          placeholder="Search tasks…"
          emptyText="No other top-level tasks"
          onPick={(t) => { onPatch({ parentTaskId: t.id }); close(); }}
        />
      </>
    );
  }
  if (view === "project") {
    return (
      <>
        <PanelHeading>Move to project</PanelHeading>
        <p className="cpm-bulk-bar-popover-note">
          You will see what changes before anything moves. Subtasks move with their parent.
        </p>
        <PickList
          items={moveTargets.map((p) => ({ id: p.id, label: p.name, icon: "fa-folder" }))}
          placeholder="Search projects…"
          emptyText="No other projects"
          onPick={(p) => { setTarget(p); setView("review"); }}
        />
      </>
    );
  }
  if (view === "review" && target) {
    return (
      <MoveReview
        selectedIds={selectedIds}
        target={target}
        onBack={() => setView("project")}
        onConfirm={(opts) => { onMove(target.id, target.name, opts); close(); }}
      />
    );
  }
  return (
    <>
      <PanelHeading>Column</PanelHeading>
      <div className="cpm-bulk-bar-popover-list">
        {STATUS_LEVELS.map((s) => (
          <button key={s.value} type="button" className="cpm-bulk-bar-popover-item" onClick={() => { onPatch({ status: s.value }); close(); }}>
            <span className={`cpm-bulk-bar-status-dot cpm-bulk-bar-status-dot--${s.value.toLowerCase()}`} aria-hidden="true" />
            <span className="cpm-bulk-bar-popover-label">{s.label}</span>
          </button>
        ))}
      </div>
      <PanelHeading>Hierarchy</PanelHeading>
      <div className="cpm-bulk-bar-popover-list">
        <button type="button" className="cpm-bulk-bar-popover-item" onClick={() => setView("parent")}>
          <i className="fas fa-turn-down cpm-bulk-bar-popover-icon" aria-hidden="true" />
          <span className="cpm-bulk-bar-popover-label">Make subtasks of…</span>
        </button>
        <button type="button" className="cpm-bulk-bar-popover-item" disabled={!anySubtask} onClick={() => { onPatch({ parentTaskId: null }); close(); }}>
          <i className="fas fa-turn-up cpm-bulk-bar-popover-icon" aria-hidden="true" />
          <span className="cpm-bulk-bar-popover-label">Promote to top level</span>
        </button>
      </div>
      <PanelHeading>Project</PanelHeading>
      <div className="cpm-bulk-bar-popover-list">
        <button type="button" className="cpm-bulk-bar-popover-item" onClick={() => setView("project")}>
          <i className="fas fa-right-left cpm-bulk-bar-popover-icon" aria-hidden="true" />
          <span className="cpm-bulk-bar-popover-label">Move {total} to another project…</span>
        </button>
      </div>
    </>
  );
}

export default function BulkActionBar({
  selectedTasks = [],
  projectId,
  projectMembers = [],
  milestones = [],
  blockers = [],
  projects = [],
  parentCandidates = [],
  totalVisible = 0,
  onPatch,
  onMove,
  onDuplicate,
  onCopyLinks,
  onSelectAll,
  onDelete,
  onArchive,
  onClear,
  deleteConfirm,
  onRequestDelete,
  onCancelDelete,
  busy = false,
}) {
  const count = selectedTasks.length;
  const [tags, setTags] = useState([]);
  const active = count > 0;

  // Tags are fetched only while something is selected, then kept.
  useEffect(() => {
    if (!active || !projectId) return;
    let cancelled = false;
    get(`/api/projects/${projectId}/tags`).then((t) => { if (!cancelled) setTags(t ?? []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [active, projectId]);

  const selectedIds = useMemo(() => new Set(selectedTasks.map((t) => t.id)), [selectedTasks]);
  const assigneeCounts = useMemo(() => countBy(selectedTasks, (t) => (t.assignees ?? []).map((a) => a.id)), [selectedTasks]);
  const tagCounts = useMemo(() => countBy(selectedTasks, (t) => (t.tags ?? []).map((g) => g.id)), [selectedTasks]);
  const blockerCounts = useMemo(() => countBy(selectedTasks, (t) => (t.blockers ?? []).map((b) => b.blockerId ?? b.blocker?.id)), [selectedTasks]);
  const withDue = selectedTasks.filter((t) => t.dueDate).length;
  const anySubtask = selectedTasks.some((t) => t.parentTaskId);
  // Milestones and category blockers belong to one project; the lists here are
  // this page's project, so any rolled-up task in the selection can't use them.
  const anyRolledUp = selectedTasks.some((t) => t.rollup);
  const sourceCount = new Set(selectedTasks.map((t) => t.rollup?.projectId ?? "local")).size;
  const crossProjectReason = anyRolledUp
    ? (sourceCount > 1
      ? "Selection mixes projects. Milestones and blockers belong to one project"
      : "Milestones and blockers belong to the sub-project. Open it to change them")
    : undefined;

  if (!active) return null;

  const members = projectMembers.map((m) => ({
    id: m.id,
    label: m.displayName ?? "Unknown",
    avatarUrl: m.avatarUrl,
    initial: m.avatarUrl ? undefined : (m.displayName ?? "?")[0].toUpperCase(),
    count: assigneeCounts.get(m.id) ?? 0,
  }));

  return createPortal(
    <div className="cpm-bulk-action-bar" role="toolbar" aria-label={`Bulk actions for ${count} selected tasks`}>
      <span className="cpm-bulk-bar-count" aria-live="polite">{count} selected</span>
      {count < totalVisible && (
        <button type="button" className="cpm-bulk-bar-text-btn" disabled={busy} onClick={onSelectAll} title="Select all visible tasks (Ctrl+A)">
          Select all {totalVisible}
        </button>
      )}

      <div className="cpm-bulk-bar-divider" />

      <BarMenu icon="fa-arrows-up-down-left-right" label="Move" disabled={busy} width={320}>
        {(close) => (
          <MovePanel
            close={close}
            total={count}
            selectedIds={selectedIds}
            currentProjectId={projectId}
            projects={projects}
            parentCandidates={parentCandidates}
            anySubtask={anySubtask}
            onPatch={onPatch}
            onMove={onMove}
          />
        )}
      </BarMenu>

      <BarMenu icon="fa-flag" label="Priority" disabled={busy} width={180}>
        {(close) => (
          <div className="cpm-bulk-bar-popover-list">
            {PRIORITY_LEVELS.map((p) => (
              <button key={p} type="button" className="cpm-bulk-bar-popover-item" onClick={() => { onPatch({ priority: p }); close(); }}>
                <span className={`cpm-bulk-bar-priority-dot cpm-bulk-bar-priority-dot--${p.toLowerCase()}`} aria-hidden="true" />
                <span className="cpm-bulk-bar-popover-label">{p.charAt(0) + p.slice(1).toLowerCase()}</span>
              </button>
            ))}
          </div>
        )}
      </BarMenu>

      <BarMenu icon="fa-user-plus" label="Assign" disabled={busy}>
        {(close) => (
          <SetEditor
            items={members}
            total={count}
            noun="assignee"
            onApply={(mode, ids) => {
              onPatch(mode === "add" ? { addAssigneeIds: ids } : mode === "remove" ? { removeAssigneeIds: ids } : { assigneeIds: ids });
              close();
            }}
          />
        )}
      </BarMenu>

      <BarMenu icon="fa-calendar-day" label="Due" disabled={busy} width={250}>
        {(close) => <DuePanel onPatch={onPatch} close={close} total={count} withDue={withDue} />}
      </BarMenu>

      <BarMenu icon="fa-tags" label="Tags" disabled={busy}>
        {(close) => (
          <SetEditor
            items={tags.map((t) => ({ id: t.id, label: t.name, color: t.color, count: tagCounts.get(t.id) ?? 0 }))}
            total={count}
            noun="tag"
            emptyText="This project has no tags yet"
            onApply={(mode, ids) => {
              onPatch(mode === "add" ? { addTagIds: ids } : mode === "remove" ? { removeTagIds: ids } : { tagIds: ids });
              close();
            }}
          />
        )}
      </BarMenu>

      <BarMenu icon="fa-flag-checkered" label="Milestone" disabled={busy || !!crossProjectReason} title={crossProjectReason}>
        {(close) => (
          <PickList
            items={[
              { id: null, label: "No milestone", icon: "fa-ban" },
              ...milestones.map((m) => ({
                id: m.id,
                label: m.title,
                icon: "fa-flag-checkered",
                hint: m.dueDate ? new Date(m.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : undefined,
              })),
            ]}
            placeholder="Search milestones…"
            onPick={(m) => { onPatch({ milestoneId: m.id }); close(); }}
          />
        )}
      </BarMenu>

      <BarMenu icon="fa-ellipsis" label="More" disabled={busy} align="right" width={250}>
        {(close) => (
          <MorePanel
            close={close}
            total={count}
            blockers={blockers}
            blockerCounts={blockerCounts}
            blockersDisabledReason={crossProjectReason}
            onPatch={onPatch}
            onDuplicate={onDuplicate}
            onCopyLinks={onCopyLinks}
            onArchive={onArchive}
          />
        )}
      </BarMenu>

      <div className="cpm-bulk-bar-divider" />

      {deleteConfirm ? (
        <div className="cpm-bulk-bar-confirm">
          <span>Delete {count}?</span>
          <button type="button" className="cpm-bulk-bar-btn cpm-bulk-bar-btn--danger" disabled={busy} onClick={onDelete}>
            {busy ? "Deleting…" : "Confirm"}
          </button>
          <button type="button" className="cpm-bulk-bar-btn" disabled={busy} onClick={onCancelDelete}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="cpm-bulk-bar-btn cpm-bulk-bar-btn--danger" disabled={busy} onClick={onRequestDelete} aria-label={`Delete ${count} tasks`}>
          <i className="fas fa-trash-alt" aria-hidden="true" />
        </button>
      )}

      <button type="button" className="cpm-bulk-bar-btn cpm-bulk-bar-clear" disabled={busy} onClick={onClear} title="Clear selection (Esc)" aria-label="Clear selection">
        <i className="fas fa-times" aria-hidden="true" />
      </button>
    </div>,
    document.body
  );
}
