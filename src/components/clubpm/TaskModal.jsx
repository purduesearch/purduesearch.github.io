import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { get, post, patch, del } from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import MemberBadge from "./MemberBadge";
import AttachmentPickerModal from "./AttachmentPickerModal";
import DrivePreviewModal from "./DrivePreviewModal";
import { parseDriveUrl, getTypeMeta } from "../../utils/driveUtils";

// ─── Constants ────────────────────────────────────────────────

const PRIORITY_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUS_OPTIONS = [
  { value: "TODO",        label: "Not Started", color: "#a0aec0" },
  { value: "IN_PROGRESS", label: "In Progress", color: "var(--clubpm-accent-yellow)" },
  { value: "DONE",        label: "Completed",   color: "var(--clubpm-accent-green)" },
  { value: "BLOCKED",     label: "Blocked",     color: "#e17055" },
];
const PRIORITY_CFG = {
  CRITICAL: { color: "#e17055", fills: [1,1,1],        label: "Critical" },
  HIGH:     { color: "#e17055", fills: [1,1,0.35],     label: "High" },
  MEDIUM:   { color: "#fdcb6e", fills: [1,0.55,0.2],   label: "Medium" },
  LOW:      { color: "#00b894", fills: [0.65,0.25,0.1], label: "Low" },
};

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(str) {
  if (!str) return "—";
  const d = new Date(str);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function dueDateLabel(str) {
  if (!str) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(str); d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return { text: "Today", cls: "today" };
  if (diff < 0)   return { text: `Overdue (${MONTHS_SHORT[d.getMonth()]} ${d.getDate()})`, cls: "overdue" };
  return { text: formatDate(str), cls: "" };
}

function toInputDate(str) {
  if (!str) return "";
  const d = new Date(str);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function shiftDate(str, days) {
  const d = new Date(str);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ─── Shared sub-components ─────────────────────────────────────

function PriorityBars({ priority }) {
  const cfg = PRIORITY_CFG[priority] ?? PRIORITY_CFG.MEDIUM;
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:2 }}>
      {[7,10,13].map((h,i) => (
        <div key={i} style={{ width:4, height:h, borderRadius:2, background:cfg.color, opacity:cfg.fills[i] }} />
      ))}
    </div>
  );
}

function StatusDot({ status, size=12 }) {
  const s = STATUS_OPTIONS.find(o => o.value === status) ?? STATUS_OPTIONS[0];
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      width:size, height:size, borderRadius:"50%",
      border:`1.5px solid ${s.color}`, flexShrink:0, fontSize:size*0.55,
      color: s.color,
    }}>
      {status === "DONE" && "✓"}
      {status === "IN_PROGRESS" && "●"}
      {status === "BLOCKED" && "×"}
    </span>
  );
}

function AvatarPill({ member }) {
  if (!member) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      {member.avatarUrl
        ? <img src={member.avatarUrl} alt={member.displayName}
            style={{ width:22, height:22, borderRadius:"50%", objectFit:"cover" }} />
        : <div style={{
            width:22, height:22, borderRadius:"50%", flexShrink:0,
            background:"var(--clubpm-accent-primary)", color:"#fff",
            fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center"
          }}>{(member.displayName??"?")[0].toUpperCase()}</div>
      }
      <span style={{ fontSize:13, color:"var(--clubpm-text-primary)" }}>{member.displayName}</span>
    </div>
  );
}

function IconBtn({ icon, title, onClick, danger, style={} }) {
  const [hov, setHov] = useState(false);
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display:"flex", alignItems:"center", justifyContent:"center",
        background: hov ? (danger ? "rgba(225,112,85,0.12)" : "var(--clubpm-surface-300)") : "none",
        border:"none", cursor:"pointer", padding:"5px 7px", borderRadius:6,
        color: danger ? "#e17055" : "var(--clubpm-text-muted)",
        fontSize:13, transition:"background 0.15s, color 0.15s",
        ...style
      }}>
      <i className={`fas fa-${icon}`} />
    </button>
  );
}

function ActionBtn({ icon, label, onClick, style={} }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:500,
        padding:"5px 11px", borderRadius:6,
        border:"1px solid var(--clubpm-border)",
        background: hov ? "var(--clubpm-surface-300)" : "var(--clubpm-surface-200)",
        color:"var(--clubpm-text-secondary)", cursor:"pointer",
        transition:"background 0.15s", ...style
      }}>
      <i className={`fas fa-${icon}`} style={{ fontSize:11 }} />
      {label}
    </button>
  );
}

function SectionHeader({ icon, label, open, onToggle, onAction, actionIcon, actionTitle }) {
  return (
    <div onClick={onToggle} style={{
      display:"flex", alignItems:"center", gap:8, padding:"11px 20px",
      cursor:"pointer", borderBottom:"1px solid var(--clubpm-border)",
      background:"var(--clubpm-surface-100)",
      userSelect:"none",
    }}>
      <i className={`fas fa-${icon}`} style={{ color:"var(--clubpm-text-muted)", fontSize:13 }} />
      <span style={{ fontSize:13, fontWeight:600, color:"var(--clubpm-text-primary)", flex:1 }}>{label}</span>
      {onAction && (
        <button onClick={e => { e.stopPropagation(); onAction(); }}
          style={{ background:"none", border:"none", cursor:"pointer",
            color:"var(--clubpm-text-muted)", fontSize:12, padding:"2px 5px", borderRadius:4 }}
          title={actionTitle}>
          <i className={`fas fa-${actionIcon}`} />
        </button>
      )}
      <i className={`fas fa-chevron-${open ? "up" : "down"}`}
        style={{ color:"var(--clubpm-text-muted)", fontSize:11 }} />
    </div>
  );
}

// ─── Inline field editors ──────────────────────────────────────

function EditableTitle({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef();

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft !== value) onChange(draft.trim());
    else setDraft(value);
  }

  if (editing) {
    return (
      <input ref={ref} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        style={{
          fontSize:22, fontWeight:700, flex:1, lineHeight:1.3,
          background:"var(--clubpm-surface-200)", border:"1px solid var(--clubpm-accent-primary)",
          borderRadius:6, padding:"3px 8px", color:"var(--clubpm-text-primary)",
          outline:"none", width:"100%",
        }}
      />
    );
  }
  return (
    <h1 onClick={() => setEditing(true)} title="Click to edit"
      style={{
        fontSize:22, fontWeight:700, color:"var(--clubpm-text-primary)",
        flex:1, lineHeight:1.3, cursor:"text", margin:0,
        padding:"3px 8px", borderRadius:6, border:"1px solid transparent",
        transition:"border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--clubpm-border)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
      {value}
    </h1>
  );
}

function PrioritySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const cfg = PRIORITY_CFG[value] ?? PRIORITY_CFG.MEDIUM;
  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display:"flex", alignItems:"center", gap:7, background:"none", border:"none",
        cursor:"pointer", padding:"3px 6px", borderRadius:5,
        border:"1px solid transparent", transition:"border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--clubpm-border)"}
      onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = "transparent"; }}>
        <PriorityBars priority={value} />
        <span style={{ fontSize:13, color:"var(--clubpm-text-secondary)" }}>{cfg.label}</span>
        <i className="fas fa-chevron-down" style={{ fontSize:9, color:"var(--clubpm-text-muted)" }} />
      </button>
      {open && (
        <div style={{
          position:"absolute", top:"100%", left:0, zIndex:200, marginTop:4, minWidth:130,
          background:"var(--clubpm-surface-200)", border:"1px solid var(--clubpm-border)",
          borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.3)", padding:4,
        }}>
          {PRIORITY_OPTIONS.map(p => {
            const c = PRIORITY_CFG[p];
            return (
              <button key={p} onClick={() => { onChange(p); setOpen(false); }} style={{
                display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
                padding:"7px 10px", border:"none", borderRadius:5, cursor:"pointer", fontSize:12,
                background: p === value ? "var(--clubpm-surface-300)" : "none",
                color:"var(--clubpm-text-primary)", transition:"background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--clubpm-surface-300)"}
              onMouseLeave={e => e.currentTarget.style.background = p === value ? "var(--clubpm-surface-300)" : "none"}>
                <PriorityBars priority={p} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = STATUS_OPTIONS.find(s => s.value === value) ?? STATUS_OPTIONS[0];
  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display:"flex", alignItems:"center", gap:7, background:"none", border:"1px solid transparent",
        cursor:"pointer", padding:"3px 6px", borderRadius:5, transition:"border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--clubpm-border)"}
      onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = "transparent"; }}>
        <StatusDot status={value} />
        <span style={{ fontSize:13, color:"var(--clubpm-text-secondary)" }}>{current.label}</span>
        <i className="fas fa-chevron-down" style={{ fontSize:9, color:"var(--clubpm-text-muted)" }} />
      </button>
      {open && (
        <div style={{
          position:"absolute", top:"100%", left:0, zIndex:200, marginTop:4, minWidth:150,
          background:"var(--clubpm-surface-200)", border:"1px solid var(--clubpm-border)",
          borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.3)", padding:4,
        }}>
          {STATUS_OPTIONS.map(s => (
            <button key={s.value} onClick={() => { onChange(s.value); setOpen(false); }} style={{
              display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
              padding:"7px 10px", border:"none", borderRadius:5, cursor:"pointer", fontSize:12,
              background: s.value === value ? "var(--clubpm-surface-300)" : "none",
              color:"var(--clubpm-text-primary)", transition:"background 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--clubpm-surface-300)"}
            onMouseLeave={e => e.currentTarget.style.background = s.value === value ? "var(--clubpm-surface-300)" : "none"}>
              <StatusDot status={s.value} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssigneeEditor({ assignees = [], projectMembers = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const filtered = projectMembers.filter(m =>
    m.displayName?.toLowerCase().includes(search.toLowerCase())
  );
  const assigneeIds = assignees.map(a => a.id);

  function toggle(member) {
    const isOn = assigneeIds.includes(member.id);
    const next = isOn
      ? assignees.filter(a => a.id !== member.id)
      : [...assignees, member];
    onChange(next);
  }

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display:"flex", alignItems:"center", gap:4, cursor:"pointer", flexWrap:"wrap",
        padding:"3px 6px", borderRadius:5, border:"1px solid transparent", transition:"border-color 0.15s",
        minWidth:80,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--clubpm-border)"}
      onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = "transparent"; }}>
        {assignees.length === 0
          ? <span style={{ fontSize:12, color:"var(--clubpm-text-muted)", fontStyle:"italic" }}>Unassigned</span>
          : assignees.slice(0,3).map(a => (
              <div key={a.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
                {a.avatarUrl
                  ? <img src={a.avatarUrl} alt={a.displayName}
                      style={{ width:20, height:20, borderRadius:"50%" }} />
                  : <div style={{
                      width:20, height:20, borderRadius:"50%", background:"var(--clubpm-accent-primary)",
                      color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center"
                    }}>{(a.displayName??"?")[0].toUpperCase()}</div>
                }
                <span style={{ fontSize:12, color:"var(--clubpm-text-primary)" }}>{a.displayName}</span>
              </div>
            ))
        }
        {assignees.length > 3 && <span style={{ fontSize:11, color:"var(--clubpm-text-muted)" }}>+{assignees.length-3}</span>}
        <i className="fas fa-chevron-down" style={{ fontSize:9, color:"var(--clubpm-text-muted)", marginLeft:2 }} />
      </div>

      {open && (
        <div style={{
          position:"absolute", top:"100%", left:0, zIndex:200, marginTop:4, width:220,
          background:"var(--clubpm-surface-200)", border:"1px solid var(--clubpm-border)",
          borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.3)", padding:8,
        }}>
          <input autoFocus placeholder="Search members…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width:"100%", padding:"6px 10px", borderRadius:6, fontSize:12,
              background:"var(--clubpm-surface-300)", border:"1px solid var(--clubpm-border)",
              color:"var(--clubpm-text-primary)", outline:"none", boxSizing:"border-box", marginBottom:6,
            }} />
          <div style={{ maxHeight:180, overflowY:"auto", display:"flex", flexDirection:"column", gap:2 }}>
            {filtered.length === 0
              ? <p style={{ fontSize:11, color:"var(--clubpm-text-muted)", textAlign:"center", padding:"8px 0" }}>No members found</p>
              : filtered.map(m => {
                  const checked = assigneeIds.includes(m.id);
                  return (
                    <button key={m.id} onClick={() => toggle(m)} style={{
                      display:"flex", alignItems:"center", gap:8, padding:"6px 8px", border:"none",
                      borderRadius:5, cursor:"pointer", textAlign:"left",
                      background: checked ? "rgba(108,92,231,0.12)" : "none",
                      transition:"background 0.1s",
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = "var(--clubpm-surface-300)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = checked ? "rgba(108,92,231,0.12)" : "none"; }}>
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt={m.displayName} style={{ width:22, height:22, borderRadius:"50%" }} />
                        : <div style={{
                            width:22, height:22, borderRadius:"50%", background:"var(--clubpm-accent-primary)",
                            color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                          }}>{(m.displayName??"?")[0].toUpperCase()}</div>
                      }
                      <span style={{ fontSize:12, color:"var(--clubpm-text-primary)", flex:1 }}>{m.displayName}</span>
                      {checked && <i className="fas fa-check" style={{ fontSize:10, color:"var(--clubpm-accent-primary)" }} />}
                    </button>
                  );
                })
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Move Task Modal ───────────────────────────────────────────

function MoveTaskModal({ task, allProjects, onMove, onClose }) {
  const [targetProjectId, setTargetProjectId] = useState("");
  const [moveAll, setMoveAll] = useState(false);
  const [mode, setMode] = useState("move");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const otherProjects = allProjects.filter(p => p.id !== task.projectId);

  async function handleSubmit() {
    if (!targetProjectId) { setError("Please select a destination project."); return; }
    setSaving(true); setError(null);
    try {
      await onMove({ targetProjectId, moveAll, mode });
    } catch (e) {
      setError(e.message ?? "Operation failed");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.subModal, maxWidth:440 }}>
        <div style={styles.subModalHeader}>
          <span style={{ fontSize:14, fontWeight:700 }}>
            <i className="fas fa-arrows-alt" style={{ marginRight:8, color:"var(--clubpm-accent-primary)" }} />
            Move / Copy Task
          </span>
          <IconBtn icon="times" onClick={onClose} />
        </div>

        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ display:"flex", gap:0, borderRadius:8, overflow:"hidden", border:"1px solid var(--clubpm-border)" }}>
            {[["move","Move Task","exchange-alt"],["copy","Copy Task","copy"]].map(([val,lbl,ico]) => (
              <button key={val} onClick={() => setMode(val)} style={{
                flex:1, padding:"8px 0", border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                background: mode === val ? "var(--clubpm-accent-primary)" : "var(--clubpm-surface-200)",
                color: mode === val ? "#fff" : "var(--clubpm-text-muted)",
                transition:"background 0.15s, color 0.15s",
              }}>
                <i className={`fas fa-${ico}`} />
                {lbl}
              </button>
            ))}
          </div>

          <div>
            <label style={styles.fieldLabel}>Destination Project *</label>
            <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)}
              style={styles.select}>
              <option value="">Select a project…</option>
              {otherProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <label style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }}>
            <input type="checkbox" checked={moveAll} onChange={e => setMoveAll(e.target.checked)}
              style={{ marginTop:2, accentColor:"var(--clubpm-accent-primary)", width:14, height:14 }} />
            <div>
              <div style={{ fontSize:13, color:"var(--clubpm-text-primary)", fontWeight:500 }}>
                {mode === "move" ? "Move" : "Copy"} entire task list
              </div>
              <div style={{ fontSize:11, color:"var(--clubpm-text-muted)", marginTop:2 }}>
                Includes all tasks in the same status bin as this task
              </div>
            </div>
          </label>

          {error && (
            <p style={{ fontSize:12, color:"#e17055", background:"rgba(225,112,85,0.1)", borderRadius:6, padding:"6px 10px" }}>
              {error}
            </p>
          )}
        </div>

        <div style={styles.subModalFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...styles.primaryBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSubmit} disabled={saving}>
            {saving ? "Working…" : mode === "move" ? "Move" : "Copy"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Shift Deadlines Modal ─────────────────────────────────────

function ShiftDeadlinesModal({ projectTasks, onShift, onClose }) {
  const [days, setDays] = useState(7);
  const [direction, setDirection] = useState("forward");
  const [saving, setSaving] = useState(false);

  const affected = projectTasks.filter(t => t.status === "TODO" && t.dueDate);
  const actualDays = direction === "forward" ? days : -days;

  async function handleSubmit() {
    setSaving(true);
    try {
      await onShift(actualDays);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.subModal, maxWidth:420 }}>
        <div style={styles.subModalHeader}>
          <span style={{ fontSize:14, fontWeight:700 }}>
            <i className="fas fa-calendar-week" style={{ marginRight:8, color:"var(--clubpm-accent-cyan)" }} />
            Shift Deadlines
          </span>
          <IconBtn icon="times" onClick={onClose} />
        </div>

        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:16 }}>
          <p style={{ fontSize:12, color:"var(--clubpm-text-muted)", lineHeight:1.5, margin:0 }}>
            Move due dates for all <strong style={{ color:"var(--clubpm-text-primary)" }}>Not Started</strong> tasks.
            Completed and In Progress tasks are unaffected.
          </p>

          <div>
            <label style={styles.fieldLabel}>Direction</label>
            <div style={{ display:"flex", gap:8 }}>
              {[["forward","Forward","arrow-right"],["backward","Backward","arrow-left"]].map(([val,lbl,ico]) => (
                <button key={val} onClick={() => setDirection(val)} style={{
                  flex:1, padding:"8px", border:"1px solid var(--clubpm-border)", borderRadius:8,
                  cursor:"pointer", fontSize:12, fontWeight:500,
                  display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                  background: direction === val ? "rgba(108,92,231,0.15)" : "var(--clubpm-surface-200)",
                  color: direction === val ? "var(--clubpm-accent-primary)" : "var(--clubpm-text-secondary)",
                  borderColor: direction === val ? "var(--clubpm-accent-primary)" : "var(--clubpm-border)",
                }}>
                  <i className={`fas fa-${ico}`} />
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={styles.fieldLabel}>Days to shift</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {[1,2,3,5,7,14,30].map(d => (
                <button key={d} onClick={() => setDays(d)} style={{
                  padding:"5px 12px", borderRadius:20, fontSize:12, border:"1px solid var(--clubpm-border)",
                  cursor:"pointer", fontWeight: days === d ? 700 : 400,
                  background: days === d ? "var(--clubpm-accent-primary)" : "var(--clubpm-surface-200)",
                  color: days === d ? "#fff" : "var(--clubpm-text-secondary)",
                  transition:"background 0.15s",
                }}>
                  {d}d
                </button>
              ))}
              <input type="number" min={1} max={365} value={days}
                onChange={e => setDays(Math.max(1, parseInt(e.target.value)||1))}
                style={{
                  width:60, padding:"5px 8px", borderRadius:6, fontSize:12,
                  background:"var(--clubpm-surface-300)", border:"1px solid var(--clubpm-border)",
                  color:"var(--clubpm-text-primary)", textAlign:"center",
                }} />
            </div>
          </div>

          <div style={{
            background:"var(--clubpm-surface-200)", borderRadius:8, padding:"10px 14px",
            border:"1px solid var(--clubpm-border)",
          }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--clubpm-text-muted)", marginBottom:6 }}>PREVIEW</div>
            <div style={{ fontSize:12, color:"var(--clubpm-text-secondary)" }}>
              {affected.length} task{affected.length !== 1 ? "s" : ""} will shift{" "}
              <strong style={{ color:"var(--clubpm-text-primary)" }}>
                {days} day{days !== 1 ? "s" : ""} {direction}
              </strong>
            </div>
            {affected.length > 0 && (
              <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:3, maxHeight:100, overflowY:"auto" }}>
                {affected.slice(0,5).map(t => {
                  const orig = new Date(t.dueDate);
                  const next = new Date(t.dueDate);
                  next.setDate(next.getDate() + actualDays);
                  return (
                    <div key={t.id} style={{ fontSize:11, color:"var(--clubpm-text-muted)", display:"flex", gap:6, alignItems:"center" }}>
                      <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</span>
                      <span style={{ color:"var(--clubpm-text-muted)", textDecoration:"line-through", flexShrink:0 }}>
                        {MONTHS_SHORT[orig.getMonth()]} {orig.getDate()}
                      </span>
                      <i className="fas fa-arrow-right" style={{ fontSize:8, flexShrink:0 }} />
                      <span style={{ color:"var(--clubpm-accent-primary)", flexShrink:0 }}>
                        {MONTHS_SHORT[next.getMonth()]} {next.getDate()}
                      </span>
                    </div>
                  );
                })}
                {affected.length > 5 && (
                  <div style={{ fontSize:11, color:"var(--clubpm-text-muted)" }}>
                    +{affected.length - 5} more…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={styles.subModalFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...styles.primaryBtn, opacity: saving||affected.length===0 ? 0.6 : 1 }}
            onClick={handleSubmit} disabled={saving || affected.length === 0}>
            {saving ? "Shifting…" : `Shift ${affected.length} Task${affected.length!==1?"s":""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Confirm Delete Dialog ─────────────────────────────────────

function ConfirmDeleteDialog({ taskTitle, onConfirm, onCancel, saving }) {
  return createPortal(
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...styles.subModal, maxWidth:380 }}>
        <div style={{ padding:"24px 24px 16px", textAlign:"center" }}>
          <div style={{
            width:48, height:48, borderRadius:"50%", background:"rgba(225,112,85,0.15)",
            display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px",
          }}>
            <i className="fas fa-trash-alt" style={{ color:"#e17055", fontSize:20 }} />
          </div>
          <h3 style={{ margin:"0 0 8px", fontSize:16, fontWeight:700, color:"var(--clubpm-text-primary)" }}>
            Delete Task?
          </h3>
          <p style={{ margin:"0 0 4px", fontSize:13, color:"var(--clubpm-text-secondary)" }}>
            "{taskTitle}"
          </p>
          <p style={{ margin:0, fontSize:12, color:"var(--clubpm-text-muted)" }}>
            This will also delete all subtasks. This cannot be undone.
          </p>
        </div>
        <div style={{ ...styles.subModalFooter, borderTop:"1px solid var(--clubpm-border)" }}>
          <button style={styles.cancelBtn} onClick={onCancel}>Keep It</button>
          <button onClick={onConfirm} disabled={saving} style={{
            padding:"7px 18px", borderRadius:7, border:"none", cursor:"pointer",
            background:"#e17055", color:"#fff", fontSize:13, fontWeight:600,
            opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Comment Row ───────────────────────────────────────────────

function CommentRow({ comment }) {
  return (
    <div style={{ display:"flex", gap:10, marginBottom:14 }}>
      {comment.author?.avatarUrl
        ? <img src={comment.author.avatarUrl} alt={comment.author.displayName}
            style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, marginTop:1 }} />
        : <div style={{
            width:26, height:26, borderRadius:"50%", flexShrink:0, marginTop:1,
            background:"var(--clubpm-accent-primary)", color:"#fff",
            fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
          }}>{(comment.author?.displayName??"?")[0].toUpperCase()}</div>
      }
      <div style={{ flex:1 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:3 }}>
          <span style={{ fontSize:13, fontWeight:600, color:"var(--clubpm-text-primary)" }}>
            {comment.author?.displayName ?? "Unknown"}
          </span>
          <span style={{ fontSize:11, color:"var(--clubpm-text-muted)" }}>
            {formatDate(comment.createdAt)}
          </span>
        </div>
        <p style={{ margin:0, fontSize:13, color:"var(--clubpm-text-secondary)", lineHeight:1.5 }}>
          {comment.content}
        </p>
      </div>
    </div>
  );
}

function HistoryRow({ entry }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0",
      borderBottom:"1px solid var(--clubpm-border)", fontSize:12 }}>
      {entry.actor?.avatarUrl
        ? <img src={entry.actor.avatarUrl} alt={entry.actor.displayName} style={{ width:20, height:20, borderRadius:"50%", flexShrink:0 }} />
        : <div style={{
            width:20, height:20, borderRadius:"50%", flexShrink:0,
            background:"var(--clubpm-surface-400)", color:"var(--clubpm-text-muted)",
            fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
          }}>{(entry.actor?.displayName??"?")[0].toUpperCase()}</div>
      }
      <span style={{ color:"var(--clubpm-text-secondary)", flex:1 }}>
        <strong style={{ color:"var(--clubpm-text-primary)" }}>{entry.actor?.displayName}</strong>
        {" "}{entry.action}
      </span>
      <span style={{ color:"var(--clubpm-text-muted)", flexShrink:0 }}>{formatDate(entry.at ?? entry.createdAt)}</span>
    </div>
  );
}

// ─── Subtask Row ───────────────────────────────────────────────

function SubtaskRow({ subtask, onClick }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:0 }}>
      <div style={{ width:16, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", marginTop:10 }}>
        <div style={{ width:1, height:12, background:"var(--clubpm-border)", marginRight:4 }} />
        <div style={{ width:8, height:1, background:"var(--clubpm-border)" }} />
      </div>
    <div onClick={() => onClick(subtask)} style={{
      flex:1, display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:6,
      cursor:"pointer", border:"1px solid var(--clubpm-border)",
      background:"var(--clubpm-surface-100)", transition:"background 0.1s",
    }}
    onMouseEnter={e => e.currentTarget.style.background = "var(--clubpm-surface-200)"}
    onMouseLeave={e => e.currentTarget.style.background = "var(--clubpm-surface-100)"}>
      <StatusDot status={subtask.status ?? "TODO"} size={11} />
      <span style={{ flex:1, fontSize:12, color:"var(--clubpm-text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {subtask.title}
      </span>
      {subtask.dueDate && (
        <span style={{ fontSize:11, color:"var(--clubpm-text-muted)", flexShrink:0 }}>
          {MONTHS_SHORT[new Date(subtask.dueDate).getMonth()]} {new Date(subtask.dueDate).getDate()}
        </span>
      )}
    </div>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────

const styles = {
  overlay: {
    position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:1000,
    display:"flex", alignItems:"center", justifyContent:"center",
    backdropFilter:"blur(2px)",
  },
  subModal: {
    background:"var(--clubpm-surface-100)", borderRadius:12, width:"90vw",
    boxShadow:"0 24px 80px rgba(0,0,0,0.5)", border:"1px solid var(--clubpm-border)",
    overflow:"hidden",
  },
  subModalHeader: {
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"14px 20px", borderBottom:"1px solid var(--clubpm-border)",
    background:"var(--clubpm-surface-200)",
  },
  subModalFooter: {
    display:"flex", justifyContent:"flex-end", gap:8,
    padding:"12px 20px", background:"var(--clubpm-surface-200)",
  },
  fieldLabel: {
    display:"block", fontSize:11, fontWeight:600, color:"var(--clubpm-text-muted)",
    textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5,
  },
  input: {
    width:"100%", padding:"8px 10px", borderRadius:6, fontSize:13,
    background:"var(--clubpm-surface-300)", border:"1px solid var(--clubpm-border)",
    color:"var(--clubpm-text-primary)", outline:"none", boxSizing:"border-box",
  },
  select: {
    width:"100%", padding:"8px 10px", borderRadius:6, fontSize:13,
    background:"var(--clubpm-surface-300)", border:"1px solid var(--clubpm-border)",
    color:"var(--clubpm-text-primary)", cursor:"pointer",
  },
  cancelBtn: {
    padding:"7px 16px", borderRadius:7, border:"1px solid var(--clubpm-border)",
    background:"none", color:"var(--clubpm-text-secondary)", fontSize:13, cursor:"pointer",
  },
  primaryBtn: {
    padding:"7px 18px", borderRadius:7, border:"none", cursor:"pointer",
    background:"var(--clubpm-accent-primary)", color:"#fff", fontSize:13, fontWeight:600,
  },
};

// ─── MetaRow ───────────────────────────────────────────────────

function MetaRow({ label, children }) {
  return (
    <>
      <span style={{
        fontSize:11, fontWeight:600, color:"var(--clubpm-text-muted)",
        textTransform:"uppercase", letterSpacing:"0.04em", display:"flex", alignItems:"center",
      }}>
        {label}
      </span>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        {children}
      </div>
    </>
  );
}

// ─── Main TaskModal ────────────────────────────────────────────

export default function TaskModal({ task: initialTask, readOnly = false, onClose, onUpdate, onDelete, onTaskCreated }) {
  const { member } = useClubPmAuth();

  const [task, setTask] = useState(initialTask);

  const [fullscreen, setFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState("comments");
  const [descOpen, setDescOpen] = useState(true);
  const [subtasksOpen, setSubtasksOpen] = useState(true);
  const [attachOpen, setAttachOpen] = useState(true);

  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);

  const [tags, setTags] = useState(task.tags ?? []);
  const [projectTags, setProjectTags] = useState([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6c5ce7");
  const [creatingTag, setCreatingTag] = useState(false);
  const [blockingTasks, setBlockingTasks] = useState(
    task.blockedBy?.map(d => d.blockingTask) ?? []
  );
  const [depsOpen, setDepsOpen] = useState(true);
  const [timeOpen, setTimeOpen] = useState(false);
  const [showLogTime, setShowLogTime] = useState(false);
  const [logMinutes, setLogMinutes] = useState("");
  const [logNote, setLogNote] = useState("");

  const [commentDraft, setCommentDraft] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description ?? "");
  const [editingDueDate, setEditingDueDate] = useState(false);

  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null); // { url, label }
  const [showParentPicker, setShowParentPicker] = useState(false);
  const [deletingSaving, setDeletingSaving] = useState(false);
  const [nestedTask, setNestedTask] = useState(null);

  const menuRef = useRef();

  useEffect(() => {
    if (!menuOpen) return;
    const close = e => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    if (task.id) {
      get(`/api/tasks/${task.id}/comments`).then(setComments).catch(() => {});
      get(`/api/tasks/${task.id}/history`).then(setHistory).catch(() => {});
      get(`/api/tasks/${task.id}/subtasks`).then(setSubtasks).catch(() => {});
      // Fetch full task to get persisted blockers (blockedBy not always included in list views)
      get(`/api/tasks/${task.id}`).then(full => {
        if (full?.blockedBy) {
          setBlockingTasks(full.blockedBy.map(d => d.blockingTask));
        }
      }).catch(() => {});
    }
    if (task.projectId) {
      get(`/api/projects/${task.projectId}`).then(p => {
        const members = (p.members ?? []).map(pm => pm.member ?? pm);
        setProjectMembers(members);
        setProjectTasks(p.tasks ?? []);
        if (members.length === 0) {
          get("/api/members").then(all => {
            setProjectMembers(all.map(m => ({ id: m.id, displayName: m.displayName, avatarUrl: m.avatarUrl })));
          }).catch(() => {});
        }
      }).catch(() => {});
      get("/api/projects").then(setAllProjects).catch(() => {});
      get(`/api/projects/${task.projectId}/tags`).then(setProjectTags).catch(() => {});
    }
  }, [task.id, task.projectId]);

  const saveField = useCallback(async (fields) => {
    const previous = { ...task };
    const updated = { ...task, ...fields };
    setTask(updated);
    try {
      const result = await patch(`/api/tasks/${task.id}`, fields);
      setTask(t => ({ ...t, ...result }));
      onUpdate?.({ ...updated, ...result });
    } catch (err) {
      setTask(previous);
      if (fields.status && err?.message) alert(err.message);
    }
  }, [task, onUpdate]);

  const handleStatusChange = useCallback(async (newStatus) => {
    if (newStatus === "DONE") {
      const openBlockers = blockingTasks.filter(bt => bt.status !== "DONE");
      if (openBlockers.length > 0) {
        const names = openBlockers.map(bt => bt.title).join(", ");
        alert(`Cannot mark as done — the following blockers are not yet completed:\n\n${names}`);
        return;
      }
    }

    const fields = { status: newStatus };
    if (newStatus === "IN_PROGRESS" && member) {
      const alreadyAssigned = (task.assignees ?? []).some(a => a.id === member.id);
      if (!alreadyAssigned) {
        fields.assigneeIds = [...(task.assignees ?? []).map(a => a.id), member.id];
        const updatedAssignees = [...(task.assignees ?? []), member];
        setTask(t => ({ ...t, status: newStatus, assignees: updatedAssignees }));
        try {
          const result = await patch(`/api/tasks/${task.id}`, fields);
          setTask(t => ({ ...t, ...result }));
          onUpdate?.({ ...task, ...result });
        } catch {
          setTask(t => ({ ...t, status: task.status, assignees: task.assignees }));
        }
        return;
      }
    }
    await saveField(fields);
  }, [task, member, saveField, onUpdate, blockingTasks]);

  async function submitComment() {
    if (!commentDraft.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const c = await post(`/api/tasks/${task.id}/comments`, { content: commentDraft.trim() });
      setComments(prev => [...prev, c]);
      setCommentDraft("");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDuplicate() {
    setMenuOpen(false);
    try {
      const copy = await post(`/api/projects/${task.projectId}/tasks`, {
        title: task.title + " (copy)",
        description: task.description,
        priority: task.priority,
        dueDate: task.dueDate,
        status: "TODO",
        assigneeIds: (task.assignees ?? []).map(a => a.id),
        tags: task.tags,
      });
      onTaskCreated?.(copy);
      setNestedTask(copy);
    } catch (e) {
      console.error("Duplicate failed", e);
    }
  }

  async function handleMove({ targetProjectId, moveAll, mode }) {
    const tasksToProcess = moveAll
      ? projectTasks.filter(t => t.status === task.status)
      : [task];

    if (mode === "move") {
      await Promise.all(tasksToProcess.map(async (t) => {
        await post(`/api/projects/${targetProjectId}/tasks`, {
          title: t.title,
          description: t.description,
          priority: t.priority,
          dueDate: t.dueDate,
          status: t.status,
          assigneeIds: (t.assignees ?? []).map(a => a.id),
        });
        await del(`/api/tasks/${t.id}`);
      }));
      onDelete?.(task);
      onClose();
    } else {
      await Promise.all(tasksToProcess.map(t =>
        post(`/api/projects/${targetProjectId}/tasks`, {
          title: t.title,
          description: t.description,
          priority: t.priority,
          dueDate: t.dueDate,
          status: "TODO",
          assigneeIds: (t.assignees ?? []).map(a => a.id),
        })
      ));
    }
    setShowMoveModal(false);
  }

  async function handleShift(days) {
    const targets = projectTasks.filter(t => t.status === "TODO" && t.dueDate);
    await Promise.all(targets.map(t =>
      patch(`/api/tasks/${t.id}`, { dueDate: shiftDate(t.dueDate, days) })
    ));
    if (task.status === "TODO" && task.dueDate) {
      const newDueDate = shiftDate(task.dueDate, days);
      setTask(t => ({ ...t, dueDate: newDueDate }));
      onUpdate?.({ ...task, dueDate: newDueDate });
    }
  }

  async function handleDelete() {
    setDeletingSaving(true);
    try {
      await del(`/api/tasks/${task.id}`);
      onDelete?.(task);
      onClose();
    } finally {
      setDeletingSaving(false);
    }
  }

  function handleSubtaskCreated(newSubtask) {
    setSubtasks(prev => [...prev, newSubtask]);
    onTaskCreated?.(newSubtask);
    setShowSubtaskModal(false);
  }

  async function handleAddLink(payload) {
    const additions = Array.isArray(payload) ? payload : [payload];
    const attachments = [...(task.attachments ?? []), ...additions];
    await saveField({ attachments });
  }

  function addTag(tag) {
    if (!tag || tags.length >= 5) return;
    if (tags.some(t => (t.id ?? t) === (tag.id ?? tag))) return;
    const newTags = [...tags, tag];
    setTags(newTags);
    saveField({ tags: newTags.map(t => t.id) });
  }

  function removeTag(tag) {
    const newTags = tags.filter(t => (t.id ?? t) !== (tag.id ?? tag));
    setTags(newTags);
    saveField({ tags: newTags.map(t => t.id) });
  }

  async function createTag() {
    if (!newTagName.trim() || !task.projectId || creatingTag || tags.length >= 5) return;
    setCreatingTag(true);
    try {
      const tag = await post(`/api/projects/${task.projectId}/tags`, {
        name: newTagName.trim(),
        color: newTagColor,
      });
      setProjectTags(prev => [...prev, tag]);
      addTag(tag);
      setNewTagName("");
    } catch (err) {
      console.error("Failed to create tag:", err);
      // tag with that name may already exist — continue
    } finally {
      setCreatingTag(false);
    }
  }

  async function addBlockingTask(taskId) {
    if (!taskId) return;
    const btask = projectTasks.find(t => t.id === taskId);
    if (!btask) return;
    const newBlocking = [...blockingTasks, btask];
    setBlockingTasks(newBlocking);
    const correctedBlockedBy = newBlocking.map(b => ({
      blockingTask: { id: b.id, title: b.title, status: b.status },
    }));
    try {
      const result = await patch(`/api/tasks/${task.id}`, { blockingTaskIds: newBlocking.map(t => t.id) });
      const updatedTask = { ...task, ...result, blockedBy: correctedBlockedBy };
      setTask(updatedTask);
      onUpdate?.(updatedTask);
    } catch {
      setBlockingTasks(blockingTasks);
    }
  }

  async function removeBlockingTask(taskId) {
    const newBlocking = blockingTasks.filter(t => t.id !== taskId);
    setBlockingTasks(newBlocking);
    const correctedBlockedBy = newBlocking.map(b => ({
      blockingTask: { id: b.id, title: b.title, status: b.status },
    }));
    try {
      const result = await patch(`/api/tasks/${task.id}`, { blockingTaskIds: newBlocking.map(t => t.id) });
      const updatedTask = { ...task, ...result, blockedBy: correctedBlockedBy };
      setTask(updatedTask);
      onUpdate?.(updatedTask);
    } catch {
      setBlockingTasks(blockingTasks);
    }
  }

  function totalLoggedMinutes(timeLogs) {
    return (timeLogs ?? []).reduce((sum, l) => sum + (l.minutes ?? 0), 0);
  }

  function formatLoggedTime(timeLogs) {
    const mins = totalLoggedMinutes(timeLogs);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0 && m === 0) return "0 min";
    return h > 0 ? `${h} hr${h !== 1 ? "s" : ""}${m > 0 ? " " + m + " min" : ""}` : `${m} min`;
  }

  async function submitLogTime() {
    const mins = parseInt(logMinutes);
    if (!mins || mins < 1) return;
    try {
      const log = await post(`/api/tasks/${task.id}/time-logs`, { minutes: mins, note: logNote.trim() || undefined });
      setTask(t => ({ ...t, timeLogs: [...(t.timeLogs ?? []), log] }));
      setLogMinutes(""); setLogNote(""); setShowLogTime(false);
    } catch (e) { console.error("Failed to log time", e); }
  }

  const dueInfo = dueDateLabel(task.dueDate);
  const createdByMember = task.createdBy ?? task.assignees?.[0];

  const modalStyle = {
    background:"var(--clubpm-surface-100)",
    borderRadius: fullscreen ? 0 : 14,
    width: fullscreen ? "100vw" : "min(820px, 96vw)",
    maxHeight: fullscreen ? "100vh" : "92vh",
    height: fullscreen ? "100vh" : undefined,
    overflow:"hidden",
    display:"flex", flexDirection:"column",
    boxShadow:"0 32px 100px rgba(0,0,0,0.6)",
    border:"1px solid var(--clubpm-border)",
    position: fullscreen ? "fixed" : "relative",
    inset: fullscreen ? 0 : undefined,
  };

  const modal = (
    <div style={{
      ...styles.overlay,
      alignItems: fullscreen ? "flex-start" : "center",
    }} onClick={e => { if (!fullscreen && e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>

        {/* Top bar */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"8px 14px", borderBottom:"1px solid var(--clubpm-border)",
          background:"var(--clubpm-surface-200)", flexShrink:0,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
            <IconBtn icon="times" title="Close" onClick={onClose} />
            <IconBtn icon="expand-arrows-alt" title={fullscreen ? "Exit full screen" : "Full screen"}
              onClick={() => setFullscreen(f => !f)} />
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"var(--clubpm-text-muted)" }}>
            <span>{task.project?.name ?? "Project"}</span>
            <i className="fas fa-chevron-right" style={{ fontSize:8 }} />
            <span>Tasks</span>
            <i className="fas fa-chevron-right" style={{ fontSize:8 }} />
            <span style={{ color:"var(--clubpm-text-primary)", fontWeight:500 }}>Task List</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {member?.avatarUrl
              ? <img src={member.avatarUrl} alt={member.displayName}
                  style={{ width:26, height:26, borderRadius:"50%", border:"2px solid var(--clubpm-accent-primary)" }} />
              : <div style={{
                  width:26, height:26, borderRadius:"50%", background:"var(--clubpm-accent-primary)",
                  color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                  border:"2px solid var(--clubpm-accent-primary)",
                }}>{(member?.displayName??"?")[0].toUpperCase()}</div>
            }
          </div>
        </div>

        {/* Scrollable body */}
        <div className="cpm-scrollable" style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>

          {/* Title + actions */}
          <div style={{ padding:"16px 20px 10px" }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
              <div style={{ flexShrink:0, marginTop:4 }}>
                {(task.assignees?.[0]?.avatarUrl)
                  ? <img src={task.assignees[0].avatarUrl}
                      style={{ width:34, height:34, borderRadius:"50%", border:"2px solid var(--clubpm-border)" }} />
                  : <div style={{
                      width:34, height:34, borderRadius:"50%", flexShrink:0,
                      background:"var(--clubpm-accent-primary)", color:"#fff",
                      fontSize:14, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                    }}>{(task.assignees?.[0]?.displayName ?? task.title ?? "?")[0].toUpperCase()}</div>
                }
              </div>
              <EditableTitle value={task.title}
                onChange={val => saveField({ title: val })} />
            </div>

            {/* Action row */}
            <div style={{ display:"flex", alignItems:"center", gap:8, paddingLeft:46, flexWrap:"wrap" }}>
              {task.isRecurring && (
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10,
                  background:"rgba(108,92,231,0.12)", border:"1px solid var(--clubpm-accent-primary)",
                  color:"var(--clubpm-accent-primary)" }}>
                  🔁 {task.recurrencePattern}
                </span>
              )}
              {task.recurringParentId && (
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10,
                  background:"var(--clubpm-surface-300)", border:"1px solid var(--clubpm-border)",
                  color:"var(--clubpm-text-muted)" }}>
                  🔁 Recurring (instance)
                </span>
              )}
              {!readOnly && <ActionBtn icon="sitemap" label="Add Subtask" onClick={() => setShowSubtaskModal(true)} />}
              {!readOnly && <ActionBtn icon="pencil-alt" label="Edit" onClick={() => setEditingDesc(true)} />}

              {!readOnly && (
                <div ref={menuRef} style={{ position:"relative" }}>
                  <button onClick={() => setMenuOpen(o => !o)} style={{
                    display:"flex", alignItems:"center", justifyContent:"center",
                    width:32, height:32, borderRadius:6, border:"1px solid var(--clubpm-border)",
                    background: menuOpen ? "var(--clubpm-surface-300)" : "var(--clubpm-surface-200)",
                    cursor:"pointer", fontSize:15, color:"var(--clubpm-text-muted)",
                    letterSpacing:2,
                  }}>···</button>

                  {menuOpen && (
                    <div style={{
                      position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:300,
                      background:"var(--clubpm-surface-200)", border:"1px solid var(--clubpm-border)",
                      borderRadius:10, boxShadow:"0 8px 32px rgba(0,0,0,0.35)",
                      padding:5, minWidth:170,
                    }}>
                      {[
                        { icon:"copy",         label:"Duplicate",          action: handleDuplicate },
                        { icon:"arrows-alt",   label:"Move Task",           action: () => { setMenuOpen(false); setShowMoveModal(true); } },
                        { icon:"calendar-week",label:"Shift Deadlines",     action: () => { setMenuOpen(false); setShowShiftModal(true); } },
                        { icon:"sitemap",      label:"Change Parent Task",  action: () => { setMenuOpen(false); setShowParentPicker(true); } },
                      ].map(({ icon, label, action }) => (
                        <button key={label} onClick={action} style={{
                          display:"flex", alignItems:"center", gap:9, width:"100%", textAlign:"left",
                          padding:"8px 12px", border:"none", borderRadius:6, cursor:"pointer",
                          fontSize:12, color:"var(--clubpm-text-primary)", background:"none",
                          transition:"background 0.1s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--clubpm-surface-300)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                          <i className={`fas fa-${icon}`} style={{ width:14, color:"var(--clubpm-text-muted)", fontSize:11 }} />
                          {label}
                        </button>
                      ))}
                      {member?.isAdmin && (
                        <>
                          <div style={{ height:1, background:"var(--clubpm-border)", margin:"4px 0" }} />
                          <button onClick={() => { setMenuOpen(false); setShowDeleteConfirm(true); }} style={{
                            display:"flex", alignItems:"center", gap:9, width:"100%", textAlign:"left",
                            padding:"8px 12px", border:"none", borderRadius:6, cursor:"pointer",
                            fontSize:12, color:"#e17055", background:"none", transition:"background 0.1s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(225,112,85,0.1)"}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}>
                            <i className="fas fa-trash-alt" style={{ width:14, fontSize:11 }} />
                            Delete Task
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Metadata grid */}
          <div style={{
            display:"grid", gridTemplateColumns:"130px 1fr 130px 1fr",
            gap:"10px 0", padding:"12px 20px",
            borderTop:"1px solid var(--clubpm-border)", borderBottom:"1px solid var(--clubpm-border)",
            alignItems:"center",
          }}>
            <MetaRow label="Created By">
              {createdByMember
                ? <AvatarPill member={createdByMember} />
                : <span style={{ fontSize:12, color:"var(--clubpm-text-muted)" }}>—</span>
              }
              {task.createdAt && (
                <span style={{ fontSize:11, color:"var(--clubpm-text-muted)" }}>
                  on {MONTHS_SHORT[new Date(task.createdAt).getMonth()]} {new Date(task.createdAt).getDate()}
                </span>
              )}
            </MetaRow>

            <MetaRow label="Assigned to">
              <AssigneeEditor
                assignees={task.assignees ?? []}
                projectMembers={projectMembers}
                onChange={assignees => saveField({ assigneeIds: assignees.map(a => a.id), assignees })}
              />
            </MetaRow>

            <MetaRow label="Due Date">
              {editingDueDate ? (
                <input type="date" autoFocus defaultValue={toInputDate(task.dueDate)}
                  onBlur={e => { setEditingDueDate(false); if (e.target.value) saveField({ dueDate: new Date(e.target.value + 'T12:00:00').toISOString() }); }}
                  onChange={e => { if (e.target.value) saveField({ dueDate: new Date(e.target.value + 'T12:00:00').toISOString() }); }}
                  style={{ ...styles.input, width:130, padding:"4px 8px", fontSize:12 }} />
              ) : (
                <button onClick={() => setEditingDueDate(true)} style={{
                  background:"none", border:"1px solid transparent", borderRadius:5, cursor:"pointer",
                  padding:"3px 6px", fontSize:13, transition:"border-color 0.15s",
                  color: dueInfo?.cls === "today" ? "var(--clubpm-accent-primary)"
                    : dueInfo?.cls === "overdue" ? "#e17055"
                    : "var(--clubpm-text-secondary)",
                  fontWeight: dueInfo ? 500 : 400,
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--clubpm-border)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                  {dueInfo?.text ?? "Set due date"}
                </button>
              )}
            </MetaRow>

            <MetaRow label="Priority">
              <PrioritySelect value={task.priority ?? "MEDIUM"}
                onChange={val => saveField({ priority: val })} />
            </MetaRow>

            <MetaRow label="Status">
              <StatusSelect value={task.status ?? "TODO"}
                onChange={handleStatusChange} />
            </MetaRow>

            <MetaRow label="Tags">
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                {tags.map((tag) => (
                  <span key={tag.id ?? tag} style={{
                    fontSize: 11, padding: "2px 7px", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 3,
                    background: tag.color ? tag.color + "22" : "var(--clubpm-surface-300)",
                    border: `1px solid ${tag.color ?? "var(--clubpm-border)"}`,
                    color: tag.color ?? "var(--clubpm-text-secondary)",
                  }}>
                    {tag.name ?? tag}
                    {!readOnly && (
                      <button onClick={() => removeTag(tag)} style={{
                        background: "none", border: "none", cursor: "pointer",
                        padding: 0, color: "inherit", fontSize: 10, lineHeight: 1,
                      }}>×</button>
                    )}
                  </span>
                ))}
                {!readOnly && tags.length < 5 && projectTags.filter(pt => !tags.some(t => (t.id ?? t) === (pt.id ?? pt))).length > 0 && (
                  <select
                    value=""
                    onChange={e => addTag(projectTags.find(t => t.id === e.target.value))}
                    style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6,
                      background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
                      color: "var(--clubpm-text-secondary)", cursor: "pointer" }}
                  >
                    <option value="">+ Add tag</option>
                    {projectTags
                      .filter(pt => !tags.some(t => (t.id ?? t) === (pt.id ?? pt)))
                      .map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)
                    }
                  </select>
                )}
                {!readOnly && tags.length < 5 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <input
                      type="text"
                      placeholder="New tag…"
                      value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && createTag()}
                      style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, width: 90,
                        background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
                        color: "var(--clubpm-text-primary)", outline: "none" }}
                    />
                    <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                      title="Tag color"
                      style={{ width: 22, height: 22, padding: 1, borderRadius: 4, cursor: "pointer",
                        border: "1px solid var(--clubpm-border)", background: "transparent" }} />
                    <button onClick={createTag} disabled={!newTagName.trim() || creatingTag}
                      style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5,
                        background: "var(--clubpm-accent-primary)", border: "none", color: "#fff",
                        cursor: newTagName.trim() && !creatingTag ? "pointer" : "default",
                        opacity: newTagName.trim() && !creatingTag ? 1 : 0.45 }}>
                      {creatingTag ? "…" : "Create"}
                    </button>
                  </div>
                )}
                {!readOnly && tags.length >= 5 && (
                  <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>Max 5 tags</span>
                )}
                {tags.length === 0 && readOnly && (
                  <span style={{ fontSize: 12, color: "var(--clubpm-text-muted)", fontStyle: "italic" }}>None</span>
                )}
              </div>
            </MetaRow>
          </div>

          {/* Subtasks */}
          <div>
            <SectionHeader icon="sitemap" label={`Subtasks (${subtasks.length})`}
              open={subtasksOpen} onToggle={() => setSubtasksOpen(o => !o)}
              onAction={() => setShowSubtaskModal(true)} actionIcon="plus" actionTitle="Add subtask" />
            {subtasksOpen && (
              <div style={{ padding:"10px 20px", display:"flex", flexDirection:"column", gap:5 }}>
                {subtasks.length === 0
                  ? <p style={{ fontSize:12, color:"var(--clubpm-text-muted)", fontStyle:"italic", margin:0 }}>
                      No subtasks yet — click + to add one
                    </p>
                  : subtasks.map(s => (
                      <SubtaskRow key={s.id} subtask={s} onClick={t => setNestedTask(t)} />
                    ))
                }
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <SectionHeader icon="file-alt" label="Description"
              open={descOpen} onToggle={() => setDescOpen(o => !o)}
              onAction={() => setEditingDesc(true)} actionIcon="pencil-alt" actionTitle="Edit description" />
            {descOpen && (
              <div style={{ padding:"10px 20px 16px" }}>
                {editingDesc ? (
                  <>
                    <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)}
                      autoFocus rows={5}
                      style={{
                        width:"100%", padding:"10px 12px", borderRadius:8, fontSize:13,
                        background:"var(--clubpm-surface-200)", border:"1px solid var(--clubpm-accent-primary)",
                        color:"var(--clubpm-text-primary)", outline:"none", resize:"vertical",
                        lineHeight:1.6, boxSizing:"border-box",
                      }} />
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <button style={styles.primaryBtn} onClick={() => { saveField({ description: descDraft }); setEditingDesc(false); }}>
                        Save
                      </button>
                      <button style={styles.cancelBtn} onClick={() => { setDescDraft(task.description??""); setEditingDesc(false); }}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div onClick={() => setEditingDesc(true)} style={{
                    fontSize:13, color: task.description ? "var(--clubpm-text-secondary)" : "var(--clubpm-text-muted)",
                    lineHeight:1.7, cursor:"text", padding:"8px 12px", borderRadius:8,
                    border:"1px solid transparent", minHeight:42, transition:"border-color 0.15s",
                    background:"var(--clubpm-surface-50)",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--clubpm-border)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                    {task.description
                      ? <span style={{ whiteSpace:"pre-wrap" }}>{task.description}</span>
                      : <em>Add a description…</em>
                    }
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <SectionHeader icon="folder" label="Attachments"
              open={attachOpen} onToggle={() => setAttachOpen(o => !o)}
              onAction={() => setShowAddLink(true)} actionIcon="arrow-up" actionTitle="Add Drive link" />
            {attachOpen && (
              <div style={{ padding:"10px 20px 16px", display:"flex", flexDirection:"column", gap:6 }}>
                {(task.attachments ?? []).length === 0
                  ? <p style={{ fontSize:12, color:"var(--clubpm-text-muted)", fontStyle:"italic", margin:0 }}>
                      No attachments yet
                    </p>
                  : (task.attachments ?? []).map((att, i) => {
                      const parsed = parseDriveUrl(att.url);
                      const meta = getTypeMeta(parsed.kind);
                      const canPreview = parsed.kind !== "unknown";
                      return (
                        <div key={i} style={{
                          display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                          borderRadius:7, border:"1px solid var(--clubpm-border)",
                          background:"var(--clubpm-surface-200)",
                        }}>
                          <i className={`fas ${meta.icon}`} style={{ color: meta.color, fontSize:16, flexShrink:0 }} aria-hidden="true" />
                          <a href={att.url} target="_blank" rel="noopener noreferrer" style={{
                            fontSize:12, color:"var(--clubpm-accent-primary)", flex:1,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                            textDecoration:"none",
                          }}>{att.label || att.url}</a>
                          <span style={{
                            fontSize:10, color: meta.color, fontWeight:600, letterSpacing:"0.04em",
                            textTransform:"uppercase", flexShrink:0,
                          }}>
                            {meta.label}
                          </span>
                          {canPreview && (
                            <button
                              type="button"
                              onClick={() => setPreviewAttachment({ url: att.url, label: att.label })}
                              title="Preview"
                              aria-label="Preview attachment"
                              style={{
                                background:"none", border:"none", cursor:"pointer", padding:"2px 4px",
                                color:"var(--clubpm-text-muted)", fontSize:12, borderRadius:4,
                              }}
                            >
                              <i className="fas fa-eye" aria-hidden="true" />
                            </button>
                          )}
                          <button onClick={() => {
                            const next = (task.attachments ?? []).filter((_,j) => j !== i);
                            saveField({ attachments: next });
                          }}
                          title="Remove attachment"
                          aria-label="Remove attachment"
                          style={{
                            background:"none", border:"none", cursor:"pointer", padding:"2px 4px",
                            color:"var(--clubpm-text-muted)", fontSize:11, borderRadius:4,
                          }}>
                            <i className="fas fa-times" />
                          </button>
                        </div>
                      );
                    })
                }
                <button onClick={() => setShowAddLink(true)} style={{
                  display:"flex", alignItems:"center", gap:6, padding:"7px 10px",
                  borderRadius:7, border:"1px dashed var(--clubpm-border)",
                  background:"none", cursor:"pointer", fontSize:12,
                  color:"var(--clubpm-text-muted)", transition:"border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--clubpm-accent-primary)"; e.currentTarget.style.color = "var(--clubpm-accent-primary)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--clubpm-border)"; e.currentTarget.style.color = "var(--clubpm-text-muted)"; }}>
                  <i className="fab fa-google-drive" />
                  Add Drive link
                </button>
              </div>
            )}
          </div>

          {/* Dependencies */}
          {(() => {
            const incompleteSubtasks = subtasks.filter(s => s.status !== "DONE");
            const totalBlockers = blockingTasks.length + incompleteSubtasks.length;
            return (
            <div>
              <SectionHeader icon="ban" label={`Dependencies${totalBlockers > 0 ? ` (${totalBlockers})` : ""}`}
                open={depsOpen} onToggle={() => setDepsOpen(o => !o)} />
              {depsOpen && (
                <div style={{ padding:"10px 20px 16px", display:"flex", flexDirection:"column", gap:8 }}>
                  {totalBlockers > 0 && (
                    <div style={{ fontSize:12, color:"#e17055", background:"rgba(225,112,85,0.1)",
                      borderRadius:6, padding:"8px 12px", border:"1px solid rgba(225,112,85,0.3)" }}>
                      This task is blocked by {totalBlockers} item{totalBlockers !== 1 ? "s" : ""} — it cannot be marked done until they are resolved.
                    </div>
                  )}
                  {incompleteSubtasks.map(s => (
                    <div key={`subtask-${s.id}`} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px",
                      borderRadius:6, border:"1px solid var(--clubpm-border)", background:"var(--clubpm-surface-100)" }}>
                      <StatusDot status={s.status ?? "TODO"} size={10} />
                      <span style={{ flex:1, fontSize:12, color:"var(--clubpm-text-primary)",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</span>
                      <span style={{ fontSize:10, color:"var(--clubpm-text-muted)", background:"var(--clubpm-surface-300)",
                        padding:"2px 6px", borderRadius:10, flexShrink:0 }}>subtask</span>
                    </div>
                  ))}
                  {blockingTasks.map(bt => (
                    <div key={bt.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px",
                      borderRadius:6, border:"1px solid var(--clubpm-border)", background:"var(--clubpm-surface-100)" }}>
                      <StatusDot status={bt.status ?? "TODO"} size={10} />
                      <span style={{ flex:1, fontSize:12, color:"var(--clubpm-text-primary)",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{bt.title}</span>
                      {!readOnly && (
                        <button onClick={() => removeBlockingTask(bt.id)} style={{
                          background:"none", border:"none", cursor:"pointer", padding:"2px 4px",
                          color:"var(--clubpm-text-muted)", fontSize:12, borderRadius:4,
                        }}>×</button>
                      )}
                    </div>
                  ))}
                  {!readOnly && projectTasks.filter(t => t.id !== task.id && !blockingTasks.some(bt => bt.id === t.id) && t.status !== "DONE").length > 0 && (
                    <select value="" onChange={e => addBlockingTask(e.target.value)} style={styles.select}>
                      <option value="">+ Add blocker…</option>
                      {projectTasks
                        .filter(t => t.id !== task.id && !blockingTasks.some(bt => bt.id === t.id) && t.status !== "DONE")
                        .map(t => <option key={t.id} value={t.id}>{t.title}</option>)
                      }
                    </select>
                  )}
                  {totalBlockers === 0 && readOnly && (
                    <p style={{ fontSize:12, color:"var(--clubpm-text-muted)", fontStyle:"italic", margin:0 }}>No blockers</p>
                  )}
                </div>
              )}
            </div>
            );
          })()}

          {/* Time Tracking */}
          <div>
            <SectionHeader icon="clock" label="Time Tracking" open={timeOpen} onToggle={() => setTimeOpen(o => !o)} />
            {timeOpen && (
              <div style={{ padding:"10px 20px 16px", display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"flex", gap:20, fontSize:12, color:"var(--clubpm-text-secondary)" }}>
                  <span>Estimated: {task.estimatedHours ? `${task.estimatedHours} hrs` : "—"}{task.storyPoints ? ` · ${task.storyPoints} pts` : ""}</span>
                  <span>Logged: {formatLoggedTime(task.timeLogs)}</span>
                </div>
                {task.estimatedHours && (task.timeLogs ?? []).length > 0 && (
                  <div style={{ height:6, borderRadius:3, background:"var(--clubpm-surface-400)", overflow:"hidden" }}>
                    <div style={{
                      height:"100%", borderRadius:3, background:"var(--clubpm-accent-primary)",
                      width:`${Math.min(100, (totalLoggedMinutes(task.timeLogs) / (task.estimatedHours * 60)) * 100)}%`,
                      transition:"width 0.3s",
                    }} />
                  </div>
                )}
                {(task.timeLogs ?? []).length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    {task.timeLogs.map((log, i) => (
                      <div key={i} style={{ fontSize:11, color:"var(--clubpm-text-muted)", display:"flex", gap:6 }}>
                        <span>{Math.floor(log.minutes / 60)}h {log.minutes % 60}m</span>
                        {log.note && <span>— {log.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {!readOnly && !showLogTime && (
                  <button onClick={() => setShowLogTime(true)} style={{
                    ...styles.cancelBtn, display:"flex", alignItems:"center", gap:6, width:"fit-content",
                  }}>
                    <i className="fas fa-clock" style={{ fontSize:11 }} /> Log Time
                  </button>
                )}
                {showLogTime && (
                  <div style={{ display:"flex", flexDirection:"column", gap:8,
                    background:"var(--clubpm-surface-200)", borderRadius:8, padding:"12px" }}>
                    <div style={{ display:"flex", gap:8 }}>
                      <input type="number" min={1} value={logMinutes}
                        onChange={e => setLogMinutes(e.target.value)}
                        placeholder="Minutes"
                        style={{ ...styles.input, width:100 }} />
                      <input type="text" value={logNote}
                        onChange={e => setLogNote(e.target.value)}
                        placeholder="Note (optional)"
                        style={{ ...styles.input, flex:1 }} />
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={submitLogTime}
                        disabled={!logMinutes || parseInt(logMinutes) < 1}
                        style={{ ...styles.primaryBtn, opacity: !logMinutes ? 0.6 : 1 }}>
                        Submit
                      </button>
                      <button onClick={() => { setShowLogTime(false); setLogMinutes(""); setLogNote(""); }}
                        style={styles.cancelBtn}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Comments & History tabs */}
          <div style={{ flexShrink:0 }}>
            <div style={{
              display:"flex", alignItems:"center", gap:2,
              padding:"0 20px", borderTop:"1px solid var(--clubpm-border)",
              borderBottom:"2px solid var(--clubpm-border)",
            }}>
              {[
                { id:"comments", label:"Comments", count: comments.length },
                { id:"history",  label:"History",  count: null },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding:"10px 14px", border:"none", background:"none", cursor:"pointer",
                  fontSize:13, fontWeight: tab === t.id ? 600 : 400,
                  color: tab === t.id ? "var(--clubpm-accent-primary)" : "var(--clubpm-text-muted)",
                  borderBottom: tab === t.id ? "2px solid var(--clubpm-accent-primary)" : "2px solid transparent",
                  marginBottom:"-2px", display:"flex", alignItems:"center", gap:5,
                  transition:"color 0.15s",
                }}>
                  {t.label}
                  {t.count > 0 && (
                    <span style={{
                      display:"inline-flex", alignItems:"center", justifyContent:"center",
                      width:17, height:17, borderRadius:"50%",
                      background:"var(--clubpm-accent-primary)", color:"#fff", fontSize:9, fontWeight:700,
                    }}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ padding:"14px 20px 20px" }}>
              {tab === "comments" && (
                <>
                  {comments.length === 0 && (
                    <p style={{ fontSize:12, color:"var(--clubpm-text-muted)", fontStyle:"italic", marginBottom:14 }}>
                      No comments yet
                    </p>
                  )}
                  {comments.map(c => <CommentRow key={c.id} comment={c} />)}

                  <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:4 }}>
                    {member?.avatarUrl
                      ? <img src={member.avatarUrl} alt={member.displayName} style={{ width:28, height:28, borderRadius:"50%", flexShrink:0 }} />
                      : <div style={{
                          width:28, height:28, borderRadius:"50%", flexShrink:0,
                          background:"var(--clubpm-accent-primary)", color:"#fff",
                          fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                        }}>{(member?.displayName??"?")[0].toUpperCase()}</div>
                    }
                    <input
                      value={commentDraft}
                      onChange={e => setCommentDraft(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && submitComment()}
                      placeholder="Write a comment here…"
                      style={{
                        flex:1, padding:"8px 14px", borderRadius:20, fontSize:13,
                        background:"var(--clubpm-surface-200)", border:"1px solid var(--clubpm-border)",
                        color:"var(--clubpm-text-primary)", outline:"none",
                        transition:"border-color 0.15s",
                      }}
                      onFocus={e => e.target.style.borderColor = "var(--clubpm-accent-primary)"}
                      onBlur={e => e.target.style.borderColor = "var(--clubpm-border)"}
                    />
                    {commentDraft.trim() && (
                      <button onClick={submitComment} disabled={submittingComment} style={{
                        ...styles.primaryBtn, padding:"7px 14px", opacity: submittingComment ? 0.7 : 1,
                      }}>
                        <i className="fas fa-paper-plane" />
                      </button>
                    )}
                  </div>
                </>
              )}

              {tab === "history" && (
                <div>
                  {history.length === 0
                    ? <p style={{ fontSize:12, color:"var(--clubpm-text-muted)", fontStyle:"italic" }}>No history recorded</p>
                    : history.map((h, i) => <HistoryRow key={i} entry={h} />)
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(modal, document.body)}

      {showSubtaskModal && (
        <CreateSubtaskModal
          parentTask={task}
          projectMembers={projectMembers}
          onCreated={handleSubtaskCreated}
          onClose={() => setShowSubtaskModal(false)}
        />
      )}

      {showMoveModal && (
        <MoveTaskModal
          task={task}
          allProjects={allProjects}
          onMove={handleMove}
          onClose={() => setShowMoveModal(false)}
        />
      )}

      {showShiftModal && (
        <ShiftDeadlinesModal
          projectTasks={projectTasks}
          onShift={handleShift}
          onClose={() => setShowShiftModal(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          taskTitle={task.title}
          saving={deletingSaving}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showAddLink && (
        <AttachmentPickerModal
          projectId={task.projectId}
          onAdd={handleAddLink}
          onClose={() => setShowAddLink(false)}
        />
      )}

      {previewAttachment && (
        <DrivePreviewModal
          url={previewAttachment.url}
          label={previewAttachment.label}
          onClose={() => setPreviewAttachment(null)}
        />
      )}

      {showParentPicker && (
        <ChangeParentModal
          task={task}
          projectTasks={projectTasks}
          onSelect={async (parentTaskId) => {
            await saveField({ parentTaskId });
            setShowParentPicker(false);
          }}
          onClose={() => setShowParentPicker(false)}
        />
      )}

      {nestedTask && (
        <TaskModal
          task={nestedTask}
          onClose={() => setNestedTask(null)}
          onUpdate={updated => {
            if (updated.id === task.id) { setTask(updated); onUpdate?.(updated); }
          }}
          onDelete={t => {
            if (t.id === task.id) { onDelete?.(t); onClose(); }
            else setSubtasks(prev => prev.filter(s => s.id !== t.id));
            setNestedTask(null);
          }}
          onTaskCreated={onTaskCreated}
        />
      )}
    </>
  );
}

// ─── Create Subtask Modal ──────────────────────────────────────

function CreateSubtaskModal({ parentTask, projectMembers, onCreated, onClose }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assignees, setAssignees] = useState([]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate() {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true); setError(null);
    try {
      const subtask = await post(`/api/projects/${parentTask.projectId}/tasks`, {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate ? new Date(dueDate + 'T12:00:00').toISOString() : undefined,
        status: "TODO",
        parentTaskId: parentTask.id,
        assigneeIds: assignees.map(a => a.id),
      });
      onCreated(subtask);
    } catch (e) {
      setError(e.message ?? "Failed to create subtask");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div style={{ ...styles.overlay, zIndex:1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.subModal, maxWidth:500 }}>
        <div style={styles.subModalHeader}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--clubpm-text-primary)", display:"flex", alignItems:"center", gap:7 }}>
              <i className="fas fa-sitemap" style={{ color:"var(--clubpm-accent-primary)" }} />
              New Subtask
            </div>
            <div style={{ fontSize:11, color:"var(--clubpm-text-muted)", marginTop:2 }}>
              Under: {parentTask.title}
            </div>
          </div>
          <IconBtn icon="times" onClick={onClose} />
        </div>

        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={styles.fieldLabel}>Title *</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?" style={styles.input}
              onKeyDown={e => e.key === "Enter" && handleCreate()} />
          </div>

          <div>
            <label style={styles.fieldLabel}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Add details…"
              style={{ ...styles.input, resize:"vertical", lineHeight:1.5 }} />
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={styles.fieldLabel}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={styles.input} />
            </div>
            <div>
              <label style={styles.fieldLabel}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={styles.select}>
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={styles.fieldLabel}>Assign to</label>
            <AssigneeEditor
              assignees={assignees}
              projectMembers={projectMembers}
              onChange={setAssignees}
            />
          </div>

          {error && (
            <p style={{ fontSize:12, color:"#e17055", background:"rgba(225,112,85,0.1)", borderRadius:6, padding:"6px 10px", margin:0 }}>
              {error}
            </p>
          )}
        </div>

        <div style={styles.subModalFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...styles.primaryBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleCreate} disabled={saving}>
            {saving ? "Creating…" : "Create Subtask"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Change Parent Task Modal ──────────────────────────────────

function ChangeParentModal({ task, projectTasks, onSelect, onClose }) {
  const [search, setSearch] = useState("");

  // Exclude self and direct children to prevent circular hierarchies
  const directChildIds = new Set(
    projectTasks.filter(t => t.parentTaskId === task.id).map(t => t.id)
  );
  const candidates = projectTasks.filter(
    t => !t.parentTaskId && t.id !== task.id && !directChildIds.has(t.id)
  );

  const filtered = search.trim()
    ? candidates.filter(t => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    : candidates;

  return createPortal(
    <div style={{ ...styles.overlay, zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.subModal, maxWidth: 460 }}>
        <div style={styles.subModalHeader}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--clubpm-text-primary)", display: "flex", alignItems: "center", gap: 7 }}>
            <i className="fas fa-sitemap" style={{ color: "var(--clubpm-accent-primary)" }} />
            Change Parent Task
          </span>
          <IconBtn icon="times" onClick={onClose} />
        </div>

        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            autoFocus
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.input}
          />

          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--clubpm-text-muted)", fontStyle: "italic", padding: "8px 4px", margin: 0 }}>
                No eligible parent tasks found
              </p>
            ) : (
              filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", border: "none", borderRadius: 6,
                    cursor: "pointer", textAlign: "left",
                    background: "none", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--clubpm-surface-300)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  <StatusDot status={t.status ?? "TODO"} size={11} />
                  <span style={{ flex: 1, fontSize: 13, color: "var(--clubpm-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title}
                  </span>
                  <PriorityBars priority={t.priority} />
                </button>
              ))
            )}
          </div>
        </div>

        <div style={{ ...styles.subModalFooter, justifyContent: "space-between" }}>
          {task.parentTaskId ? (
            <button
              style={{ ...styles.cancelBtn, color: "#e17055", borderColor: "rgba(225,112,85,0.4)" }}
              onClick={() => onSelect(null)}
            >
              <i className="fas fa-unlink" style={{ marginRight: 6, fontSize: 11 }} />
              Remove Parent
            </button>
          ) : (
            <span />
          )}
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
