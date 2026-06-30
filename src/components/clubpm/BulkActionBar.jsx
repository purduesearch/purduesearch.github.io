import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PRIORITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUS_LEVELS = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];

// Multi-select checklist mirroring AssigneeEditor's toggle behavior
// (TaskModal.jsx:313); "Apply" replaces the assignees on every selected
// task since the bulk endpoint applies one assigneeIds value to all ids.
function AssignDropdown({ projectMembers, onAssign, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const filtered = projectMembers.filter((m) =>
    m.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(member) {
    setPicked((prev) =>
      prev.includes(member.id) ? prev.filter((id) => id !== member.id) : [...prev, member.id]
    );
  }

  function apply() {
    if (picked.length === 0) return;
    onAssign(picked);
    setPicked([]);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="cpm-bulk-bar-btn"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <i className="fas fa-user-plus" aria-hidden="true" /> Assign
      </button>
      {open && (
        <div className="cpm-bulk-bar-popover">
          <input
            autoFocus
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="cpm-bulk-bar-popover-search"
          />
          <div className="cpm-bulk-bar-popover-list">
            {filtered.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--clubpm-text-muted)", textAlign: "center", padding: "8px 0", margin: 0 }}>
                No members found
              </p>
            ) : (
              filtered.map((m) => {
                const checked = picked.includes(m.id);
                return (
                  <button
                    key={m.id}
                    className={`cpm-bulk-bar-popover-item${checked ? " cpm-bulk-bar-popover-item--checked" : ""}`}
                    onClick={() => toggle(m)}
                  >
                    {m.avatarUrl
                      ? <img src={m.avatarUrl} alt={m.displayName} style={{ width: 20, height: 20, borderRadius: "50%" }} />
                      : <div className="cpm-bulk-bar-popover-item-fallback">{(m.displayName ?? "?")[0].toUpperCase()}</div>}
                    <span>{m.displayName}</span>
                    {checked && <i className="fas fa-check" style={{ fontSize: 10, marginLeft: "auto" }} aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>
          <button className="cpm-bulk-bar-popover-apply" disabled={picked.length === 0} onClick={apply}>
            Apply to selected
          </button>
        </div>
      )}
    </div>
  );
}

export default function BulkActionBar({
  count,
  projectMembers = [],
  onAssign,
  onDueDate,
  onStatus,
  onPriority,
  onDelete,
  onClear,
  deleteConfirm,
  onRequestDelete,
  onCancelDelete,
  busy = false,
}) {
  if (count === 0) return null;

  return createPortal(
    <div className="cpm-bulk-action-bar">
      <span className="cpm-bulk-bar-count">{count} selected</span>

      <div className="cpm-bulk-bar-divider" />

      <AssignDropdown projectMembers={projectMembers} onAssign={onAssign} disabled={busy} />

      <input
        type="date"
        className="cpm-bulk-bar-date"
        disabled={busy}
        onChange={(e) => {
          if (!e.target.value) return;
          onDueDate(new Date(e.target.value).toISOString());
          e.target.value = "";
        }}
        title="Set due date"
      />

      <select
        className="cpm-bulk-bar-select"
        disabled={busy}
        value=""
        onChange={(e) => { if (e.target.value) onStatus(e.target.value); }}
      >
        <option value="" disabled>Status…</option>
        {STATUS_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <select
        className="cpm-bulk-bar-select"
        disabled={busy}
        value=""
        onChange={(e) => { if (e.target.value) onPriority(e.target.value); }}
      >
        <option value="" disabled>Priority…</option>
        {PRIORITY_LEVELS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      <div className="cpm-bulk-bar-divider" />

      {deleteConfirm ? (
        <div className="cpm-bulk-bar-confirm">
          <span>Delete {count}?</span>
          <button className="cpm-bulk-bar-btn cpm-bulk-bar-btn--danger" disabled={busy} onClick={onDelete}>
            {busy ? "Deleting…" : "Confirm"}
          </button>
          <button className="cpm-bulk-bar-btn" disabled={busy} onClick={onCancelDelete}>Cancel</button>
        </div>
      ) : (
        <button className="cpm-bulk-bar-btn cpm-bulk-bar-btn--danger" disabled={busy} onClick={onRequestDelete}>
          <i className="fas fa-trash-alt" aria-hidden="true" /> Delete
        </button>
      )}

      <button className="cpm-bulk-bar-btn cpm-bulk-bar-clear" disabled={busy} onClick={onClear} title="Clear selection">
        <i className="fas fa-times" aria-hidden="true" />
      </button>
    </div>,
    document.body
  );
}
