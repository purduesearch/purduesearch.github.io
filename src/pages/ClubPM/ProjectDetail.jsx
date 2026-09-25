import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { get, post, patch, setNextRewardOrigin, bulkArchive, unarchiveTask, getArchivedTasks, getProjectBlockers, createBlocker, updateBlocker } from "../../api/clubPmClient";
import MemberBadge from "../../components/clubpm/MemberBadge";
import LabTimeButton from "../../components/clubpm/labschedule/LabTimeButton";
import LabPresenceCard from "../../components/clubpm/labschedule/LabPresenceCard";
import AvatarPortrait from "../../components/clubpm/avatar/AvatarPortrait";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import { useProjectNav } from "../../clubpm/ProjectNavContext";
import TaskModal from "../../components/clubpm/TaskModal";
import BulkActionBar from "../../components/clubpm/BulkActionBar";
import ProjectActivity from "../../components/clubpm/ProjectActivity";
import ReportingView from "../../components/clubpm/ReportingView";
import ProjectAnalytics from "../../components/clubpm/analytics";
import ProjectTimeInsights from "../../components/clubpm/analytics/ProjectTimeInsights";
import PressKitPanel from "../../components/clubpm/PressKitPanel";
import GanttChart from "../../components/clubpm/GanttChart";
import { PriorityBars, AvatarStack } from "../../components/clubpm/TaskPrimitives";
import DrivePreviewModal from "../../components/clubpm/DrivePreviewModal";
import EditDriveFolderModal from "../../components/clubpm/EditDriveFolderModal";
import EditProjectModal from "../../components/clubpm/EditProjectModal";
import GitHubPanel from "../../components/clubpm/github/GitHubPanel";
import ActionPlanReview from "../../components/clubpm/ActionPlanReview";
import VaultTab from "../../components/clubpm/vault/VaultTab";
import ChatTab from "../../components/clubpm/chat/ChatTab";
import MembersView from "./MembersView";
import { parseDriveUrl, getTypeMeta, getPreviewUrl } from "../../utils/driveUtils";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { animate, spring, revealStagger, prefersReducedMotion } from "../../clubpm/anim/motion";
import { burstAt } from "../../components/clubpm/celebrate/confetti";
import useStreakWatcher from "../../hooks/useStreakWatcher";
import MobileSheet from "../../components/clubpm/MobileSheet";
import { useCompactLayout } from "../../clubpm/layout/compactLayout";
import { requestShellOverlay } from "../../clubpm/layout/shellOverlay";

// ── Constants ────────────────────────────────────────────────

const BINS = [
  { id: "TODO",        label: "Not Started", color: "var(--clubpm-text-secondary)" },
  { id: "IN_PROGRESS", label: "In Progress", color: "var(--clubpm-accent-yellow)" },
  { id: "BLOCKED",     label: "Blocked",     color: "var(--clubpm-accent-red, #e17055)" },
  { id: "DONE",        label: "Completed",   color: "var(--clubpm-accent-green)" },
];
const BIN_TOUR_IDS = {
  TODO: "board.column.TODO",
  IN_PROGRESS: "board.column.IN_PROGRESS",
  BLOCKED: "board.column.BLOCKED",
  DONE: "board.column.DONE",
};

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const BIN_ID_SET = new Set(BINS.map((b) => b.id));

// A droppable is a "container" if it's a status bin or a blocker sub-bin
// (id `blocker-<id>`). Task rows / subtask rows are non-container droppables.
function isContainerId(id) {
  return typeof id === "string" && (BIN_ID_SET.has(id) || id.startsWith("blocker-"));
}

// Custom collision detection so a task can be dropped anywhere inside a bin
// (not just the tiny empty gap). closestCenter resolves a task hovering over a
// populated bin to the nearest task row, which the drop handler then ignores.
//   • Member / special chip drags → nearest task row (containers excluded), so
//     "assign to task" keeps working.
//   • Task drags → the bin / blocker sub-bin under the pointer. A blocker
//     sub-bin wins over the enclosing BLOCKED bin (more specific target).
function kanbanCollisionDetection(args) {
  const activeId = args.active?.id;
  const isMemberDrag =
    typeof activeId === "string" &&
    (activeId.startsWith("member-") || activeId === "special-everyone" || activeId === "special-nobody");

  if (isMemberDrag) {
    // Valid member targets: task / subtask rows (assign to task) and blocker
    // category sub-bins (set the blocker's owner). Status bins are never member
    // targets. A blocked task row is nested inside its category bin, so when the
    // pointer is over a row the row wins; over the bare bin header, the bin wins.
    const targets = args.droppableContainers.filter((c) => {
      const cid = c.id;
      if (typeof cid === "string" && cid.startsWith("noop-")) return false;
      if (typeof cid === "string" && cid.startsWith("blocker-")) return true;
      return !isContainerId(cid);
    });
    const hits = pointerWithin({ ...args, droppableContainers: targets });
    if (hits.length) {
      const row = hits.find((h) => !(typeof h.id === "string" && h.id.startsWith("blocker-")));
      return row ? [row] : [hits[0]];
    }
    // Nothing directly under the pointer → snap to the nearest task row (never a
    // bin), preserving the old "assign to closest card" behaviour.
    const rows = {
      ...args,
      droppableContainers: targets.filter((c) => !(typeof c.id === "string" && c.id.startsWith("blocker-"))),
    };
    return closestCenter(rows);
  }

  const containers = {
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => isContainerId(c.id)),
  };
  const hits = pointerWithin(containers);
  const resolved = hits.length ? hits : rectIntersection(containers);
  if (!resolved.length) return closestCenter(containers);
  const subBin = resolved.find((h) => typeof h.id === "string" && h.id.startsWith("blocker-"));
  return subBin ? [subBin] : [resolved[0]];
}

function getTagGroups(tasks) {
  const tagMap = new Map();
  const untagged = [];
  tasks.forEach(task => {
    const firstTag = (task.tags ?? [])[0];
    if (!firstTag) {
      untagged.push(task);
    } else {
      if (!tagMap.has(firstTag.id)) tagMap.set(firstTag.id, { tag: firstTag, tasks: [] });
      tagMap.get(firstTag.id).tasks.push(task);
    }
  });
  const groups = [...tagMap.values()].sort((a, b) => a.tag.name.localeCompare(b.tag.name));
  if (untagged.length) groups.push({ tag: null, tasks: untagged });
  return groups;
}

// `tourId` travels with the tab because AppShell is what actually renders this
// bar (see the projectNav block there) — the ids must live on the node the
// learner can click, not on a copy of the list.
// Icons match the sidebar's own nav items (AppShell `NAV_ITEMS`): 18x18,
// currentColor stroke, no fill — not emoji.
function TabIcon({ children }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// Shared by the Insights subtab and the AI panel heading.
const AI_TAB_ICON = (
  <TabIcon>
    <rect x="6" y="8" width="12" height="11" rx="2" />
    <path d="M12 5V8" />
    <circle cx="12" cy="3.5" r="1.5" />
    <line x1="3" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="21" y2="12" />
    <line x1="10" y1="12.5" x2="10" y2="13.5" />
    <line x1="14" y1="12.5" x2="14" y2="13.5" />
  </TabIcon>
);

const NAV_TABS = [
  {
    id: "tasks", label: "Tasks", tourId: "project.tab.tasks",
    icon: (
      <TabIcon>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </TabIcon>
    ),
  },
  {
    id: "files", label: "Files", tourId: "project.tab.files",
    icon: (
      <TabIcon>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </TabIcon>
    ),
  },
  {
    id: "chat", label: "Chat", tourId: "project.tab.chat",
    icon: (
      <TabIcon>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </TabIcon>
    ),
  },
  {
    id: "insights", label: "Insights", tourId: "project.tab.insights",
    icon: (
      <TabIcon>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="3" y1="20" x2="21" y2="20" />
      </TabIcon>
    ),
  },
];

const STATUS_BADGE = {
  ACTIVE: "clubpm-badge-active",
  PAUSED: "clubpm-badge-paused",
  COMPLETED: "clubpm-badge-completed",
  ARCHIVED: "clubpm-badge-archived",
};

// ── Progress Bar (top of tasks tab) ──────────────────────────

function ProgressBar({ tasks }) {
  const allTasks = tasks.flatMap(t => [t, ...(t.subtasks ?? [])]);
  const total = allTasks.length;
  const done = allTasks.filter((t) => t.status === "DONE").length;
  const blocked = allTasks.filter((t) => t.status === "BLOCKED").length;
  const inProgress = allTasks.filter((t) => t.status === "IN_PROGRESS").length;
  const todo = Math.max(total - done - blocked - inProgress, 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="cpm-proj-progress-row">
        <div className="cpm-progress-bar-track">
          <div
            className="cpm-progress-bar-segment"
            style={{ width: "100%", background: "var(--clubpm-surface-400)" }}
          />
        </div>
        <span className="cpm-proj-progress-pct">0%</span>
        <span className="cpm-proj-progress-stats">
          <span style={{ color: "var(--clubpm-text-muted)" }}>No tasks yet</span>
        </span>
      </div>
    );
  }

  return (
    <div className="cpm-proj-progress-row">
      <div className="cpm-progress-bar-track">
        <div
          className="cpm-progress-bar-segment"
          style={{ width: `${(done / total) * 100}%`, background: "var(--clubpm-accent-green)" }}
        />
        <div
          className="cpm-progress-bar-segment"
          style={{ width: `${(inProgress / total) * 100}%`, background: "var(--clubpm-accent-yellow)" }}
        />
        <div
          className="cpm-progress-bar-segment"
          style={{ width: `${(blocked / total) * 100}%`, background: "var(--clubpm-accent-red, #e17055)" }}
        />
        <div
          className="cpm-progress-bar-segment"
          style={{ width: `${(todo / total) * 100}%`, background: "var(--clubpm-surface-400)" }}
        />
      </div>
      <span className="cpm-proj-progress-pct">{pct}%</span>
      <span className="cpm-proj-progress-stats">
        <span style={{ color: "var(--clubpm-accent-green)" }}>■ {done}</span>
        <span style={{ color: "var(--clubpm-accent-yellow)" }}>■ {inProgress}</span>
        {blocked > 0 && <span style={{ color: "var(--clubpm-accent-red, #e17055)" }}>■ {blocked}</span>}
        <span style={{ color: "var(--clubpm-text-muted)" }}>■ {todo}</span>
      </span>
    </div>
  );
}

// ── Status Bin (collapsible droppable section) ───────────────

function StatusBin({ bin, tasks, subtasksByParent, expandedParents, onToggleParent, isOver, overTaskId, overBlockerId, onTaskClick, onAddTask, canEdit = true, sortBy = "priority", selectedTaskIds, blockedGroups, onResolveBlocker, onRenameBlocker, projectMembers }) {
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef } = useDroppable({ id: bin.id });
  const isBlockedBin = bin.id === "BLOCKED";

  return (
    <div
      ref={setNodeRef}
      data-bin-id={bin.id}
      data-tour-id={{
        TODO: "board.column.TODO",
        IN_PROGRESS: "board.column.IN_PROGRESS",
        BLOCKED: "board.column.BLOCKED",
        DONE: "board.column.DONE",
      }[bin.id]}
      className={`cpm-status-bin${isOver ? " cpm-status-bin--over" : ""}`}
    >
      <div className="cpm-status-bin-header">
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: bin.color,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <i
            className={`fas fa-chevron-${collapsed ? "right" : "down"}`}
            style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}
          />
          <span>{bin.label}</span>
          <span style={{ color: "var(--clubpm-text-muted)", fontWeight: 400 }}>
            {tasks.length}
          </span>
        </button>
        {canEdit && (
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--clubpm-text-muted)",
              fontSize: 12,
              padding: "2px 8px",
            }}
            title="Add task"
            data-tour-id={(bin.id === "TODO" ? "board.newtask" : undefined)}
            onClick={(e) => { e.stopPropagation(); onAddTask?.(bin.id); }}
          >
            <i className="fas fa-plus" /> Add Task
          </button>
        )}
      </div>

      {!collapsed && isBlockedBin ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {(blockedGroups ?? []).length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--clubpm-text-muted)", fontStyle: "italic" }}>
              Drop tasks here
            </div>
          ) : (
            blockedGroups.map((group, index) => (
              <BlockedSubBin
                key={`${group.type}-${group.id}`}
                group={group}
                tourId={(index === 0 ? "board.blocker.bin" : undefined)}
                onTaskClick={onTaskClick}
                onResolveBlocker={onResolveBlocker}
                onRenameBlocker={onRenameBlocker}
                projectMembers={projectMembers}
                selectedTaskIds={selectedTaskIds}
                canEdit={canEdit}
                isOver={overBlockerId === `blocker-${group.id}`}
              />
            ))
          )}
        </div>
      ) : !collapsed && (
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {tasks.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--clubpm-text-muted)", fontStyle: "italic" }}>
                Drop tasks here
              </div>
            ) : sortBy === "tags" ? (
              getTagGroups(tasks).map(group => (
                <React.Fragment key={group.tag?.id ?? "untagged"}>
                  <div style={{
                    padding: "6px 16px 3px",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    {group.tag ? (
                      <span style={{
                        fontSize: 10, padding: "1px 8px", borderRadius: 8, fontWeight: 600,
                        background: (group.tag.color ?? "#6c5ce7") + "22", border: `1px solid ${group.tag.color ?? "#6c5ce7"}`,
                        color: group.tag.color ?? "#6c5ce7",
                      }}>
                        {group.tag.name}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)", fontWeight: 600 }}>Untagged</span>
                    )}
                    <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>{group.tasks.length}</span>
                  </div>
                  {group.tasks.map((task) => {
                    const subs = subtasksByParent?.get(task.id) ?? [];
                    const isExpanded = expandedParents?.has(task.id) ?? false;
                    return (
                      <React.Fragment key={task.id}>
                        <CompactTaskRow
                          task={task}
                          onClick={onTaskClick}
                          subtaskCount={subs.length}
                          isExpanded={isExpanded}
                          onToggleExpand={() => onToggleParent?.(task.id)}
                          isDropTarget={overTaskId === task.id}
                          isSelected={selectedTaskIds?.has(task.id)}
                        />
                        {isExpanded && subs.map((sub) => (
                          <KanbanSubtaskRow key={sub.id} subtask={sub} onClick={onTaskClick} isDropTarget={overTaskId === sub.id} isSelected={selectedTaskIds?.has(sub.id)} />
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))
            ) : (
              tasks.map((task, index) => {
                const subs = subtasksByParent?.get(task.id) ?? [];
                const isExpanded = expandedParents?.has(task.id) ?? false;
                return (
                  <React.Fragment key={task.id}>
                    <CompactTaskRow
                      task={task}
                      tourId={(bin.id === "TODO" && index === 0 ? "board.card.first" : undefined)}
                      onClick={onTaskClick}
                      subtaskCount={subs.length}
                      isExpanded={isExpanded}
                      onToggleExpand={() => onToggleParent?.(task.id)}
                      isDropTarget={overTaskId === task.id}
                      isSelected={selectedTaskIds?.has(task.id)}
                    />
                    {isExpanded && subs.map((sub) => (
                      <KanbanSubtaskRow key={sub.id} subtask={sub} onClick={onTaskClick} isDropTarget={overTaskId === sub.id} isSelected={selectedTaskIds?.has(sub.id)} />
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

function MobileTaskRow({ task, onOpen, onMove, onAssign, canEdit, tourId }) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const overdue = due && task.status !== 'DONE' && due < new Date();
  return (
    <div className="pm-m-task-row" data-task-id={task.id} data-tour-id={tourId}>
      <button
        type="button"
        className={`pm-m-task-status pm-m-task-status--${task.status.toLowerCase()}`}
        onClick={() => canEdit ? onMove(task) : onOpen(task)}
        aria-label={canEdit ? `Status: ${BINS.find(b => b.id === task.status)?.label ?? task.status}. Move task` : `Status: ${task.status}`}
      >
        <i className={task.status === 'DONE' ? 'fas fa-check' : task.status === 'BLOCKED' ? 'fas fa-ban' : 'fas fa-circle'} aria-hidden="true" />
      </button>
      <button type="button" className="pm-m-task-main" onClick={() => onOpen(task)}>
        <span className="pm-m-task-title">{task.title}</span>
        <span className="pm-m-task-meta">
          <span className={`pm-m-task-priority pm-m-task-priority--${(task.priority ?? 'MEDIUM').toLowerCase()}`}>{(task.priority ?? 'MEDIUM').toLowerCase()}</span>
          {due ? <span className={overdue ? 'is-overdue' : ''}><i className="fas fa-calendar-day" aria-hidden="true" /> {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : <span>No due date</span>}
          {(task.subtasks?.length ?? 0) > 0 ? <span><i className="fas fa-list-check" aria-hidden="true" /> {task.subtasks.length}</span> : null}
        </span>
      </button>
      <div className="pm-m-task-actions">
        {canEdit ? (
          <>
            <button type="button" onClick={() => onMove(task)}><i className="fas fa-arrow-right-arrow-left" aria-hidden="true" /> Move</button>
            <button type="button" onClick={() => onAssign(task)}><i className="fas fa-user-plus" aria-hidden="true" /> Assign</button>
          </>
        ) : null}
        <AvatarStack assignees={task.assignees ?? []} />
      </div>
    </div>
  );
}

function CompactStatusGroup({ bin, open, onToggle, onOpenTask, onMove, onAssign, canEdit, lead = null }) {
  return (
    <section className="pm-m-task-group" data-tour-id={BIN_TOUR_IDS[bin.id]}>
      <button type="button" className="pm-m-task-group-head" onClick={onToggle} aria-expanded={open}>
        <span className="pm-m-task-group-dot" style={{ background: bin.color }} />
        <span>{bin.label}</span><span className="pm-m-count">{bin.tasks.length}</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="pm-m-task-group-body">
          {lead}
          {bin.tasks.length ? bin.tasks.map((task, index) => (
            <MobileTaskRow
              key={task.id}
              task={task}
              tourId={bin.id === 'TODO' && index === 0 ? "board.card.first" : bin.id === 'BLOCKED' && index === 0 ? "board.blocker.bin" : undefined}
              onOpen={onOpenTask}
              onMove={onMove}
              onAssign={onAssign}
              canEdit={canEdit}
            />
          )) : <div className="pm-m-task-empty">No tasks.</div>}
        </div>
      ) : null}
    </section>
  );
}

function CompactTaskFilters({ sortBy, onSort, priority, onPriority, due, onDue, showArchived, onShowArchived, onClear }) {
  return (
    <div className="pm-m-task-filter-form">
      <label><span>Sort by</span><select value={sortBy} onChange={e => onSort(e.target.value)}>
        <option value="priority">Priority</option><option value="dueDate">Due date</option><option value="created">Newest</option><option value="title">Title</option><option value="tags">Tags</option>
      </select></label>
      <label><span>Priority</span><select value={priority} onChange={e => onPriority(e.target.value)}>
        <option value="all">All priorities</option>{Object.keys(PRIORITY_RANK).map(value => <option key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</option>)}
      </select></label>
      <label><span>Due date</span><select value={due} onChange={e => onDue(e.target.value)}>
        <option value="any">Any date</option><option value="overdue">Overdue</option><option value="week">Next 7 days</option><option value="none">No due date</option>
      </select></label>
      <label className="pm-m-check"><input type="checkbox" checked={showArchived} onChange={e => onShowArchived(e.target.checked)} /> Show archived tasks</label>
      <button type="button" className="pm-m-btn" onClick={onClear}>Clear filters</button>
    </div>
  );
}

function CompactAssigneePicker({ task, members, onChange }) {
  const [query, setQuery] = useState('');
  const selected = new Set((task.assignees ?? []).map(a => a.id));
  const filtered = members.filter(pm => (pm.member?.displayName ?? '').toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="pm-m-assign-picker">
      <label className="pm-m-search"><i className="fas fa-magnifying-glass" aria-hidden="true" /><input type="search" className="pm-m-input" placeholder="Find a member" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <button type="button" className="pm-m-row" onClick={() => onChange([])}><i className="fas fa-user-slash pm-m-row-icon" aria-hidden="true" /><span className="pm-m-row-main">Nobody</span>{selected.size === 0 ? <i className="fas fa-check" aria-hidden="true" /> : null}</button>
      {filtered.map(pm => {
        const m = pm.member;
        const active = selected.has(m.id);
        return <button key={m.id} type="button" className="pm-m-row" aria-pressed={active} onClick={() => onChange(active ? [...selected].filter(id => id !== m.id) : [...selected, m.id])}><AvatarPortrait member={m} size={32} /><span className="pm-m-row-main">{m.displayName}</span>{active ? <i className="fas fa-check" aria-hidden="true" /> : null}</button>;
      })}
    </div>
  );
}

// Phone replacement for the desktop Blocked sub-bin header controls (owner
// picker, rename/recolor, Resolve). Those live on drag targets that the phone
// list does not render, so without this a category blocker could not be
// resolved, renamed or reassigned from a phone at all.
function CompactBlockerList({ groups, canEdit, onEdit, onResolve }) {
  const categories = groups.filter(g => g.type === 'category');
  if (!categories.length) return null;
  return (
    <div className="pm-m-blockers" aria-label="Blockers">
      {categories.map(g => (
        <div key={g.id} className="pm-m-blocker">
          <div className="pm-m-blocker-main">
            <i className="fas fa-tag" style={{ color: g.blocker.color || 'var(--pm-accent-coral, #e17055)' }} aria-hidden="true" />
            <div className="pm-m-blocker-text">
              <div className="pm-m-blocker-label">{g.blocker.label}</div>
              <div className="pm-m-blocker-meta">
                {g.items.length} task{g.items.length === 1 ? '' : 's'} · {g.blocker.assignee?.displayName ? `Responsible: ${g.blocker.assignee.displayName}` : 'No one responsible'}
              </div>
            </div>
          </div>
          {canEdit ? (
            <div className="pm-m-blocker-actions">
              <button type="button" className="pm-m-btn" data-m-opener={`blocker-edit-${g.id}`} onClick={() => onEdit(g.blocker)}>
                <i className="fas fa-pencil-alt" aria-hidden="true" /> Edit
              </button>
              <button type="button" className="pm-m-btn" data-m-opener={`blocker-resolve-${g.id}`} onClick={() => onResolve(g.blocker, g.items.length)}>
                <i className="fas fa-check" aria-hidden="true" /> Resolve
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// Name / colour / responsible person for a category blocker, as a phone form.
// Native <select> for the owner so the list is never clipped by the sheet.
function CompactBlockerForm({ initial = null, projectMembers = [], submitLabel, busy, onSubmit }) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [color, setColor] = useState(initial?.color || BLOCKER_SWATCHES[0]);
  const [assigneeId, setAssigneeId] = useState(initial?.assignee?.id ?? '');
  const trimmed = label.trim();
  return (
    <form className="pm-m-task-filter-form pm-m-blocker-form" onSubmit={e => { e.preventDefault(); if (trimmed && !busy) onSubmit({ label: trimmed, color, assigneeId: assigneeId || null }); }}>
      <label><div>Blocker name</div><input className="pm-m-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Waiting on parts" data-autofocus={initial ? undefined : true} /></label>
      <fieldset className="pm-m-blocker-swatches">
        <legend>Colour</legend>
        {BLOCKER_SWATCHES.map(c => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </fieldset>
      <label><div>Responsible</div><select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
        <option value="">No one</option>
        {projectMembers.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
      </select></label>
      <button type="submit" className="pm-m-btn pm-m-btn--primary" disabled={!trimmed || busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}

function CompactMilestones({ milestones = [], tasks = [], projectId }) {
  return (
    <section className="pm-m-milestones" aria-labelledby="pm-m-milestones-title" data-tour-id="project.milestones">
      <div className="pm-m-home-section-head"><h2 id="pm-m-milestones-title">Milestones</h2><Link to={`/clubpm/projects/${projectId}/gantt`}>Open timeline</Link></div>
      {milestones.length ? milestones.map(m => {
        const linked = tasks.filter(t => t.milestoneId === m.id || t.milestone?.id === m.id);
        const done = linked.filter(t => t.status === 'DONE').length;
        return <details key={m.id} className="pm-m-milestone"><summary><span>{m.title}</span><span>{done}/{linked.length}</span><i className="fas fa-chevron-down" aria-hidden="true" /></summary><div>{m.targetDate ? `Target ${new Date(m.targetDate).toLocaleDateString()}` : 'No target date'} · {(m.status ?? 'ON_TRACK').replaceAll('_', ' ').toLowerCase()}</div></details>;
      }) : <div className="pm-m-task-empty">No milestones yet.</div>}
    </section>
  );
}

// ── Blocked Sub-Bin (collapsible group within the BLOCKED column) ─

const BLOCKER_SWATCHES = ["#e17055", "#f5a623", "#00b894", "#0984e3", "#6c5ce7", "#e84393"];

// ── Blocker owner picker (single-select responsible person) ─────
// Reuses the search + avatar-list pattern from TaskModal's AssigneeEditor,
// but single-select and scoped to blockers.
function BlockerOwnerPicker({ assignee, projectMembers = [], onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  function pick(member) {
    onChange(member ? member.id : null);
    setOpen(false);
  }

  return (
    <div ref={ref} className="cpm-blocker-owner-picker" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="cpm-blocker-owner-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        title={assignee ? `Responsible: ${assignee.displayName}` : disabled ? "" : "Assign a responsible person"}
        disabled={disabled}
      >
        {assignee ? (
          assignee.avatarUrl
            ? <img src={assignee.avatarUrl} alt={assignee.displayName} className="cpm-blocker-owner-avatar" />
            : <span className="cpm-blocker-owner-avatar cpm-blocker-owner-avatar--fallback">{(assignee.displayName ?? "?")[0].toUpperCase()}</span>
        ) : !disabled ? (
          <span className="cpm-blocker-owner-avatar cpm-blocker-owner-avatar--empty"><i className="fas fa-user-plus" aria-hidden="true" /></span>
        ) : null}
        {assignee && <span className="cpm-blocker-owner-name">{assignee.displayName}</span>}
      </button>
      {open && (
        <div className="cpm-blocker-owner-dropdown">
          <input
            autoFocus
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="cpm-blocker-owner-search"
          />
          <div className="cpm-blocker-owner-list">
            {assignee && (
              <button className="cpm-blocker-owner-option" onClick={() => pick(null)}>
                <i className="fas fa-times" style={{ fontSize: 10 }} aria-hidden="true" /> Unassign
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="cpm-blocker-owner-empty">No members found</p>
            ) : filtered.map((m) => (
              <button
                key={m.id}
                className={`cpm-blocker-owner-option${assignee?.id === m.id ? " cpm-blocker-owner-option--active" : ""}`}
                onClick={() => pick(m)}
              >
                {m.avatarUrl
                  ? <img src={m.avatarUrl} alt={m.displayName} className="cpm-blocker-owner-avatar cpm-blocker-owner-avatar--sm" />
                  : <span className="cpm-blocker-owner-avatar cpm-blocker-owner-avatar--sm cpm-blocker-owner-avatar--fallback">{(m.displayName ?? "?")[0].toUpperCase()}</span>}
                <span>{m.displayName}</span>
                {assignee?.id === m.id && <i className="fas fa-check" style={{ fontSize: 10, marginLeft: "auto" }} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BlockedSubBin({ group, onTaskClick, onResolveBlocker, onRenameBlocker, projectMembers, selectedTaskIds, canEdit, isOver, tourId }) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const isCategory = group.type === "category";
  // Only category blockers accept drops (drag a task in to attach it).
  const { setNodeRef } = useDroppable({ id: isCategory ? `blocker-${group.id}` : `noop-${group.id}` });

  const [draftLabel, setDraftLabel] = useState(isCategory ? group.blocker.label : "");
  const [draftColor, setDraftColor] = useState(isCategory ? (group.blocker.color || BLOCKER_SWATCHES[0]) : BLOCKER_SWATCHES[0]);
  const [draftAssigneeId, setDraftAssigneeId] = useState(isCategory ? (group.blocker.assignee?.id ?? null) : null);

  const label = isCategory
    ? group.blocker.label
    : group.type === "task"
    ? group.blockingTask.title
    : "Other blocked tasks";
  const iconClass = isCategory ? "fa-tag" : group.type === "task" ? "fa-link" : "fa-question-circle";
  const accentColor = isCategory ? (group.blocker.color || "var(--pm-accent-coral, #e17055)") : "var(--clubpm-text-muted)";
  const draftAssignee = (projectMembers ?? []).find((m) => m.id === draftAssigneeId) ?? null;

  function startEdit(e) {
    e.stopPropagation();
    setDraftLabel(group.blocker.label);
    setDraftColor(group.blocker.color || BLOCKER_SWATCHES[0]);
    setDraftAssigneeId(group.blocker.assignee?.id ?? null);
    setEditing(true);
  }
  function saveEdit() {
    const trimmed = draftLabel.trim();
    if (!trimmed) return;
    onRenameBlocker?.(group.blocker.id, { label: trimmed, color: draftColor, assigneeId: draftAssigneeId });
    setEditing(false);
  }
  function reassignOwner(newAssigneeId) {
    onRenameBlocker?.(group.blocker.id, { assigneeId: newAssigneeId });
  }

  return (
    <div ref={setNodeRef} data-tour-id={(tourId)} className={`cpm-blocked-subbin${isOver ? " cpm-blocked-subbin--over" : ""}`}>
      {editing ? (
        <div className="cpm-blocked-subbin-edit" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            className="cpm-blocked-subbin-edit-input"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
            placeholder="Blocker name"
          />
          <div className="cpm-blocked-subbin-swatches">
            {BLOCKER_SWATCHES.map((c) => (
              <button
                key={c}
                className={`cpm-blocked-subbin-swatch${draftColor === c ? " cpm-blocked-subbin-swatch--active" : ""}`}
                style={{ background: c }}
                onClick={() => setDraftColor(c)}
                title={c}
              />
            ))}
          </div>
          <BlockerOwnerPicker
            assignee={draftAssignee}
            projectMembers={projectMembers}
            onChange={setDraftAssigneeId}
          />
          <button className="cpm-blocked-subbin-edit-save" onClick={saveEdit}>Save</button>
          <button className="cpm-blocked-subbin-edit-cancel" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div className="cpm-blocked-subbin-header" onClick={() => setCollapsed((c) => !c)}>
          <i className={`fas fa-chevron-${collapsed ? "right" : "down"}`} style={{ fontSize: 9, color: "var(--clubpm-text-muted)" }} />
          <i className={`fas ${iconClass}`} style={{ fontSize: 11, color: accentColor, flexShrink: 0 }} />
          <span className="cpm-blocked-subbin-label">{label}</span>
          <span className="cpm-blocked-subbin-count">{group.items.length}</span>
          {isCategory && (
            <BlockerOwnerPicker
              assignee={group.blocker.assignee ?? null}
              projectMembers={projectMembers}
              onChange={reassignOwner}
              disabled={!canEdit}
            />
          )}
          {isCategory && canEdit && (
            <>
              <button
                className="cpm-blocked-subbin-edit-btn"
                onClick={startEdit}
                title="Rename / recolor this blocker"
              >
                <i className="fas fa-pencil-alt" aria-hidden="true" />
              </button>
              <button
                className="cpm-blocked-subbin-resolve"
                onClick={(e) => { e.stopPropagation(); onResolveBlocker?.(group.blocker.id); }}
                title="Resolve this blocker for all attached tasks"
              >
                Resolve
              </button>
            </>
          )}
        </div>
      )}
      {!collapsed && (
        <div className="cpm-blocked-subbin-body">
          {group.items.length === 0 ? (
            <div className="cpm-blocked-subbin-empty">
              {isCategory ? "Drag a task here to mark it blocked by this" : "No tasks"}
            </div>
          ) : group.items.map(({ task, reason }) => (
            <BlockedTaskRow
              key={task.id}
              task={task}
              reason={reason}
              groupId={group.id}
              selected={selectedTaskIds?.has(task.id)}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A blocked task row. Registered as a droppable (id = task.id) so an assignee
// chip can be dropped directly onto it, matching the other kanban columns.
function BlockedTaskRow({ task, reason, selected, onTaskClick, groupId }) {
  // Namespaced id (a task can appear under several blocker groups at once, and
  // dnd-kit droppable ids are global — so plain task.id would collide). The real
  // task id travels in `data` for the drop handler to read back.
  const { setNodeRef, isOver } = useDroppable({ id: `btask-${groupId}-${task.id}`, data: { taskId: task.id } });
  return (
    <div
      ref={setNodeRef}
      className={`cpm-task-row-compact cpm-blocked-task-row${selected ? " cpm-task-row-compact--selected" : ""}${isOver ? " cpm-task-row-compact--member-target" : ""}`}
      onClick={(e) => onTaskClick(task, e)}
    >
      {selected && (
        <i className="fas fa-check-circle cpm-task-row-compact-checkbox" aria-hidden="true" />
      )}
      <PriorityBars priority={task.priority} />
      <span className="cpm-task-row-compact-name">{task.title}</span>
      <AvatarStack assignees={task.assignees} />
      {reason && <span className="cpm-blocked-task-reason" title={reason}>{reason}</span>}
    </div>
  );
}

// ── Blocker name modal (shown when a task is dropped on the Blocked bin) ─

function BlockerNameModal({ count, projectMembers, onCreate, onCancel }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(BLOCKER_SWATCHES[0]);
  const [assigneeId, setAssigneeId] = useState(null);
  const assignee = (projectMembers ?? []).find((m) => m.id === assigneeId) ?? null;
  function submit() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onCreate(trimmed, color, assigneeId);
  }
  return createPortal(
    <div className="cpm-blocker-modal-overlay" onMouseDown={onCancel}>
      <div className="cpm-blocker-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="cpm-blocker-modal-title">
          What's blocking {count > 1 ? `these ${count} tasks` : "this task"}?
        </h3>
        <input
          autoFocus
          className="cpm-blocker-modal-input"
          placeholder="e.g. Waiting on parts, Needs review…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        />
        <div className="cpm-blocked-subbin-swatches" style={{ marginTop: 12 }}>
          {BLOCKER_SWATCHES.map((c) => (
            <button
              key={c}
              className={`cpm-blocked-subbin-swatch${color === c ? " cpm-blocked-subbin-swatch--active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
        <div className="cpm-blocker-modal-owner" style={{ marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginRight: 8 }}>Responsible:</span>
          <BlockerOwnerPicker assignee={assignee} projectMembers={projectMembers} onChange={setAssigneeId} />
        </div>
        <div className="cpm-blocker-modal-actions">
          <button className="cpm-blocker-modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="cpm-blocker-modal-create" onClick={submit} disabled={!label.trim()}>
            Create blocker
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Compact Task Row ─────────────────────────────────────────

function CompactTaskRow({ task, onClick, subtaskCount = 0, isExpanded = false, onToggleExpand, isDropTarget = false, isSelected = false, tourId }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-tour-id={(tourId)}
      className={`cpm-task-row-compact${isDropTarget ? " cpm-task-row-compact--member-target" : ""}${isSelected ? " cpm-task-row-compact--selected" : ""}`}
      onClick={(e) => {
        if (!isDragging) onClick(task, e);
      }}
    >
      {isSelected && (
        <i className="fas fa-check-circle cpm-task-row-compact-checkbox" aria-hidden="true" />
      )}
      <i
        className="fas fa-grip-vertical"
        style={{
          color: "var(--clubpm-text-muted)",
          fontSize: 11,
          flexShrink: 0,
          pointerEvents: "none",
        }}
      />
      <span
        className={`cpm-kanban-progress ${
          task.status === "DONE"
            ? "cpm-kanban-progress--done"
            : task.status === "IN_PROGRESS" || task.status === "BLOCKED"
            ? "cpm-kanban-progress--in"
            : "cpm-kanban-progress--none"
        }`}
        style={{ flexShrink: 0 }}
      >
        {task.status === "DONE" && <i className="fas fa-check" style={{ fontSize: 6 }} />}
      </span>
      <PriorityBars priority={task.priority} />
      <span className="cpm-task-row-compact-name">{task.title}</span>
      {subtaskCount > 0 && (
        <button
          onClick={e => { e.stopPropagation(); onToggleExpand?.(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--clubpm-text-muted)", fontSize: 10, padding: "2px 4px",
            display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
          }}
          title={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
        >
          <i className={`fas fa-chevron-${isExpanded ? "up" : "down"}`} />
          {subtaskCount}
        </button>
      )}
      <AvatarStack assignees={task.assignees} />
      {task.dueDate && (
        <span
          style={{
            fontSize: 11,
            color: "var(--clubpm-text-muted)",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {new Date(task.dueDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      )}
      {task.tags && task.tags.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {task.tags.slice(0, 2).map(tag => (
            <span key={tag.id} title={tag.name} style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 8,
              background: tag.color + "22", border: `1px solid ${tag.color}`,
              color: tag.color, whiteSpace: "nowrap",
            }}>
              {tag.name}
            </span>
          ))}
          {task.tags.length > 2 && (
            <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>+{task.tags.length - 2}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Kanban Subtask Row (non-draggable, indented) ─────────────

function KanbanSubtaskRow({ subtask, onClick, isDropTarget = false, isSelected = false }) {
  const { setNodeRef } = useDroppable({ id: subtask.id });
  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      <div style={{ width: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>
        <div style={{ width: 1, height: "100%", background: "var(--clubpm-border)", position: "relative" }}>
          <div style={{ position: "absolute", bottom: "50%", left: 0, width: 16, height: 1, background: "var(--clubpm-border)" }} />
        </div>
      </div>
    <div
      ref={setNodeRef}
      className={`cpm-task-row-compact${isDropTarget ? " cpm-task-row-compact--member-target" : ""}${isSelected ? " cpm-task-row-compact--selected" : ""}`}
      style={{ flex: 1, paddingLeft: 8, cursor: "pointer" }}
      onClick={(e) => onClick(subtask, e)}
    >
      {isSelected && (
        <i className="fas fa-check-circle cpm-task-row-compact-checkbox" aria-hidden="true" />
      )}
      <span
        className={`cpm-kanban-progress ${
          subtask.status === "DONE"
            ? "cpm-kanban-progress--done"
            : subtask.status === "IN_PROGRESS" || subtask.status === "BLOCKED"
            ? "cpm-kanban-progress--in"
            : "cpm-kanban-progress--none"
        }`}
        style={{ flexShrink: 0 }}
      >
        {subtask.status === "DONE" && <i className="fas fa-check" style={{ fontSize: 6 }} />}
      </span>
      <PriorityBars priority={subtask.priority} />
      <span className="cpm-task-row-compact-name" style={{ color: "var(--clubpm-text-secondary)" }}>
        {subtask.title}
      </span>
      <AvatarStack assignees={subtask.assignees} />
      {subtask.dueDate && (
        <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
          {new Date(subtask.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
    </div>
    </div>
  );
}

// ── Assignee Panel (right column) ────────────────────────────

function AssigneePanel({ members, channelMemberSlackIds = [], hasLinkedChannel = false, selectedMemberIds, onMemberClick }) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = members;

    if (hasLinkedChannel && channelMemberSlackIds.length > 0) {
      const idSet = new Set(channelMemberSlackIds);
      list = list.filter(pm => idSet.has(pm.member?.slackId));
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((pm) =>
      (pm.member?.displayName ?? "").toLowerCase().includes(q)
    );
  }, [members, channelMemberSlackIds, hasLinkedChannel, search]);

  return (
    <aside className="cpm-assignee-panel">
      <div className="cpm-assignee-panel-header">
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--clubpm-text-primary)" }}>
          Members
        </span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--clubpm-text-muted)",
            padding: 4,
          }}
          aria-label="Toggle members panel"
        >
          <i
            className={`fas fa-chevron-${collapsed ? "left" : "right"}`}
            style={{ fontSize: 11 }}
          />
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: "8px 12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--clubpm-text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Assignees
          </div>
          {hasLinkedChannel && (
            <div style={{ fontSize: 10, color: "var(--clubpm-text-muted)", padding: "0 0 4px" }}>
              Showing channel members only
            </div>
          )}
          <div style={{ display: "flex", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--clubpm-border)" }}>
            <DraggableSpecialChip
              id="special-everyone"
              label="Everyone"
              iconClass="fas fa-users"
              accentColor="var(--clubpm-accent-primary)"
            />
            <DraggableSpecialChip
              id="special-nobody"
              label="Nobody"
              iconClass="fas fa-ban"
              accentColor="var(--pm-accent-coral)"
            />
          </div>
          <input
            type="text"
            className="cpm-assignee-search"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div data-tour-id="board.memberchips" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--clubpm-text-muted)", padding: "4px 0" }}>
                No members
              </p>
            ) : (
              filtered.map((pm) => (
                <DraggableMemberChip
                  key={pm.memberId}
                  pm={pm}
                  selected={selectedMemberIds.has(pm.memberId)}
                  onClick={onMemberClick}
                />
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function ChipAvatar({ member }) {
  return <AvatarPortrait member={member} size={18} />;
}

function DraggableSpecialChip({ id, label, iconClass, accentColor }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: "special", specialId: id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cpm-assignee-chip"
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderColor: accentColor,
        background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
      }}
    >
      <i className={iconClass} style={{ fontSize: 11, color: accentColor, flexShrink: 0 }} aria-hidden="true" />
      <span className="cpm-assignee-chip-name" style={{ color: accentColor }}>{label}</span>
    </div>
  );
}

function DraggableMemberChip({ pm, selected, onClick }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${pm.memberId}`,
    data: { type: "member", memberId: pm.memberId },
  });

  const isAdmin = pm.member?.isAdmin || pm.isAdmin;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cpm-assignee-chip${selected ? " cpm-assignee-chip--selected" : ""}`}
      aria-pressed={selected}
      title="Drag to assign. Ctrl/Cmd-click to add or remove from a group."
      onClick={(event) => onClick(pm.memberId, event)}
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderColor: isAdmin ? "#f9ca24" : undefined,
      }}
    >
      <ChipAvatar member={pm.member} />
      <span className="cpm-assignee-chip-name">
        {pm.member.displayName}
        {isAdmin && " 👑"}
      </span>
    </div>
  );
}

// ── Add Task Modal (project-scoped) ──────────────────────────

const PRIORITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function AddProjectTaskModal({ projectId, initialStatus, projectMembers, onClose, onCreated }) {
  const compact = useCompactLayout();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState(null);
  const [milestoneId, setMilestoneId] = useState("");
  const [milestones, setMilestones] = useState([]);
  const [tags, setTags]               = useState([]);
  const [projectTags, setProjectTags] = useState([]);
  const [newTagName, setNewTagName]   = useState("");
  const [newTagColor, setNewTagColor] = useState("#6c5ce7");
  const [creatingTag, setCreatingTag] = useState(false);

  useEffect(() => {
    get(`/api/milestones/project/${projectId}`)
      .then(ms => setMilestones(
        ms.filter(m => m.status !== "COMPLETED" && m.status !== "CANCELLED")
      ))
      .catch(() => {});
    get(`/api/projects/${projectId}/tags`).then(setProjectTags).catch(() => {});
  }, [projectId]);

  function addTag(tag) {
    if (!tag) return;
    setTags(prev => {
      if (prev.length >= 5 || prev.some(t => t.id === tag.id)) return prev;
      return [...prev, tag];
    });
  }
  function removeTag(tagId) {
    setTags(prev => prev.filter(t => t.id !== tagId));
  }
  async function createTag() {
    if (!newTagName.trim() || creatingTag || tags.length >= 5) return;
    setCreatingTag(true);
    try {
      const tag = await post(`/api/projects/${projectId}/tags`, { name: newTagName.trim(), color: newTagColor });
      setProjectTags(prev => [...prev, tag]);
      addTag(tag);
      setNewTagName("");
    } catch (err) {
      console.error("Failed to create tag:", err);
    } finally { setCreatingTag(false); }
  }

  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
    background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
    color: "var(--clubpm-text-primary)", outline: "none", boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 600, color: "var(--clubpm-text-muted)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5,
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || saving || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const newTask = await post(`/api/projects/${projectId}/tasks`, {
        title: title.trim(),
        priority,
        status: initialStatus,
        dueDate: dueDate || undefined,
        milestoneId: milestoneId || undefined,
        tagIds: tags.map(t => t.id),
      });
      onCreated(newTask);
      onClose();
    } catch (err) {
      setError(err.message ?? "Failed to create task");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  const panel = (
      <div data-tour-id="task.create.modal" className="pm-m-task-create"
        style={{ background: "var(--clubpm-surface-100)", borderRadius: 12, width: "min(480px, 94vw)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: "1px solid var(--clubpm-border)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid var(--clubpm-border)", background: "var(--clubpm-surface-200)" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--clubpm-text-primary)" }}>
            <i className="fas fa-plus" style={{ marginRight: 8, color: "var(--clubpm-accent-primary)" }} />
            New Task
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer",
            color: "var(--clubpm-text-muted)", fontSize: 16, padding: "2px 6px" }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div data-tour-id="task.create.title">
              <label style={labelStyle}>Task Title *</label>
              <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                placeholder="What needs to be done?" style={inputStyle} required />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  {PRIORITY_LEVELS.map(p => (
                    <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>
            {milestones.length > 0 && (
              <div>
                <label style={labelStyle}>Milestone</label>
                <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">— None —</option>
                  {milestones.map(m => (
                    <option key={m.id} value={m.id}>
                      🎯 {m.title} ({(m.status ?? "ON_TRACK").replace("_", " ")})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>
                Tags {tags.length > 0 && (
                  <span style={{ color: "var(--clubpm-text-muted)", fontWeight: 400, textTransform: "none" }}>({tags.length}/5)</span>
                )}
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                {tags.map(tag => (
                  <span key={tag.id} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 8px", borderRadius: 10, fontSize: 11,
                    background: tag.color + "22", border: `1px solid ${tag.color}`, color: tag.color,
                  }}>
                    {tag.name}
                    <button type="button" onClick={() => removeTag(tag.id)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: tag.color, fontSize: 12, padding: 0, lineHeight: 1,
                    }}>×</button>
                  </span>
                ))}
              </div>
              {tags.length < 5 && (
                <>
                  {projectTags.filter(pt => !tags.some(t => t.id === pt.id)).length > 0 && (
                    <select
                      value=""
                      onChange={e => { const t = projectTags.find(x => x.id === e.target.value); if (t) addTag(t); }}
                      style={{ ...inputStyle, cursor: "pointer", marginBottom: 6 }}
                    >
                      <option value="">+ Add existing tag</option>
                      {projectTags.filter(pt => !tags.some(t => t.id === pt.id))
                        .map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                    </select>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="text" placeholder="New tag name" value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); createTag(); } }}
                      style={{ ...inputStyle, flex: 1 }} />
                    <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                      style={{ width: 38, padding: 2, borderRadius: 6, cursor: "pointer",
                        border: "1px solid var(--clubpm-border)", background: "transparent" }} />
                    <button type="button" onClick={createTag} disabled={!newTagName.trim() || creatingTag}
                      style={{ padding: "7px 14px", borderRadius: 7, border: "none",
                        background: "var(--clubpm-accent-primary)", color: "#fff", fontSize: 13,
                        cursor: newTagName.trim() && !creatingTag ? "pointer" : "default",
                        opacity: newTagName.trim() && !creatingTag ? 1 : 0.5 }}>
                      {creatingTag ? "…" : "Create"}
                    </button>
                  </div>
                </>
              )}
              {tags.length >= 5 && (
                <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)" }}>Max 5 tags</span>
              )}
            </div>
            {error && (
              <p style={{ fontSize: 12, color: "#e17055", background: "rgba(225,112,85,0.1)",
                borderRadius: 6, padding: "6px 10px", margin: 0 }}>{error}</p>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8,
            padding: "12px 20px", background: "var(--clubpm-surface-200)", borderTop: "1px solid var(--clubpm-border)" }}>
            <button type="button" onClick={onClose} style={{ padding: "7px 16px", borderRadius: 7,
              border: "1px solid var(--clubpm-border)", background: "none",
              color: "var(--clubpm-text-secondary)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: "7px 18px", borderRadius: 7,
              border: "none", cursor: "pointer", background: "var(--clubpm-accent-primary)",
              color: "#fff", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
  );
  if (compact) return <MobileSheet title="New task" variant="fullscreen" onClose={onClose} className="pm-m-task-create-layer">{panel}</MobileSheet>;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>{panel}</div>,
    document.body
  );
}

// ── Slack Channel Picker ─────────────────────────────────────

function SlackChannelPicker({ project, channels, channelsState, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(project.slackChannelId ?? "");

  useEffect(() => {
    setSelected(project.slackChannelId ?? "");
  }, [project.slackChannelId]);

  const { loaded, error: loadError, warning, needsAuth } = channelsState ?? {};

  // The linked channel may not be in the list the current viewer can see (e.g.
  // a private channel linked by someone else). Show it anyway so the picker
  // never renders blank for a project that IS linked.
  const options = useMemo(() => {
    const list = [...channels];
    if (project.slackChannelId && !list.some(c => c.id === project.slackChannelId)) {
      list.unshift({
        id: project.slackChannelId,
        name: project.slackChannelName ?? "linked channel",
        botIsMember: true,
      });
    }
    return list;
  }, [channels, project.slackChannelId, project.slackChannelName]);

  const handleChange = async (e) => {
    const channelId = e.target.value;
    const ch = options.find(c => c.id === channelId);
    setSelected(channelId);
    setError("");
    setSaving(true);
    try {
      if (channelId && ch && ch.botIsMember === false) {
        setStatus("Inviting bot…");
        try {
          await post(`/api/slack/channels/${channelId}/invite-bot`, {});
        } catch (inviteErr) {
          const code = inviteErr?.message ?? "unknown_error";
          setError(`Could not invite bot (${code}). Run \`/invite @Club PM\` in #${ch.name} then retry.`);
          setSelected(project.slackChannelId ?? "");
          return;
        }
      }
      setStatus("Saving…");
      await patch(`/api/projects/${project.id}`, {
        slackChannelId:   channelId || null,
        slackChannelName: ch?.name  || null,
      });
      onSaved();
    } catch (err) {
      console.error("Failed to save linked channel", err);
      setError(err?.message ?? "Failed to save linked channel");
      setSelected(project.slackChannelId ?? "");
    } finally {
      setSaving(false);
      setStatus("");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <i className="fab fa-slack" style={{ fontSize: 12, color: "var(--clubpm-text-muted)" }} />
        <select
          value={selected}
          onChange={handleChange}
          disabled={saving}
          style={{
            fontSize: 11,
            padding: "3px 6px",
            borderRadius: 5,
            background: "var(--clubpm-surface-300)",
            border: "1px solid var(--clubpm-border)",
            color: selected ? "var(--clubpm-text-primary)" : "var(--clubpm-text-muted)",
            cursor: "pointer",
          }}
        >
          <option value="">
            {!loaded ? "Loading channels…" : "— Link Slack channel —"}
          </option>
          {options.map(ch => (
            <option key={ch.id} value={ch.id}>
              #{ch.name}{ch.botIsMember === false ? " (bot not in channel)" : ""}
            </option>
          ))}
        </select>
        {saving && <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>{status}</span>}
      </div>
      {error && (
        <span style={{ fontSize: 10, color: "var(--clubpm-accent-danger, #e06c75)" }}>{error}</span>
      )}
      {!error && loaded && loadError && (
        <span style={{ fontSize: 10, color: "var(--clubpm-accent-danger, #e06c75)" }}>
          {loadError}
        </span>
      )}
      {!error && loaded && !loadError && warning && (
        <span style={{ fontSize: 10, color: "var(--pm-accent-amber)" }}>{warning}</span>
      )}
      {loaded && needsAuth && (
        <a
          href={
            `${process.env.REACT_APP_API_URL || ""}/auth/slack` +
            `?returnTo=${encodeURIComponent(`/clubpm/projects/${project.id}`)}`
          }
          style={{ fontSize: 10, color: "var(--pm-accent-teal)" }}
        >
          Reconnect Slack
        </a>
      )}
    </div>
  );
}

// ── Suggested Task Card ───────────────────────────────────────

const SUGGESTED_PRIORITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function SuggestedTaskCard({ task, projectId, onAccepted, onDismiss }) {
  const [title, setTitle] = useState(task.title ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.split("T")[0] : "");
  const [saving, setSaving] = useState(false);

  const fieldStyle = {
    width: "100%", padding: "6px 8px", borderRadius: 5, fontSize: 12,
    background: "var(--clubpm-surface-200)", border: "1px solid var(--clubpm-border)",
    color: "var(--clubpm-text-primary)", outline: "none", boxSizing: "border-box",
  };

  async function handleAccept() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await post(`/api/projects/${projectId}/parse-drive/confirm`, {
        tasks: [{
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          suggestedAssigneeName: task.suggestedAssigneeName ?? task.assigneeName ?? undefined,
        }],
      });
      onAccepted();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  return (
    <div style={{
      background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
      borderRadius: 8, padding: 12, marginBottom: 10,
    }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Task title"
          style={{ ...fieldStyle, flex: 1, fontWeight: 600 }}
        />
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer",
            color: "var(--clubpm-text-muted)", fontSize: 18, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          title="Dismiss suggestion"
        >×</button>
      </div>
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        style={{ ...fieldStyle, resize: "vertical", marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select value={priority} onChange={e => setPriority(e.target.value)}
          style={{ ...fieldStyle, flex: 1, cursor: "pointer" }}>
          {SUGGESTED_PRIORITY_LEVELS.map(p => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          style={{ ...fieldStyle, flex: 1 }} />
      </div>
      {(task.suggestedAssigneeName || task.assigneeName) && (
        <div style={{ fontSize: 11, color: "var(--clubpm-text-muted)", marginBottom: 8 }}>
          Suggested assignee: {task.suggestedAssigneeName ?? task.assigneeName}
        </div>
      )}
      <button
        onClick={handleAccept}
        disabled={saving || !title.trim()}
        className="clubpm-btn-primary"
        style={{ fontSize: 12, padding: "5px 14px", opacity: !title.trim() ? 0.6 : 1 }}
      >
        {saving ? "Adding…" : "Accept"}
      </button>
    </div>
  );
}

// ── AI Panel ─────────────────────────────────────────────────

function AiPanel({ project, allMembers, projectBlockers, onActionPlanExecuted }) {
  const compact = useCompactLayout();
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState(null);
  const [qaLoading, setQaLoading] = useState(false);

  const [driveUrl, setDriveUrl] = useState(project.driveLink ?? "");
  const [driveLoading, setDriveLoading] = useState(false);
  const [drivePreview, setDrivePreview] = useState(null);
  const [driveError, setDriveError] = useState(null);
  const [driveSuggestedCount, setDriveSuggestedCount] = useState(5);

  const [meetingNotes, setMeetingNotes] = useState("");
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingPreview, setMeetingPreview] = useState(null);
  const [meetingExpanded, setMeetingExpanded] = useState(false);
  const [meetingSuggestedCount, setMeetingSuggestedCount] = useState(5);

  const [riskData, setRiskData] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const [sprintData, setSprintData] = useState(null);
  const [sprintLoading, setSprintLoading] = useState(false);

  const [capacityData, setCapacityData] = useState(null);
  const [capacityLoading, setCapacityLoading] = useState(false);

  async function handleQa(e) {
    e.preventDefault();
    if (!qaQuestion.trim()) return;
    setQaLoading(true);
    setQaAnswer(null);
    try {
      const data = await post(`/api/projects/${project.id}/ask`, { question: qaQuestion });
      setQaAnswer(data.answer);
    } catch (err) { setQaAnswer("❌ Failed to get answer."); }
    finally { setQaLoading(false); }
  }

  async function handleParseDrive() {
    if (!driveUrl.trim()) return;
    setDriveLoading(true);
    setDrivePreview(null);
    setDriveError(null);
    try {
      const data = await post(`/api/projects/${project.id}/parse-drive`, {
        driveUrl,
        suggestedTaskCount: driveSuggestedCount,
      });
      setDrivePreview(data);
    } catch (err) {
      setDriveError(err.message ?? "Failed to parse Drive file");
    } finally { setDriveLoading(false); }
  }

  async function handleParseMeeting() {
    if (!meetingNotes.trim()) return;
    setMeetingLoading(true);
    setMeetingPreview(null);
    try {
      const data = await post(`/api/projects/${project.id}/parse-meeting-notes`, {
        notes: meetingNotes,
        suggestedTaskCount: meetingSuggestedCount,
      });
      setMeetingPreview(data);
    } catch (err) { console.error(err); }
    finally { setMeetingLoading(false); }
  }

  const cardStyle = {
    background: "var(--clubpm-surface-200)",
    border: "1px solid var(--clubpm-border)",
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
  };

  const inputStyle = {
    width: "100%",
    background: "var(--clubpm-surface-300)",
    border: "1px solid var(--clubpm-border)",
    borderRadius: 6,
    color: "var(--clubpm-text-primary)",
    fontSize: 13,
    padding: "8px 10px",
    boxSizing: "border-box",
  };

  const sectionLabelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--clubpm-text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
  };

  const countInputStyle = {
    width: 64, padding: "6px 8px", borderRadius: 5, fontSize: 12, textAlign: "center",
    background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
    color: "var(--clubpm-text-primary)", outline: "none",
  };

  return (
    <div className="cpm-ai-panel" style={compact ? { padding: "12px 16px 24px" } : { padding: "24px", maxWidth: 780 }}>
      <h3 style={{
        fontSize: 15, fontWeight: 700, color: "var(--clubpm-text-primary)", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {AI_TAB_ICON}
        AI Assistant
      </h3>

      {/* Section 1: Project Q&A */}
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Project Assistant</div>
        <form onSubmit={handleQa} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={qaQuestion}
            onChange={e => setQaQuestion(e.target.value)}
            placeholder='Ask anything: "Who is working on auth?" or "What are we behind on?"'
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="submit" disabled={qaLoading || !qaQuestion.trim()} className="clubpm-btn-primary"
            style={{ fontSize: 13, padding: "7px 16px", whiteSpace: "nowrap" }}>
            {qaLoading ? "…" : "Ask"}
          </button>
        </form>
        {qaAnswer && (
          <div style={{ marginTop: 12, padding: 12, background: "var(--clubpm-surface-300)", borderRadius: 8,
                        fontSize: 13, color: "var(--clubpm-text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {qaAnswer}
          </div>
        )}
      </div>

      {/* Section 1.5: Agentic Action Plan */}
      <ActionPlanReview
        projectId={project.id}
        project={project}
        allMembers={allMembers}
        projectBlockers={projectBlockers}
        onExecuted={onActionPlanExecuted}
      />

      {/* Section 2: Document Intelligence */}
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Document Intelligence</div>

        {/* Drive parsing */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clubpm-text-primary)", marginBottom: 8 }}>
            Parse Drive Document
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={driveUrl}
              onChange={e => setDriveUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: "var(--clubpm-text-muted)", whiteSpace: "nowrap" }}>
              Suggested tasks:
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={driveSuggestedCount}
              onChange={e => setDriveSuggestedCount(Math.max(1, parseInt(e.target.value) || 1))}
              style={countInputStyle}
            />
            <button
              onClick={handleParseDrive}
              disabled={driveLoading || !driveUrl.trim()}
              className="clubpm-btn-primary"
              style={{ fontSize: 13, padding: "7px 16px", whiteSpace: "nowrap" }}
            >
              {driveLoading ? "Parsing…" : "Parse"}
            </button>
          </div>
          {driveError && (
            <p style={{ fontSize: 12, color: "#e17055", background: "rgba(225,112,85,0.1)", borderRadius: 6, padding: "6px 10px", marginTop: 8 }}>
              {driveError}
            </p>
          )}
          {drivePreview?.tasks?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginBottom: 10 }}>
                Found {drivePreview.tasks.length} suggested task(s) from <strong>{drivePreview.sourceFileName}</strong>. Edit and accept each one:
              </div>
              {drivePreview.tasks.map((task, i) => (
                <SuggestedTaskCard
                  key={i}
                  task={task}
                  projectId={project.id}
                  onAccepted={() => setDrivePreview(prev => ({
                    ...prev,
                    tasks: prev.tasks.filter((_, idx) => idx !== i),
                  }))}
                  onDismiss={() => setDrivePreview(prev => ({
                    ...prev,
                    tasks: prev.tasks.filter((_, idx) => idx !== i),
                  }))}
                />
              ))}
              {drivePreview.tasks.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)" }}>All suggestions handled.</div>
              )}
            </div>
          )}
        </div>

        {/* Meeting notes (collapsible) */}
        <div>
          <button onClick={() => setMeetingExpanded(p => !p)}
            style={{ background: "none", border: "none", fontSize: 13, fontWeight: 600,
                     color: "var(--clubpm-accent-primary)", cursor: "pointer", padding: 0 }}>
            {meetingExpanded ? "▼" : "▶"} Paste Meeting Notes
          </button>
          {meetingExpanded && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={meetingNotes}
                onChange={e => setMeetingNotes(e.target.value)}
                placeholder="Paste meeting notes here…"
                rows={6}
                style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: "var(--clubpm-text-muted)", whiteSpace: "nowrap" }}>
                  Suggested tasks:
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={meetingSuggestedCount}
                  onChange={e => setMeetingSuggestedCount(Math.max(1, parseInt(e.target.value) || 1))}
                  style={countInputStyle}
                />
                <button
                  onClick={handleParseMeeting}
                  disabled={meetingLoading || !meetingNotes.trim()}
                  className="clubpm-btn-primary"
                  style={{ fontSize: 13, padding: "7px 16px", whiteSpace: "nowrap" }}
                >
                  {meetingLoading ? "Parsing…" : "Extract Action Items"}
                </button>
              </div>
              {meetingPreview?.tasks?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {meetingPreview.summary && (
                    <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--clubpm-text-muted)", marginBottom: 10 }}>
                      {meetingPreview.summary}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginBottom: 10 }}>
                    {meetingPreview.tasks.length} suggested task(s). Edit and accept each one:
                  </div>
                  {meetingPreview.tasks.map((task, i) => (
                    <SuggestedTaskCard
                      key={i}
                      task={task}
                      projectId={project.id}
                      onAccepted={() => setMeetingPreview(prev => ({
                        ...prev,
                        tasks: prev.tasks.filter((_, idx) => idx !== i),
                      }))}
                      onDismiss={() => setMeetingPreview(prev => ({
                        ...prev,
                        tasks: prev.tasks.filter((_, idx) => idx !== i),
                      }))}
                    />
                  ))}
                  {meetingPreview.tasks.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)" }}>All suggestions handled.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: AI Insights Dashboard */}
      <div style={sectionLabelStyle}>AI Insights</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        {/* Risk Card */}
        <div style={{ ...cardStyle, flex: "1 1 220px", marginBottom: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--clubpm-text-primary)" }}>🔴 Risk Analysis</div>
          {riskData ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: riskData.overallRisk === "CRITICAL" ? "#e17055" : riskData.overallRisk === "HIGH" ? "#fdcb6e" : riskData.overallRisk === "MEDIUM" ? "#74b9ff" : "#55efc4" }}>
                {riskData.overallRisk} — {riskData.riskScore}/100
              </div>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginTop: 4 }}>{riskData.topRecommendation}</div>
              {riskData.risks?.slice(0, 3).map((r, i) => (
                <div key={i} style={{ fontSize: 11, marginTop: 6, color: "var(--clubpm-text-secondary)" }}>• {r.description}</div>
              ))}
            </div>
          ) : (
            <button onClick={async () => { setRiskLoading(true); try { const d = await post(`/api/projects/${project.id}/ai-risks`, {}); setRiskData(d); } catch (e) { console.error(e); } finally { setRiskLoading(false); } }}
              disabled={riskLoading} className="clubpm-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}>
              {riskLoading ? "Analyzing…" : "Run Risk Analysis"}
            </button>
          )}
        </div>

        {/* Sprint Plan Card */}
        <div style={{ ...cardStyle, flex: "1 1 220px", marginBottom: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--clubpm-text-primary)" }}>🏃 Sprint Plan</div>
          {sprintData ? (
            <div>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginBottom: 6 }}>{sprintData.focusTheme}</div>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-secondary)" }}>{sprintData.totalPoints} pts • {sprintData.sprintTasks?.length ?? 0} tasks</div>
              {sprintData.risksInPlan?.length > 0 && (
                <div style={{ fontSize: 11, color: "#fdcb6e", marginTop: 4 }}>⚠️ {sprintData.risksInPlan[0]}</div>
              )}
            </div>
          ) : (
            <button onClick={async () => { setSprintLoading(true); try { const d = await post(`/api/projects/${project.id}/sprint-plan`, {}); setSprintData(d); } catch (e) { console.error(e); } finally { setSprintLoading(false); } }}
              disabled={sprintLoading} className="clubpm-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}>
              {sprintLoading ? "Planning…" : "Generate Sprint Plan"}
            </button>
          )}
        </div>

        {/* Capacity Card */}
        <div style={{ ...cardStyle, flex: "1 1 220px", marginBottom: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--clubpm-text-primary)" }}>⚖️ Capacity</div>
          {capacityData ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: capacityData.balanceScore >= 75 ? "#55efc4" : capacityData.balanceScore >= 50 ? "#fdcb6e" : "#e17055" }}>
                Balance: {capacityData.balanceScore}/100
              </div>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginTop: 4 }}>{capacityData.summary}</div>
              {capacityData.overloaded?.slice(0, 2).map((o, i) => (
                <div key={i} style={{ fontSize: 11, color: "#e17055", marginTop: 4 }}>⚠️ {o.member}</div>
              ))}
            </div>
          ) : (
            <button onClick={async () => { setCapacityLoading(true); try { const d = await post(`/api/projects/${project.id}/capacity-analysis`, {}); setCapacityData(d); } catch (e) { console.error(e); } finally { setCapacityLoading(false); } }}
              disabled={capacityLoading} className="clubpm-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}>
              {capacityLoading ? "Analyzing…" : "Analyze Capacity"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drive Folder Pill (header chip with admin edit) ──────────

function DriveFolderPill({ project, isAdmin, onPreview, onSaved }) {
  const [editing, setEditing] = useState(false);
  const link = project.driveLink ?? null;
  const parsed = link ? parseDriveUrl(link) : null;
  const isFolder = parsed?.kind === "folder";

  if (!link) {
    if (!isAdmin) return null;
    return (
      <>
        <button
          type="button"
          className="cpm-drive-pill cpm-drive-pill-add"
          onClick={() => setEditing(true)}
          title="Link a Drive folder to this project"
        >
          <i className="fab fa-google-drive" aria-hidden="true" />
          <span>+ Link Drive folder</span>
        </button>
        {editing && (
          <EditDriveFolderModal
            projectId={project.id}
            currentLink={null}
            onClose={() => setEditing(false)}
            onSaved={onSaved}
          />
        )}
      </>
    );
  }

  return (
    <>
      <span className="cpm-drive-pill" title={link}>
        <i className="fab fa-google-drive" style={{ color: "#4285F4" }} aria-hidden="true" />
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="cpm-drive-pill-link"
        >
          {isFolder ? "Drive folder" : parsed ? getTypeMeta(parsed.kind).label : "Drive link"}
        </a>
        <button
          type="button"
          onClick={() => onPreview(link)}
          className="cpm-drive-pill-action"
          title="Preview"
          aria-label="Preview Drive link"
        >
          <i className="fas fa-eye" aria-hidden="true" />
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="cpm-drive-pill-action"
            title="Change Drive folder"
            aria-label="Change Drive folder"
          >
            <i className="fas fa-pen" aria-hidden="true" />
          </button>
        )}
      </span>
      {editing && (
        <EditDriveFolderModal
          projectId={project.id}
          currentLink={link}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

// ── Files Tab Panel (view-only link to the project's linked Drive folder) ────
//
// The Files tab is intentionally read-only: it surfaces the human-managed Drive
// folder linked to the project (`project.driveLink`) and links out to it. The
// bot's drive.file OAuth scope can't list a folder it didn't create, so
// browsing/adding/editing happen in Drive itself; the app never provisions or
// mutates the folder. (The writable, bot-owned "CAD" folder is under the Vault
// subtab.)

function DriveFilesPanel({ project, isAdmin, onProjectChange }) {
  const [editing, setEditing] = useState(false);
  const link = project.driveLink ?? null;
  const parsed = link ? parseDriveUrl(link) : null;
  const isFolder = parsed?.kind === "folder";

  const editModal = editing && (
    <EditDriveFolderModal
      projectId={project.id}
      currentLink={link}
      onClose={() => setEditing(false)}
      onSaved={updated => { onProjectChange?.(updated); setEditing(false); }}
    />
  );

  // No folder linked yet.
  if (!link) {
    return (
      <div className="cpm-drive-files-empty">
        <i className="fab fa-google-drive" style={{ fontSize: 36, color: "#4285F4", marginBottom: 10 }} aria-hidden="true" />
        <h3 style={{ margin: "0 0 4px", fontSize: 15, color: "var(--clubpm-text-primary)" }}>
          No Drive folder linked
        </h3>
        <p>This project's files live in a Google Drive folder. Link one to open it from here.</p>
        {isAdmin ? (
          <button className="clubpm-btn-primary" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>
            <i className="fab fa-google-drive" aria-hidden="true" style={{ marginRight: 8 }} />
            Link Drive folder
          </button>
        ) : (
          <p style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>Ask an admin to link the project's Drive folder.</p>
        )}
        {editModal}
      </div>
    );
  }

  // Linked, but the link points at a file/doc rather than a folder.
  if (!isFolder) {
    return (
      <div className="cpm-drive-files-empty">
        <i className="fab fa-google-drive" style={{ fontSize: 36, color: "#4285F4", marginBottom: 10 }} aria-hidden="true" />
        <h3 style={{ margin: "0 0 4px", fontSize: 15, color: "var(--clubpm-text-primary)" }}>
          The linked Drive item isn't a folder
        </h3>
        <p>You can still open it directly, but the Files tab works best with a folder link.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <a className="clubpm-btn-primary" href={link} target="_blank" rel="noopener noreferrer">
            Open link
          </a>
          {isAdmin && (
            <button className="cpm-attach-cancel" onClick={() => setEditing(true)}>
              Change link
            </button>
          )}
        </div>
        {editModal}
      </div>
    );
  }

  // Folder linked → view-only inline embed of the folder's contents (Google's
  // embeddedfolderview iframe — same mechanism as the eye-icon preview, so it
  // works whenever the folder is shared "anyone with the link").
  const embedUrl = getPreviewUrl(parsed);
  return (
    <div className="cpm-drive-files">
      <header className="cpm-drive-files-header">
        <div className="cpm-drive-files-title">
          <i className="fas fa-folder" style={{ color: "#FFC107" }} aria-hidden="true" />
          <span>Drive folder</span>
        </div>
        <div className="cpm-drive-files-header-actions">
          {isAdmin && (
            <button type="button" className="cpm-drive-files-refresh" onClick={() => setEditing(true)} title="Change linked folder">
              <i className="fas fa-pen" aria-hidden="true" /> Change
            </button>
          )}
          <a href={link} target="_blank" rel="noopener noreferrer" className="cpm-drive-files-open">
            Open in Drive <i className="fas fa-external-link-alt" aria-hidden="true" />
          </a>
        </div>
      </header>

      {embedUrl ? (
        <iframe
          title="Drive folder contents"
          src={embedUrl}
          className="cpm-drive-folder-embed"
          loading="lazy"
        />
      ) : (
        <div className="cpm-drive-files-empty" style={{ marginTop: 4 }}>
          <i className="fab fa-google-drive" style={{ fontSize: 32, color: "#4285F4", marginBottom: 10 }} aria-hidden="true" />
          <p>This project's files live in a linked Google Drive folder.</p>
          <a href={link} target="_blank" rel="noopener noreferrer" className="clubpm-btn-primary" style={{ marginTop: 12 }}>
            Open folder in Drive <i className="fas fa-external-link-alt" aria-hidden="true" style={{ marginLeft: 6 }} />
          </a>
        </div>
      )}

      {editModal}
    </div>
  );
}

// ── Files tab: Drive | GitHub sub-toggle ─────────────────────
//
// Replaces the standalone GitHub tab. Sub-state is remembered in
// sessionStorage per project so a user reopening the same project sees the
// pane they were on; users opening a *different* project start on Drive.

const FILE_SOURCES = [
  { id: "drive",  label: "Drive",  icon: "fab fa-google-drive" },
  { id: "github", label: "GitHub", icon: "fab fa-github" },
  { id: "vault",  label: "Vault",  icon: "fas fa-database" },
];

function FilesTabContent({ project, member, isAdmin, onProjectChange }) {
  const compact = useCompactLayout();
  const storageKey = `cpm.files.sub.${project.id}`;
  const [sub, setSub] = useState(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      return stored === "github" || stored === "vault" ? stored : "drive";
    }
    catch { return "drive"; }
  });

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, sub); } catch { /* ignore */ }
  }, [storageKey, sub]);

  return (
    <div style={compact ? undefined : { display: "flex", flexDirection: "column", gap: 16 }} className={compact ? "pm-m-files" : undefined}>
      {compact ? (
        // Labelled source selector instead of a second icon toolbar. The
        // selection is the same sessionStorage value the desktop toggle uses,
        // so returning from an item detail lands on the same source.
        <div className="pm-m-source" role="group" aria-label="Files source">
          <span className="pm-m-source-label" id={`files-source-${project.id}`}>Source</span>
          <div className="pm-m-segment pm-m-segment--wide" role="group" aria-labelledby={`files-source-${project.id}`}>
            {FILE_SOURCES.map(opt => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={sub === opt.id}
                onClick={() => setSub(opt.id)}
                data-tour-id={opt.id === "vault" ? "project.tab.vault" : undefined}
              >
                <i className={opt.icon} aria-hidden="true" /> {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
      <div
        role="tablist"
        aria-label="Files source"
        style={{
          display: "inline-flex", alignSelf: "flex-start",
          borderRadius: 999, padding: 3,
          background: "var(--clubpm-surface-200)",
          border: "1px solid var(--clubpm-border)",
        }}
      >
        {FILE_SOURCES.map(opt => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={sub === opt.id}
            onClick={() => setSub(opt.id)}
            data-tour-id={opt.id === "vault" ? "project.tab.vault" : undefined}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", border: "none", cursor: "pointer",
              borderRadius: 999,
              fontSize: 13, fontWeight: 600,
              background: sub === opt.id ? "var(--clubpm-accent-primary)" : "transparent",
              color: sub === opt.id ? "#fff" : "var(--clubpm-text-secondary)",
              transition: "background 0.18s ease, color 0.18s ease",
            }}
          >
            <i className={opt.icon} aria-hidden="true" />
            {opt.label}
          </button>
        ))}
      </div>
      )}

      {sub === "drive" ? (
        <DriveFilesPanel
          project={project}
          isAdmin={isAdmin}
          onProjectChange={onProjectChange}
        />
      ) : sub === "vault" ? (
        <VaultTab project={project} member={member} isAdmin={isAdmin} />
      ) : (
        <GitHubPanel project={project} />
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { member } = useClubPmAuth();
  const compact = useCompactLayout();
  const { setProjectNav, clearProjectNav } = useProjectNav();
  const notifyStreak = useStreakWatcher();

  const [project, setProject] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [slackChannels, setSlackChannels] = useState([]);
  const [slackChannelsState, setSlackChannelsState] = useState({
    loaded: false,
    error: "",
    warning: "",
    needsAuth: false,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");
  const [chatSection, setChatSection] = useState("messages");
  const [reportTab, setReportTab] = useState("charts");

  // Preserve old project deep links while routing them into the merged tabs.
  const tabParam = searchParams.get("tab");
  useEffect(() => {
    if (tabParam === "members") {
      setActiveTab("chat");
      setChatSection("members");
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set("tab", "chat");
        next.set("view", "members");
        return next;
      }, { replace: true });
    } else if (tabParam === "reports" || tabParam === "ai") {
      setActiveTab("insights");
      setReportTab(tabParam === "ai" ? "ai" : "charts");
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set("tab", "insights");
        if (tabParam === "ai") next.set("view", "ai");
        else next.delete("view");
        return next;
      }, { replace: true });
    } else if (tabParam && NAV_TABS.some(t => t.id === tabParam)) {
      setActiveTab(tabParam);
      const view = searchParams.get("view");
      if (tabParam === "chat") setChatSection(view === "members" || searchParams.get("dm") ? "members" : "messages");
      if (tabParam === "insights") setReportTab(["time", "activity", "presskit", "ai"].includes(view) ? view : "charts");
    }
  }, [tabParam, searchParams, setSearchParams]);

  // Tab clicks keep the URL in step, and drop params that belong to other tabs.
  const changeTab = useCallback((id) => {
    setActiveTab(id);
    if (id === "chat") setChatSection("messages");
    if (id === "insights") setReportTab("charts");
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === "tasks") next.delete("tab");
      else next.set("tab", id);
      if (id !== "chat") { next.delete("channel"); next.delete("thread"); }
      next.delete("dm");
      next.delete("view");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const changeChatSection = useCallback((section) => {
    setChatSection(section);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("tab", "chat");
      if (section === "members") {
        next.set("view", "members");
        next.delete("channel");
        next.delete("thread");
      } else {
        next.delete("view");
        next.delete("dm");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const changeInsightSection = useCallback((section) => {
    setReportTab(section);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("tab", "insights");
      if (section === "charts") next.delete("view");
      else next.set("view", section);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const tabBodyRef = useRef(null);
  useEffect(() => {
    if (!tabBodyRef.current) return;
    const body = tabBodyRef.current.querySelector('.cpm-proj-main-body');
    if (body && body.children?.length) {
      revealStagger(body.children, { delay: 50, fromY: 8, duration: 380 });
    } else if (body) {
      revealStagger([body], { delay: 0, fromY: 8, duration: 380 });
    }
  }, [activeTab]);
  const [activeTask, setActiveTask] = useState(null);     // For DragOverlay
  const [selectedTask, setSelectedTask] = useState(null); // For TaskModal
  const [overBin, setOverBin] = useState(null);
  const [overTaskId, setOverTaskId] = useState(null);
  const [activeMember, setActiveMember] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState(() => new Set());
  const [assigneePanelOpen] = useState(true); // reserved for future toggle UX
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskInitialStatus, setAddTaskInitialStatus] = useState("TODO");
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [sortBy, setSortBy] = useState("priority");
  const [headerDrivePreview, setHeaderDrivePreview] = useState(null); // { url, label }
  const [showEditProject, setShowEditProject] = useState(false);
  const [pinned, setPinned] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('pm-starred-projects') || '[]');
      return stored.includes(id);
    } catch { return false; }
  });
  const [viewMode, setViewMode] = useState("list");
  const [descEdit, setDescEdit] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [descExpanded, setDescExpanded] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set());
  const [lastClickedId, setLastClickedId] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkActing, setBulkActing] = useState(false);
  const [projectBlockers, setProjectBlockers] = useState([]); // active category blockers for this project
  const [blockerPrompt, setBlockerPrompt] = useState(null); // { taskIds } when naming a new blocker via drop
  const [showArchived, setShowArchived] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedGroupOpen, setArchivedGroupOpen] = useState(false);
  const [compactScope, setCompactScope] = useState('mine');
  const [compactQuery, setCompactQuery] = useState('');
  const [compactPriority, setCompactPriority] = useState('all');
  const [compactDue, setCompactDue] = useState('any');
  const [compactGroups, setCompactGroups] = useState(() => new Set(['TODO', 'IN_PROGRESS', 'BLOCKED']));
  const [compactLayer, setCompactLayer] = useState(null); // { type: filters|move|assign, task? }
  const [compactSaving, setCompactSaving] = useState(false);
  const taskReturnRef = useRef(null);

  // Build subtask map from embedded subtasks (project fetches top-level only, subtasks are nested)
  const subtasksByParent = useMemo(() => {
    const map = new Map();
    project?.tasks.forEach(t => {
      if (t.subtasks && t.subtasks.length > 0) {
        map.set(t.id, t.subtasks);
      }
    });
    return map;
  }, [project]);

  const tasksByBin = useMemo(() => {
    if (!project) return BINS.map(b => ({ ...b, tasks: [] }));
    const sorted = (arr) => [...arr].sort((a, b) => {
      if (sortBy === "priority") return (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
      if (sortBy === "dueDate")  return (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity);
      if (sortBy === "status")   return (a.status ?? "").localeCompare(b.status ?? "");
      if (sortBy === "created")  return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === "title")    return a.title.localeCompare(b.title);
      if (sortBy === "tags") {
        const aTag = (a.tags?.[0]?.name ?? "").toLowerCase();
        const bTag = (b.tags?.[0]?.name ?? "").toLowerCase();
        if (!aTag && bTag) return 1;
        if (aTag && !bTag) return -1;
        return aTag.localeCompare(bTag);
      }
      return 0;
    });
    return BINS.map((b) => ({
      ...b,
      tasks: sorted(project.tasks.filter(
        (t) => !t.parentTaskId && t.status === b.id
      )),
    }));
  }, [project, sortBy]);

  const compactTasksByBin = useMemo(() => {
    const now = new Date();
    const week = new Date(now); week.setDate(now.getDate() + 7);
    const q = compactQuery.trim().toLowerCase();
    return tasksByBin.map(bin => ({
      ...bin,
      tasks: bin.tasks.filter(task => {
        if (compactScope === 'mine' && !(task.assignees ?? []).some(a => a.id === member?.id)) return false;
        if (q && !`${task.title ?? ''} ${task.description ?? ''} ${(task.tags ?? []).map(t => t.name).join(' ')}`.toLowerCase().includes(q)) return false;
        if (compactPriority !== 'all' && task.priority !== compactPriority) return false;
        if (compactDue === 'none' && task.dueDate) return false;
        if (compactDue === 'overdue' && (!task.dueDate || task.status === 'DONE' || new Date(task.dueDate) >= now)) return false;
        if (compactDue === 'week' && (!task.dueDate || new Date(task.dueDate) < now || new Date(task.dueDate) > week)) return false;
        return true;
      }),
    }));
  }, [tasksByBin, compactScope, compactQuery, compactPriority, compactDue, member?.id]);

  const compactFilterCount = (compactPriority !== 'all' ? 1 : 0) + (compactDue !== 'any' ? 1 : 0) + (showArchived ? 1 : 0);

  // Flat visual order of every visible row (matches StatusBin's render order)
  // so shift-click can resolve a contiguous range across bins/subtasks.
  const flatTaskOrder = useMemo(() => {
    const order = [];
    tasksByBin.forEach((bin) => {
      const groups = sortBy === "tags" ? getTagGroups(bin.tasks) : [{ tasks: bin.tasks }];
      groups.forEach((group) => {
        group.tasks.forEach((task) => {
          order.push(task.id);
          if (expandedParents.has(task.id)) {
            (subtasksByParent.get(task.id) ?? []).forEach((sub) => order.push(sub.id));
          }
        });
      });
    });
    return order;
  }, [tasksByBin, sortBy, expandedParents, subtasksByParent]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchProject = useCallback(() => {
    if (!id) return;
    get(`/api/projects/${id}`)
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const fetchBlockers = useCallback(() => {
    if (!id) return;
    getProjectBlockers(id).then(setProjectBlockers).catch(() => {});
  }, [id]);

  const fetchArchivedTasks = useCallback(() => {
    if (!id) return;
    setArchivedLoading(true);
    getArchivedTasks(id)
      .then(setArchivedTasks)
      .catch(() => {})
      .finally(() => setArchivedLoading(false));
  }, [id]);

  useEffect(() => {
    if (showArchived) fetchArchivedTasks();
  }, [showArchived, fetchArchivedTasks]);

  const refreshBlockers = useCallback(() => {
    fetchProject();
    fetchBlockers();
  }, [fetchProject, fetchBlockers]);

  // Look up a task (top-level or subtask) by id within the current project.
  const findTaskById = useCallback((tid) => {
    if (!project) return null;
    const top = project.tasks.find(t => t.id === tid);
    if (top) return { task: top, parentTask: null };
    for (const t of project.tasks) {
      const sub = (t.subtasks ?? []).find(s => s.id === tid);
      if (sub) return { task: sub, parentTask: t };
    }
    return null;
  }, [project]);

  // Single-task status move — keeps the reward-origin + confetti niceties.
  const moveSingleTask = async (task, newStatus, dropRect) => {
    const taskId = task.id;
    const patchBody = { status: newStatus };
    if (newStatus === "IN_PROGRESS" && member) {
      const alreadyAssigned = (task.assignees ?? []).some(a => a.id === member.id);
      if (!alreadyAssigned) patchBody.assigneeIds = [...(task.assignees ?? []).map(a => a.id), member.id];
    }
    const previousTasks = project.tasks;
    if (dropRect) setNextRewardOrigin(dropRect.left + dropRect.width / 2, dropRect.top + dropRect.height / 2);
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? {
        ...t,
        status: newStatus,
        assignees: newStatus === "IN_PROGRESS" && member && !(t.assignees ?? []).some(a => a.id === member.id)
          ? [...(t.assignees ?? []), member]
          : t.assignees,
      } : t),
    }));
    try {
      const updated = await patch(`/api/tasks/${taskId}`, patchBody);
      setProject(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...updated } : t) }));
      notifyStreak();
      if (newStatus === "DONE") celebrateDoneBin();
    } catch (err) {
      setProject(prev => ({ ...prev, tasks: previousTasks }));
      if (err?.message) alert(err.message);
    }
  };

  // Group status move — one optimistic pass + the bulk endpoint, then reconcile.
  const bulkMoveStatus = async (ids, newStatus) => {
    const idSet = new Set(ids);
    const previousTasks = project.tasks;
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        let next = idSet.has(t.id) ? { ...t, status: newStatus } : t;
        if (next.subtasks?.length) next = { ...next, subtasks: next.subtasks.map(s => idSet.has(s.id) ? { ...s, status: newStatus } : s) };
        return next;
      }),
    }));
    try {
      const res = await patch("/api/tasks/bulk", { ids, patch: { status: newStatus } });
      if (res.skipped?.length) {
        alert(`${res.skipped.length} task(s) were not moved:\n` + res.skipped.map(s => `- ${s.reason}`).join("\n"));
      }
      notifyStreak();
      if (newStatus === "DONE") celebrateDoneBin();
    } catch (err) {
      setProject(prev => ({ ...prev, tasks: previousTasks }));
      alert(err?.message ?? "Failed to move tasks");
    } finally {
      fetchProject();
    }
  };

  // Move one or more tasks to a status, mirroring the backend's blocker rules so
  // a locked/dep-gated task fails fast (with a message) instead of round-tripping.
  const moveTasksToStatus = async (ids, newStatus, dropRect) => {
    const movable = [];
    const blocked = [];
    for (const tid of ids) {
      const f = findTaskById(tid);
      if (!f) continue;
      const t = f.task;
      if (t.status === newStatus) continue;
      const hasOpenCat = (t.blockers ?? []).some(tb => tb.blocker && !tb.blocker.resolvedAt);
      if (hasOpenCat && newStatus !== "BLOCKED") { blocked.push(`${t.title} — locked until its blocker is resolved`); continue; }
      if (newStatus === "DONE") {
        const openDeps = (t.blockedBy ?? []).filter(d => d.blockingTask?.status !== "DONE");
        if (openDeps.length) { blocked.push(`${t.title} — waiting on ${openDeps.map(d => d.blockingTask.title).join(", ")}`); continue; }
      }
      movable.push(t);
    }
    if (blocked.length) alert(`Some tasks couldn't be moved:\n\n${blocked.join("\n")}`);
    if (!movable.length) return;
    if (movable.length === 1) await moveSingleTask(movable[0], newStatus, dropRect);
    else await bulkMoveStatus(movable.map(t => t.id), newStatus);
  };

  // Attach an existing category blocker to one or more tasks (drop onto a sub-bin).
  const attachBlockerToTasks = async (ids, blockerId, reason = null) => {
    const targets = ids.filter(tid => {
      const f = findTaskById(tid);
      return f && !(f.task.blockers ?? []).some(tb => tb.blockerId === blockerId && tb.blocker && !tb.blocker.resolvedAt);
    });
    if (!targets.length) return;
    try {
      await Promise.all(targets.map(tid => post(`/api/tasks/${tid}/blockers`, { blockerId, reason })));
    } catch (err) {
      alert(err?.message ?? "Failed to attach blocker");
    } finally {
      refreshBlockers();
    }
  };

  // Create a brand-new category blocker (from the name modal) and attach the
  // dragged task(s) to it.
  const createBlockerAndAttach = async (label, color, taskIds, assigneeId = null) => {
    try {
      const cat = await createBlocker(id, { label, color: color || null, assigneeId: assigneeId || null });
      await Promise.all(taskIds.map(tid => post(`/api/tasks/${tid}/blockers`, { blockerId: cat.id, reason: null })));
    } catch (err) {
      alert(err?.message ?? "Failed to create blocker");
    } finally {
      refreshBlockers();
      clearSelection();
    }
  };

  // Rename / recolor / reassign a category blocker (inline edit in the Blocked column).
  const handleRenameBlocker = async (blockerId, fields) => {
    try {
      await updateBlocker(blockerId, fields);
    } catch (err) {
      alert(err?.message ?? "Failed to update blocker");
    } finally {
      refreshBlockers();
    }
  };

  // DONE-bin settle-bounce + confetti, shared by single and group moves.
  const celebrateDoneBin = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const doneBin = document.querySelector('[data-bin-id="DONE"]');
      if (!doneBin) return;
      if (!prefersReducedMotion()) {
        animate(doneBin, { scale: [1, 1.01, 1], duration: 400, ease: spring });
      }
      burstAt(doneBin, { palette: 'taskComplete' });
    }));
  };

  // Groups the BLOCKED column into collapsible sub-bins: one per active
  // category blocker attached to a blocked task, plus one per blocking task
  // that still has at least one non-DONE blocked task. A task blocked by
  // several things appears under each of its groups.
  const blockedGroups = useMemo(() => {
    if (!project) return [];
    const blockedTasks = project.tasks.filter(t => !t.parentTaskId && t.status === "BLOCKED");
    // The task-embedded blocker (from project.tasks) omits the `assignee`
    // relation, so use the projectBlockers copy — which includes the owner — as
    // the source of truth for category metadata whenever it's available.
    const blockerById = new Map((projectBlockers ?? []).map(b => [b.id, b]));
    const categoryGroups = new Map();
    const taskGroups = new Map();
    blockedTasks.forEach(t => {
      (t.blockers ?? []).forEach(tb => {
        if (!tb.blocker || tb.blocker.resolvedAt) return;
        if (!categoryGroups.has(tb.blockerId)) {
          const richBlocker = blockerById.get(tb.blockerId) ?? tb.blocker;
          categoryGroups.set(tb.blockerId, { type: "category", id: tb.blockerId, blocker: richBlocker, items: [] });
        }
        categoryGroups.get(tb.blockerId).items.push({ task: t, reason: tb.reason });
      });
      (t.blockedBy ?? []).forEach(dep => {
        if (!dep.blockingTask || dep.blockingTask.status === "DONE") return;
        const bid = dep.blockingTask.id;
        if (!taskGroups.has(bid)) {
          taskGroups.set(bid, { type: "task", id: bid, blockingTask: dep.blockingTask, items: [] });
        }
        taskGroups.get(bid).items.push({ task: t, reason: dep.reason });
      });
    });
    // Surface every active category — even ones with no blocked task yet — so
    // they render as drop targets you can drag tasks into.
    (projectBlockers ?? []).forEach(b => {
      if (b.resolvedAt) return;
      if (!categoryGroups.has(b.id)) {
        categoryGroups.set(b.id, { type: "category", id: b.id, blocker: b, items: [] });
      }
    });
    const groups = [
      ...[...categoryGroups.values()].sort((a, b) => a.blocker.label.localeCompare(b.blocker.label)),
      ...[...taskGroups.values()].sort((a, b) => a.blockingTask.title.localeCompare(b.blockingTask.title)),
    ];
    const groupedIds = new Set();
    groups.forEach(g => g.items.forEach(i => groupedIds.add(i.task.id)));
    const ungrouped = blockedTasks.filter(t => !groupedIds.has(t.id));
    if (ungrouped.length) groups.push({ type: "other", id: "other", items: ungrouped.map(t => ({ task: t, reason: null })) });
    return groups;
  }, [project, projectBlockers]);

  const handleResolveBlocker = useCallback(async (blockerId) => {
    try {
      await post(`/api/blockers/${blockerId}/resolve`, {});
      refreshBlockers();
    } catch (err) {
      alert(err?.message ?? "Failed to resolve blocker");
    }
  }, [refreshBlockers]);

  const saveDescription = useCallback(async () => {
    try {
      const updated = await patch(`/api/projects/${id}`, { description: descValue.trim() || null });
      setProject(prev => ({ ...prev, description: updated.description }));
      setDescEdit(false);
      setDescExpanded(false);
    } catch (err) {
      alert(err?.message ?? "Failed to save description");
    }
  }, [id, descValue]);

  useEffect(() => {
    fetchProject();
    fetchBlockers();
  }, [fetchProject, fetchBlockers]);

  // The milestone progress snapshot (read at mount, written on unmount) existed
  // only to animate MilestonePanel's bars from their last-seen values. That
  // panel and its tab are gone, so nothing consumes the snapshot any more.

  // Auto-expand all parent tasks that have subtasks by default
  useEffect(() => {
    if (!project) return;
    setExpandedParents(prev => {
      const next = new Set(prev);
      project.tasks.forEach(t => {
        if (t.subtasks && t.subtasks.length > 0) next.add(t.id);
      });
      return next;
    });
  }, [project?.id]);

  // Clear bulk selections on Escape and whenever the active tab changes.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && (selectedTaskIds.size > 0 || selectedMemberIds.size > 0)) {
        setSelectedTaskIds(new Set());
        setSelectedMemberIds(new Set());
        setLastClickedId(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedTaskIds, selectedMemberIds]);

  useEffect(() => {
    setSelectedTaskIds(new Set());
    setSelectedMemberIds(new Set());
    setLastClickedId(null);
  }, [activeTab]);

  const handleMemberClick = useCallback((memberId, event) => {
    if (!event?.ctrlKey && !event?.metaKey) return;
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((task, event) => {
    if (event?.ctrlKey || event?.metaKey) {
      setSelectedTaskIds(prev => {
        const next = new Set(prev);
        if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
        return next;
      });
      setLastClickedId(task.id);
      return;
    }
    if (event?.shiftKey && lastClickedId) {
      const fromIdx = flatTaskOrder.indexOf(lastClickedId);
      const toIdx = flatTaskOrder.indexOf(task.id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        setSelectedTaskIds(prev => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) next.add(flatTaskOrder[i]);
          return next;
        });
      }
      setLastClickedId(task.id);
      return;
    }
    setLastClickedId(task.id);
    const scrollHost = document.querySelector('.cpm-proj-main-body') ?? document.querySelector('.pm-shell-content');
    taskReturnRef.current = {
      scrollTop: scrollHost?.scrollTop ?? window.scrollY,
      taskId: task.id,
    };
    setSelectedTask(task);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('task', task.id);
      return next;
    });
  }, [lastClickedId, flatTaskOrder, setSearchParams]);

  // Activity rows carry a task id only; resolve it against the loaded project and
  // reuse the single TaskModal opener rather than introducing a second one.
  const handleActivityOpenTask = useCallback((taskId) => {
    const tasks = project?.tasks ?? [];
    const found =
      tasks.find(t => t.id === taskId) ??
      tasks.flatMap(t => t.subtasks ?? []).find(s => s.id === taskId);
    if (found) handleRowClick(found);
  }, [project, handleRowClick]);

  // RiskRadarCard hands back the whole task object; ProjectActivity hands back an id.
  // Normalise here so both surfaces share one opener.
  const handleAnalyticsOpenTask = useCallback((task) => {
    handleActivityOpenTask(typeof task === "string" ? task : task?.id);
  }, [handleActivityOpenTask]);

  const togglePinned = useCallback(() => {
    setPinned(p => {
      const next = !p;
      try {
        const stored = JSON.parse(localStorage.getItem('pm-starred-projects') || '[]');
        const updated = next
          ? [...stored.filter(x => x !== id), id]
          : stored.filter(x => x !== id);
        localStorage.setItem('pm-starred-projects', JSON.stringify(updated));
        window.dispatchEvent(new Event('pm-stars-changed'));
      } catch {}
      return next;
    });
  }, [id]);

  // Same rule as the hero's edit button below (computed there after the
  // loading guard); repeated here because this effect runs before it.
  const canEditProject = !!project && (
    !project.slackChannelId ||
    (project.channelMemberSlackIds ?? []).includes(member?.slackId)
  );

  useEffect(() => {
    if (!project) return;
    setProjectNav({
      projectId: project.id,
      projectName: project.name,
      tabs: NAV_TABS,
      activeTab,
      onTabChange: changeTab,
      // Project-level operations for the phone project sheet. Each mirrors a
      // control the desktop hero already renders, under the same permission.
      // The timeline had no entry point at all before this.
      actions: [
        { id: 'edit', label: 'Edit project', icon: 'fa-pencil-alt', hidden: !canEditProject, onSelect: () => setShowEditProject(true) },
        { id: 'chat', label: 'Project chat', icon: 'fa-comments', to: `/clubpm/projects/${project.id}?tab=chat` },
        { id: 'drive', label: 'Open Drive folder', icon: 'fa-folder-open', hidden: !project.driveLink, onSelect: () => setHeaderDrivePreview({ url: project.driveLink, label: 'Drive folder' }) },
        { id: 'description', label: 'Edit description', icon: 'fa-align-left', hidden: !member?.isAdmin, onSelect: () => { setDescValue(project.description ?? ''); setDescEdit(true); } },
        { id: 'pin', label: pinned ? 'Unpin project' : 'Pin project', icon: 'fa-star', onSelect: togglePinned },
        { id: 'timeline', label: 'Timeline (Gantt)', icon: 'fa-chart-gantt', to: `/clubpm/projects/${project.id}/gantt` },
      ],
    });
  }, [project?.id, project?.name, activeTab, setProjectNav, changeTab, canEditProject, pinned, togglePinned]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => clearProjectNav();
  }, [clearProjectNav]);

  useEffect(() => {
    get("/api/projects")
      .then(setAllProjects)
      .catch(console.error);
  }, []);

  useEffect(() => {
    // Never swallow this. When it failed silently, the picker rendered an empty
    // dropdown with no explanation anywhere — the bug that hid a broken token
    // path for weeks.
    get("/api/slack/channels")
      .then(data => {
        // Response is { channels, needsSlackAuth, warning }; tolerate the older
        // bare-array shape while a stale backend is still deployed.
        if (Array.isArray(data)) {
          setSlackChannels(data);
          setSlackChannelsState({ loaded: true, error: "", warning: "", needsAuth: false });
          return;
        }
        setSlackChannels(data?.channels ?? []);
        setSlackChannelsState({
          loaded: true,
          error: "",
          warning: data?.warning ?? "",
          needsAuth: !!data?.needsSlackAuth,
        });
      })
      .catch(err => {
        console.error("Failed to load Slack channels", err);
        setSlackChannels([]);
        setSlackChannelsState({
          loaded: true,
          error: err?.message ?? "Could not load Slack channels",
          warning: "",
          needsAuth: true,
        });
      });
  }, []);

  useEffect(() => {
    get("/api/members")
      .then(members => setAllMembers(members.map(m => ({ memberId: m.id, member: m }))))
      .catch(console.error);
  }, []);

  const taskIdFromParam = searchParams.get("task");
  // The id the user just closed. Clearing selectedTask renders before the
  // router drops `?task=` (navigations are transitions), and without this the
  // effect below saw the stale param and reopened the task: a task opened from
  // the Dashboard could not be closed at all.
  const dismissedTaskIdRef = useRef(null);
  useEffect(() => {
    if (!taskIdFromParam) { dismissedTaskIdRef.current = null; return; }
    if (!project || taskIdFromParam === dismissedTaskIdRef.current) return;
    const found = findTaskById(taskIdFromParam)?.task;
    if (found && selectedTask?.id !== found.id) setSelectedTask(found);
  }, [taskIdFromParam, project, selectedTask?.id, findTaskById]);

  const closeTaskModal = useCallback(() => {
    dismissedTaskIdRef.current = new URLSearchParams(window.location.search).get('task');
    setSelectedTask(null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('task');
      return next;
    }, { replace: true });
    const restore = taskReturnRef.current;
    window.requestAnimationFrame(() => {
      if (restore) {
        const scrollHost = document.querySelector('.cpm-proj-main-body') ?? document.querySelector('.pm-shell-content');
        if (scrollHost) scrollHost.scrollTo({ top: restore.scrollTop, behavior: 'auto' });
        else window.scrollTo({ top: restore.scrollTop, behavior: 'auto' });
      }
      document.querySelector(`[data-task-id="${restore?.taskId ?? ''}"] .pm-m-task-main`)?.focus({ preventScroll: true });
    });
  }, [setSearchParams]);

  const handleDragStart = (event) => {
    const { active } = event;
    if (typeof active.id === "string" && (active.id.startsWith("member-") || active.id === "special-everyone" || active.id === "special-nobody")) {
      setActiveTask(null);
      if (active.id.startsWith("member-")) {
        const memberId = active.data.current?.memberId;
        const pm = allMembers.find(m => m.memberId === memberId);
        setActiveMember(pm ?? null);
      } else {
        // Use a synthetic pm object for the overlay
        setActiveMember({ memberId: active.id, member: { displayName: active.id === "special-everyone" ? "Everyone" : "Nobody" } });
      }
      return;
    }
    setActiveMember(null);
    const task = project?.tasks.find((t) => t.id === active.id);
    setActiveTask(task ?? null);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    const overId = over?.id ?? null;
    const isMemberDrag = typeof active?.id === "string" && (active.id.startsWith("member-") || active.id === "special-everyone" || active.id === "special-nobody");
    if (isMemberDrag) {
      // A member can be dropped on a task row (assign) or a blocker category
      // sub-bin (set the blocker's responsible owner).
      const isBlockerBin = typeof overId === "string" && overId.startsWith("blocker-");
      setOverBin(isBlockerBin ? overId : null);
      const isTopLevel = !isBlockerBin && overId && project?.tasks.some(t => t.id === overId);
      const isSubtask = !isBlockerBin && !isTopLevel && overId && project?.tasks.some(t => (t.subtasks ?? []).some(s => s.id === overId));
      setOverTaskId(isTopLevel || isSubtask ? overId : null);
    } else {
      setOverTaskId(null);
      setOverBin(isContainerId(overId) ? overId : null);
    }
  };

  const handleDragEnd = async (event) => {
    setActiveTask(null);
    setActiveMember(null);
    setOverBin(null);
    setOverTaskId(null);
    if (!canEdit) return;
    const { active, over } = event;
    if (!over || !project) return;

    // Blocked task rows use a namespaced droppable id and carry the real task id
    // in `data`; everywhere else the droppable id *is* the task id.
    const overTargetId = over.data?.current?.taskId ?? over.id;

    // Helper: find a task by ID across top-level tasks and their embedded subtasks
    const findTask = (id) => {
      const top = project.tasks.find(t => t.id === id);
      if (top) return { task: top, parentTask: null };
      for (const t of project.tasks) {
        const sub = (t.subtasks ?? []).find(s => s.id === id);
        if (sub) return { task: sub, parentTask: t };
      }
      return null;
    };

    // Helper: apply optimistic assignee update to state (handles subtasks)
    const applyAssigneeUpdate = (taskId, parentTaskId, newAssignees) => {
      setProject(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => {
          if (parentTaskId) {
            if (t.id !== parentTaskId) return t;
            return { ...t, subtasks: (t.subtasks ?? []).map(s => s.id === taskId ? { ...s, assignees: newAssignees } : s) };
          }
          return t.id === taskId ? { ...t, assignees: newAssignees } : t;
        }),
      }));
    };

    // ── Member / special chip dropped onto a blocker category sub-bin ──
    // Sets (or, for "Nobody", clears) the blocker's responsible owner. Guarded
    // to member/special drags only — a *task* dropped on a category must still
    // fall through to the attach logic below.
    const isMemberDrag = typeof active.id === "string" &&
      (active.id.startsWith("member-") || active.id === "special-everyone" || active.id === "special-nobody");
    if (isMemberDrag && typeof over.id === "string" && over.id.startsWith("blocker-")) {
      const blockerId = over.id.slice("blocker-".length);
      if (active.id === "special-everyone") return; // no single "everyone" owner
      const newOwnerId = active.id === "special-nobody"
        ? null
        : active.data.current?.memberId ?? null;
      await handleRenameBlocker(blockerId, { assigneeId: newOwnerId });
      return;
    }

    // Special chips: Everyone or Nobody
    if (active.id === "special-everyone" || active.id === "special-nobody") {
      const found = findTask(overTargetId);
      if (!found) return;
      const { task, parentTask } = found;
      const everyone = active.id === "special-everyone";
      const memberIds = everyone ? allMembers.map(m => m.memberId) : [];
      const memberObjs = everyone ? allMembers.map(m => m.member).filter(Boolean) : [];
      applyAssigneeUpdate(task.id, parentTask?.id ?? null, memberObjs);
      try {
        const updated = await patch(`/api/tasks/${task.id}`, { assigneeIds: memberIds });
        applyAssigneeUpdate(task.id, parentTask?.id ?? null, updated.assignees ?? memberObjs);
      } catch {
        fetchProject();
      }
      return;
    }

    // Member chip dropped onto a task row → assign member
    if (typeof active.id === "string" && active.id.startsWith("member-")) {
      const memberId = active.data.current?.memberId;
      if (!memberId) return;
      const found = findTask(overTargetId);
      if (!found) return;
      const { task, parentTask } = found;
      const draggedMemberIds = selectedMemberIds.has(memberId) && selectedMemberIds.size > 1
        ? [...selectedMemberIds]
        : [memberId];
      const existingIds = new Set((task.assignees ?? []).map(a => a.id));
      const addedMemberIds = draggedMemberIds.filter(id => !existingIds.has(id));
      if (addedMemberIds.length === 0) return;
      const addedMembers = addedMemberIds
        .map(id => allMembers.find(m => m.memberId === id)?.member)
        .filter(Boolean);
      const newAssigneeIds = [...existingIds, ...addedMemberIds];
      applyAssigneeUpdate(task.id, parentTask?.id ?? null, [...(task.assignees ?? []), ...addedMembers]);
      try {
        const updated = await patch(`/api/tasks/${task.id}`, { assigneeIds: newAssigneeIds });
        applyAssigneeUpdate(task.id, parentTask?.id ?? null, updated.assignees ?? []);
        if (draggedMemberIds.length > 1) setSelectedMemberIds(new Set());
      } catch {
        fetchProject();
      }
      return;
    }

    // ── Task drag onto a status bin or blocker sub-bin ─────────────
    // If the grabbed task is part of a multi-selection, the whole selection
    // moves as one group; otherwise just the grabbed task.
    const overId = over.id;
    const isGroup = selectedTaskIds.has(active.id) && selectedTaskIds.size > 1;
    const draggedIds = isGroup ? [...selectedTaskIds] : [active.id];

    // Dropped onto a specific blocker category sub-bin → attach that blocker.
    if (typeof overId === "string" && overId.startsWith("blocker-")) {
      await attachBlockerToTasks(draggedIds, overId.slice("blocker-".length));
      if (isGroup) clearSelection();
      return;
    }

    if (!BINS.some((b) => b.id === overId)) return;
    const newStatus = overId;

    // Dropped onto the BLOCKED bin's general area → ask what's blocking it,
    // then create a category blocker and attach the dragged task(s).
    if (newStatus === "BLOCKED") {
      const targets = draggedIds.filter(tid => {
        const f = findTaskById(tid);
        return f && f.task.status !== "BLOCKED";
      });
      if (targets.length === 0) return;
      setBlockerPrompt({ taskIds: targets });
      return;
    }

    const dropRect = event?.active?.rect?.current?.translated;
    await moveTasksToStatus(draggedIds, newStatus, dropRect);
    if (isGroup) clearSelection();
  };

  const handleProgressChange = async (taskId, newProgress) => {
    // Optimistic update
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, progress: newProgress } : t)
    }));

    try {
      const patchBody = { progress: newProgress };
      if (newProgress === "IN_PROGRESS" && member) {
        const task = project.tasks.find(t => t.id === taskId);
        const alreadyAssigned = (task?.assignees ?? []).some(a => a.id === member.id);
        if (!alreadyAssigned) {
          patchBody.assigneeIds = [...(task?.assignees ?? []).map(a => a.id), member.id];
        }
      }
      const updated = await patch(`/api/tasks/${taskId}`, patchBody);
      setProject(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...updated } : t)
      }));
    } catch {
      fetchProject();
    }
  };

  const handleTaskUpdate = (updatedTask) => {
    setProject((p) =>
      p
        ? {
            ...p,
            tasks: p.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
          }
        : p
    );
    // Updates can arrive from a nested subtask modal; only re-seed the open
    // modal when the edit is actually for the task it is showing.
    setSelectedTask(prev => (prev && prev.id === updatedTask.id ? updatedTask : prev));
    // Full refetch captures parent-change restructuring and other server-side side effects.
    fetchProject();
  };

  const handleTaskDelete = (deletedTask) => {
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== deletedTask.id),
    }));
    setSelectedTask(null);
    fetchProject();
  };

  const handleCompactAssignees = async (task, memberIds) => {
    if (compactSaving) return;
    setCompactSaving(true);
    const previousTasks = project.tasks;
    const assignees = memberIds.map(memberId => allMembers.find(pm => pm.memberId === memberId)?.member).filter(Boolean);
    const update = tasks => tasks.map(top => {
      if (top.id === task.id) return { ...top, assignees };
      if ((top.subtasks ?? []).some(sub => sub.id === task.id)) {
        return { ...top, subtasks: top.subtasks.map(sub => sub.id === task.id ? { ...sub, assignees } : sub) };
      }
      return top;
    });
    setProject(prev => ({ ...prev, tasks: update(prev.tasks) }));
    setCompactLayer(prev => prev?.task?.id === task.id ? { ...prev, task: { ...prev.task, assignees } } : prev);
    try {
      const updated = await patch(`/api/tasks/${task.id}`, { assigneeIds: memberIds });
      handleTaskUpdate({ ...task, ...updated });
      setCompactLayer(prev => prev?.task?.id === task.id ? { ...prev, task: { ...task, ...updated } } : prev);
    } catch (err) {
      setProject(prev => ({ ...prev, tasks: previousTasks }));
      setCompactLayer(prev => prev?.task?.id === task.id ? { ...prev, task } : prev);
      toast.error(err?.message ?? 'Failed to update assignees');
    } finally {
      setCompactSaving(false);
    }
  };

  // ── Bulk selection actions ───────────────────────────────────

  const clearSelection = () => {
    setSelectedTaskIds(new Set());
    setLastClickedId(null);
  };

  const handleBulkPatch = async (patchFields) => {
    if (selectedTaskIds.size === 0) return;
    const ids = [...selectedTaskIds];
    setBulkActing(true);
    setProject(prev => prev ? {
      ...prev,
      tasks: prev.tasks.map(t => {
        let next = selectedTaskIds.has(t.id) ? { ...t, ...patchFields } : t;
        if (next.subtasks?.length) {
          next = { ...next, subtasks: next.subtasks.map(s => selectedTaskIds.has(s.id) ? { ...s, ...patchFields } : s) };
        }
        return next;
      }),
    } : prev);
    try {
      const res = await patch("/api/tasks/bulk", { ids, patch: patchFields });
      if (res.skipped?.length > 0) {
        alert(`${res.skipped.length} task(s) were skipped:\n` + res.skipped.map(s => `- ${s.reason}`).join("\n"));
      }
    } catch (err) {
      alert(err?.message ?? "Bulk update failed");
    } finally {
      setBulkActing(false);
      fetchProject();
      clearSelection();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    const ids = [...selectedTaskIds];
    setBulkActing(true);
    setProject(prev => prev ? {
      ...prev,
      tasks: prev.tasks
        .filter(t => !selectedTaskIds.has(t.id))
        .map(t => t.subtasks?.length ? { ...t, subtasks: t.subtasks.filter(s => !selectedTaskIds.has(s.id)) } : t),
    } : prev);
    try {
      const res = await post("/api/tasks/bulk-delete", { ids });
      if (res.skipped?.length > 0) {
        alert(`${res.skipped.length} task(s) could not be deleted:\n` + res.skipped.map(s => `- ${s.reason}`).join("\n"));
      }
      if (selectedTask && ids.includes(selectedTask.id)) setSelectedTask(null);
    } catch (err) {
      alert(err?.message ?? "Bulk delete failed");
    } finally {
      setBulkActing(false);
      setBulkDeleteConfirm(false);
      fetchProject();
      clearSelection();
    }
  };

  const handleBulkArchive = async () => {
    if (selectedTaskIds.size === 0) return;
    const ids = [...selectedTaskIds];
    setBulkActing(true);
    setProject(prev => prev ? {
      ...prev,
      tasks: prev.tasks
        .filter(t => !selectedTaskIds.has(t.id))
        .map(t => t.subtasks?.length ? { ...t, subtasks: t.subtasks.filter(s => !selectedTaskIds.has(s.id)) } : t),
    } : prev);
    try {
      const res = await bulkArchive(ids, true);
      if (res.skipped?.length > 0) {
        toast.error(`${res.skipped.length} task(s) could not be archived:\n` + res.skipped.map(s => s.reason).join(", "));
      } else {
        toast.success(`${res.updated.length} task(s) archived`);
      }
      if (selectedTask && ids.includes(selectedTask.id)) setSelectedTask(null);
    } catch (err) {
      toast.error(err?.message ?? "Bulk archive failed");
    } finally {
      setBulkActing(false);
      fetchProject();
      if (showArchived) fetchArchivedTasks();
      clearSelection();
    }
  };

  const handleUnarchiveTask = async (taskId) => {
    try {
      await unarchiveTask(taskId);
      toast.success("Task unarchived");
    } catch (err) {
      toast.error(err?.message ?? "Failed to unarchive task");
    } finally {
      fetchProject();
      fetchArchivedTasks();
    }
  };

  const handleTaskCreated = (newTask) => {
    if (newTask.projectId === project?.id) {
      setProject(prev => ({
        ...prev,
        tasks: [...(prev.tasks ?? []), newTask],
      }));
    }
    // Refetch to get full task data (tags, createdById, subtasks, etc.)
    fetchProject();
  };

  if (loading) {
    return (
      <div
        className="clubpm-app"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "2px solid var(--clubpm-accent-primary)",
            borderTopColor: "transparent",
            animation: "clubpm-spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="clubpm-app" style={{ minHeight: "100vh", padding: "48px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--clubpm-text-muted)", fontSize: 16 }}>Project not found</p>
        <Link
          to="/clubpm"
          style={{
            color: "var(--clubpm-accent-primary)",
            fontSize: 13,
            marginTop: 8,
            display: "inline-block",
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const HEALTH_COLOR_MAP = {
    ACTIVE: 'var(--pm-accent-teal)',
    PAUSED: 'var(--pm-accent-amber)',
    COMPLETED: 'var(--pm-accent-violet)',
    ARCHIVED: 'var(--pm-text-muted)',
  };
  const healthColor = HEALTH_COLOR_MAP[project.status] ?? 'var(--pm-text-muted)';

  const canEdit =
    !project.slackChannelId ||
    (project.channelMemberSlackIds ?? []).includes(member?.slackId);

  return (
    <div className="clubpm-app cpm-project-page">
    <div className="cpm-project-layout">
      <DndContext
        sensors={sensors}
        collisionDetection={kanbanCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <main ref={tabBodyRef} className="cpm-project-main">
          {/* On a phone the conversation needs the height: the shell header
              already names the project (and opens its actions), so the hero
              steps aside on Chat › Messages. */}
          <header className={`pm-proj-hero${compact && activeTab === "chat" && chatSection === "messages" ? " pm-proj-hero--m-hidden" : ""}`} data-tour-id="project.header">
            {/* Breadcrumb */}
            <div className="pm-proj-breadcrumb">
              <Link to="/clubpm" style={{ color: 'var(--pm-text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>
                Dashboard
              </Link>
              <span style={{ color: 'var(--pm-text-muted)', margin: '0 6px', fontSize: '0.8rem' }}>›</span>
              <span style={{ color: 'var(--pm-text-secondary)', fontSize: '0.8rem' }}>{project.name}</span>
            </div>

            {/* Hero row */}
            <div className="pm-proj-hero-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="pm-proj-title">{project.name}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="pm-proj-health-chip" style={{ color: healthColor, borderColor: `${healthColor}40`, background: `${healthColor}12` }}>
                    {project.status}
                  </span>
                  <span className="pm-proj-type-chip">{project.type}</span>
                  {!compact && <SlackChannelPicker project={project} channels={slackChannels} channelsState={slackChannelsState} onSaved={fetchProject} />}
                  {!compact && <DriveFolderPill project={project} isAdmin={!!member?.isAdmin} onPreview={url => setHeaderDrivePreview({ url, label: "Drive folder" })} onSaved={updated => setProject(prev => ({ ...prev, ...updated }))} />}
                  {project.slackChannelId && !canEdit && (
                    <span style={{ fontSize: 11, color: 'var(--pm-accent-amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="fas fa-lock" style={{ fontSize: 10 }} /> View only
                    </span>
                  )}
                </div>
              </div>
              <div className="pm-proj-hero-actions">
              <LabTimeButton projectId={project.id} compact={compact} />
              <LabPresenceCard projectId={project.id} variant="badge" />
              {compact ? (
                <button type="button" className="pm-m-project-actions-btn" data-tour-id="project.actions" onClick={() => requestShellOverlay('projects')} aria-haspopup="dialog">
                  <i className="fas fa-ellipsis" aria-hidden="true" /> Actions
                </button>
              ) : canEdit && (
                <button
                  className="pm-proj-edit-btn"
                  onClick={() => setShowEditProject(true)}
                  title="Edit project"
                  aria-label="Edit project"
                >
                  <i className="fas fa-pencil-alt" aria-hidden="true" />
                </button>
              )}
              {!compact && <button
                className={`pm-pin-btn${pinned ? ' active' : ''}`}
                onClick={togglePinned}
                title={pinned ? 'Unpin project' : 'Pin project'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>}
              </div>
            </div>

            {/* Progress bar */}
            <ProgressBar tasks={project.tasks} />

            {compact && (
              <details className="pm-m-project-resources" open={descEdit || undefined}>
                <summary><i className="fas fa-circle-info" aria-hidden="true" /> Project details & resources <i className="fas fa-chevron-down" aria-hidden="true" /></summary>
                <div className="pm-m-project-resources-body">
                  {descEdit ? (
                    <div className="pm-proj-description-edit">
                      <textarea className="pm-proj-description-textarea" value={descValue} onChange={e => setDescValue(e.target.value)} rows={4} autoFocus />
                      <div className="pm-proj-description-actions"><button className="pm-proj-description-save" onClick={saveDescription}>Save</button><button className="pm-proj-description-cancel" onClick={() => setDescEdit(false)}>Cancel</button></div>
                    </div>
                  ) : (
                    <div className="pm-m-project-description-row">
                      {project.description ? <p>{project.description}</p> : <p className="pm-proj-description-empty">No project description yet.</p>}
                      {member?.isAdmin ? <button type="button" className="pm-m-btn" onClick={() => { setDescValue(project.description ?? ''); setDescEdit(true); }}><i className="fas fa-pencil-alt" aria-hidden="true" /> Edit description</button> : null}
                    </div>
                  )}
                  <SlackChannelPicker project={project} channels={slackChannels} channelsState={slackChannelsState} onSaved={fetchProject} />
                  <DriveFolderPill project={project} isAdmin={!!member?.isAdmin} onPreview={url => setHeaderDrivePreview({ url, label: "Drive folder" })} onSaved={updated => setProject(prev => ({ ...prev, ...updated }))} />
                </div>
              </details>
            )}

            {/* Project description (admin-editable) */}
            {!compact && (project.description || member?.isAdmin) && (
              <div className="pm-proj-description">
                {descEdit ? (
                  <div className="pm-proj-description-edit">
                    <textarea
                      className="pm-proj-description-textarea"
                      value={descValue}
                      onChange={e => setDescValue(e.target.value)}
                      placeholder="Describe this project for the press kit, stakeholders, and team…"
                      rows={4}
                      autoFocus
                    />
                    <div className="pm-proj-description-actions">
                      <button className="pm-proj-description-save" onClick={saveDescription}>Save</button>
                      <button className="pm-proj-description-cancel" onClick={() => setDescEdit(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="pm-proj-description-display">
                    {project.description ? (() => {
                      const SNIPPET_LEN = 120;
                      const isLong = project.description.length > SNIPPET_LEN;
                      const snippet = isLong && !descExpanded
                        ? project.description.slice(0, SNIPPET_LEN).trimEnd() + "…"
                        : project.description;
                      return (
                        <span className="pm-proj-description-text">
                          {snippet}
                          {isLong && (
                            <button
                              className="pm-proj-description-toggle"
                              onClick={() => setDescExpanded(e => !e)}
                            >
                              {descExpanded ? "Show less" : "Read more"}
                            </button>
                          )}
                        </span>
                      );
                    })() : (
                      <p className="pm-proj-description-empty">No description — add one to include it in the press kit.</p>
                    )}
                    {member?.isAdmin && (
                      <button
                        className="pm-proj-description-edit-btn"
                        title="Edit description"
                        onClick={() => { setDescValue(project.description ?? ""); setDescEdit(true); }}
                      >
                        <i className="fas fa-pencil-alt" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </header>

          {activeTab === "tasks" && (
            <div className="cpm-proj-main-body" style={{ padding: "16px 0 24px" }}>
              {compact ? (
                <>
                  <div className="pm-m-task-toolbar" data-tour-id="board.filters">
                    <div className="pm-m-task-toolbar-row">
                      <div className="pm-m-segment" role="group" aria-label="Task scope" data-tour-id="board.scope">
                        <button type="button" aria-pressed={compactScope === 'mine'} onClick={() => setCompactScope('mine')}>My tasks</button>
                        <button type="button" aria-pressed={compactScope === 'all'} onClick={() => setCompactScope('all')}>All tasks</button>
                      </div>
                      {canEdit ? <button type="button" className="pm-m-btn pm-m-btn--primary" data-tour-id="board.newtask" onClick={() => { setAddTaskInitialStatus('TODO'); setShowAddTask(true); }}><i className="fas fa-plus" aria-hidden="true" /> New task</button> : null}
                    </div>
                    <div className="pm-m-task-toolbar-row">
                      <label className="pm-m-search" data-tour-id="board.search"><i className="fas fa-magnifying-glass" aria-hidden="true" /><input className="pm-m-input" type="search" value={compactQuery} onChange={e => setCompactQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" /></label>
                      <button type="button" className="pm-m-btn" data-m-opener="task-filters" onClick={() => setCompactLayer({ type: 'filters' })} aria-haspopup="dialog"><i className="fas fa-sliders" aria-hidden="true" /> Filters{compactFilterCount ? ` (${compactFilterCount})` : ''}</button>
                    </div>
                  </div>
                  <div className="pm-m-task-groups">
                    {compactTasksByBin.every(bin => bin.tasks.length === 0) ? <div className="pm-m-task-empty pm-m-task-empty--card">No tasks match this view. <button type="button" onClick={() => { setCompactScope('all'); setCompactQuery(''); setCompactPriority('all'); setCompactDue('any'); }}>Show all tasks</button></div> : null}
                    {compactTasksByBin.map(bin => <CompactStatusGroup key={bin.id} bin={bin} open={compactGroups.has(bin.id)} onToggle={() => setCompactGroups(prev => { const next = new Set(prev); if (next.has(bin.id)) next.delete(bin.id); else next.add(bin.id); return next; })} onOpenTask={handleRowClick} onMove={task => setCompactLayer({ type: 'move', task })} onAssign={task => setCompactLayer({ type: 'assign', task })} canEdit={canEdit} lead={bin.id === 'BLOCKED' ? <CompactBlockerList groups={blockedGroups} canEdit={canEdit} onEdit={blocker => setCompactLayer({ type: 'blocker-edit', blocker })} onResolve={(blocker, count) => setCompactLayer({ type: 'blocker-resolve', blocker, count })} /> : null} />)}
                  </div>
                </>
              ) : (
                <>
              <div data-tour-id="board.filters" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "0 12px 8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--pm-text-secondary)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={e => setShowArchived(e.target.checked)}
                  />
                  Show archived
                </label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6,
                           background: 'var(--pm-bg-overlay)', border: '1px solid var(--pm-border)',
                           color: 'var(--pm-text-secondary)', cursor: 'pointer' }}
                >
                  <option value="priority">Sort: Priority</option>
                  <option value="dueDate">Sort: Due Date</option>
                  <option value="status">Sort: Status</option>
                  <option value="created">Sort: Created</option>
                  <option value="title">Sort: Title</option>
                  <option value="tags">Sort: Tags</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 12px" }}>
                {tasksByBin.map((bin) => (
                  <StatusBin
                    key={bin.id}
                    bin={bin}
                    tasks={bin.tasks}
                    subtasksByParent={subtasksByParent}
                    expandedParents={expandedParents}
                    onToggleParent={(parentId) => setExpandedParents(prev => {
                      const next = new Set(prev);
                      if (next.has(parentId)) next.delete(parentId);
                      else next.add(parentId);
                      return next;
                    })}
                    isOver={overBin === bin.id}
                    overTaskId={overTaskId}
                    overBlockerId={typeof overBin === "string" && overBin.startsWith("blocker-") ? overBin : null}
                    onTaskClick={handleRowClick}
                    onAddTask={(status) => { setAddTaskInitialStatus(status); setShowAddTask(true); }}
                    canEdit={canEdit}
                    sortBy={sortBy}
                    selectedTaskIds={selectedTaskIds}
                    blockedGroups={bin.id === "BLOCKED" ? blockedGroups : undefined}
                    onResolveBlocker={handleResolveBlocker}
                    onRenameBlocker={handleRenameBlocker}
                    projectMembers={(project.members ?? []).map(pm => pm.member ?? pm)}
                  />
                ))}
              </div>
                </>
              )}

              {showArchived && (
                <div style={{ padding: "16px 12px 0" }}>
                  <button
                    className="cpm-archived-toggle"
                    aria-expanded={archivedGroupOpen}
                    onClick={() => setArchivedGroupOpen(o => !o)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      background: "var(--pm-bg-overlay)", border: "1px solid var(--pm-border)",
                      borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                      color: "var(--pm-text-secondary)", fontSize: 13, fontWeight: 600,
                    }}
                  >
                    <i className={`fas fa-chevron-${archivedGroupOpen ? "down" : "right"}`} style={{ fontSize: 11 }} aria-hidden="true" />
                    <i className="fas fa-archive" style={{ fontSize: 12 }} aria-hidden="true" />
                    Archived
                    <span style={{
                      fontSize: 11, fontWeight: 500, color: "var(--pm-text-muted)",
                      background: "var(--pm-bg-base)", borderRadius: 999, padding: "1px 8px",
                    }}>
                      {archivedLoading ? "…" : archivedTasks.length}
                    </span>
                  </button>

                  {archivedGroupOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
                      {archivedTasks.length === 0 && !archivedLoading && (
                        <p style={{ fontSize: 12, color: "var(--pm-text-muted)", padding: "0 4px" }}>No archived tasks.</p>
                      )}
                      {archivedTasks.map(t => (
                        <div
                          key={t.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            background: "var(--pm-bg-overlay)", border: "1px solid var(--pm-border)",
                            borderRadius: 8, padding: "8px 12px",
                          }}
                        >
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                            color: "var(--pm-text-muted)", background: "var(--pm-bg-base)",
                            borderRadius: 4, padding: "2px 6px",
                          }}>
                            Archived
                          </span>
                          <span style={{ fontSize: 11, color: "var(--pm-text-muted)" }}>{t.status}</span>
                          <span
                            style={{ flex: 1, fontSize: 13, color: "var(--clubpm-text-primary)", cursor: "pointer" }}
                            onClick={() => handleRowClick(t)}
                          >
                            {t.title}
                          </span>
                          <button
                            className="cpm-archived-unarchive"
                            onClick={() => handleUnarchiveTask(t.id)}
                            style={{
                              fontSize: 11, padding: "4px 10px", borderRadius: 6,
                              border: "1px solid var(--pm-border)", background: "var(--pm-bg-base)",
                              color: "var(--pm-text-secondary)", cursor: "pointer",
                            }}
                          >
                            <i className="fas fa-box-open" aria-hidden="true" /> Unarchive
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {compact ? (
                <CompactMilestones milestones={project.milestones ?? []} tasks={project.tasks} projectId={project.id} />
              ) : <div style={{ padding: "24px 0 0" }}>
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--clubpm-text-secondary)",
                    padding: "0 12px 12px",
                    margin: 0,
                  }}
                >
                  Timeline
                </h3>
                <div
                  className="clubpm-glass-card"
                  style={{ margin: "0 12px 24px", overflow: "hidden" }}
                >
                  <GanttChart tasks={project.tasks} milestones={project.milestones ?? []} />
                </div>
              </div>}
            </div>
          )}

          {activeTab === "files" && (
            <div className="cpm-proj-main-body" style={{ padding: compact ? "12px 0 24px" : "24px" }}>
              <FilesTabContent
                project={project}
                member={member}
                isAdmin={!!member?.isAdmin}
                onProjectChange={updated => setProject(prev => ({ ...prev, ...updated }))}
              />
            </div>
          )}

          {activeTab === "chat" && (
            <div className={`cpm-proj-main-body${chatSection === "messages" ? " cpm-proj-main-body--chat" : ""}`} style={{ padding: compact ? "6px var(--pm-m-gutter) 0" : "16px 24px 24px" }}>
              <div className="presskit-report-subtabs cpm-project-merged-subtabs">
                {[["messages", "Chat"], ["members", "Members"]].map(([section, label]) => (
                  <button
                    key={section}
                    type="button"
                    className={`presskit-subtab${chatSection === section ? " is-active" : ""}`}
                    onClick={() => changeChatSection(section)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {chatSection === "messages" ? (
                <ChatTab
                  project={project}
                  isAdmin={!!member?.isAdmin}
                  initialChannelId={searchParams.get("channel")}
                  initialThreadTs={searchParams.get("thread")}
                />
              ) : (
                <MembersView projectId={project.id} />
              )}
            </div>
          )}

          {activeTab === "insights" && (
            <div className="cpm-proj-main-body" style={{ padding: compact ? "12px 0 24px" : "16px 24px 24px" }}>
              {compact ? (
                // One labelled section selector, not a second sticky tab row.
                // The section still writes the same ?view= value, so existing
                // links and the legacy redirects are unaffected.
                <div className="pm-m-source pm-m-insights-source" role="group" aria-label="Insights section">
                  <span className="pm-m-source-label" id="insights-section-label">Section</span>
                  <div className="pm-m-segment pm-m-segment--grid" role="group" aria-labelledby="insights-section-label">
                    {[["charts", "Charts"], ["time", "Time"], ["activity", "Activity"], ["presskit", "Press Kit"], ["ai", "AI"]].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={reportTab === id}
                        onClick={() => changeInsightSection(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
              <div className="presskit-report-subtabs">
                {[["charts", "Charts"], ["time", "Time"], ["activity", "Activity"], ["presskit", "Press Kit"], ["ai", "AI"]].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`presskit-subtab${reportTab === id ? " is-active" : ""}`}
                    onClick={() => changeInsightSection(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              )}
              {reportTab === "charts" && (
                <ProjectAnalytics project={project} onOpenTask={handleAnalyticsOpenTask} />
              )}
              {reportTab === "time" && (
                <ProjectTimeInsights project={project} onOpenTask={handleAnalyticsOpenTask} />
              )}
              {reportTab === "activity" && (
                <div style={{ paddingTop: 8 }}>
                  <ProjectActivity
                    projectId={project.id}
                    members={project.members ?? []}
                    onOpenTask={handleActivityOpenTask}
                  />
                </div>
              )}
              {reportTab === "presskit" && <PressKitPanel project={project} canEdit={canEdit} />}
              {reportTab === "ai" && (
                <AiPanel
                  project={project}
                  allMembers={allMembers}
                  projectBlockers={projectBlockers}
                  onActionPlanExecuted={fetchProject}
                />
              )}
            </div>
          )}
        </main>

        {activeTab === "tasks" && assigneePanelOpen && !compact && (
          <AssigneePanel
            members={allMembers.length > 0 ? allMembers : (project.members || [])}
            channelMemberSlackIds={project.channelMemberSlackIds ?? []}
            hasLinkedChannel={!!project.slackChannelId}
            selectedMemberIds={selectedMemberIds}
            onMemberClick={handleMemberClick}
          />
        )}

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            (() => {
              const groupCount = selectedTaskIds.has(activeTask.id) ? selectedTaskIds.size : 1;
              const isGroup = groupCount > 1;
              return (
                <div style={{ position: "relative", cursor: "grabbing", maxWidth: 480 }}>
                  {isGroup && (
                    <>
                      <div className="cpm-drag-stack cpm-drag-stack--2" />
                      <div className="cpm-drag-stack cpm-drag-stack--1" />
                    </>
                  )}
                  <div
                    style={{
                      position: "relative",
                      opacity: 0.97,
                      transform: "scale(1.02)",
                      boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                      background: "var(--clubpm-surface-200)",
                      border: "1px solid var(--clubpm-border)",
                      borderRadius: 6,
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <PriorityBars priority={activeTask.priority} />
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--clubpm-text-primary)",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {activeTask.title}
                    </span>
                    {isGroup && <span className="cpm-drag-group-badge">{groupCount}</span>}
                  </div>
                </div>
              );
            })()
          ) : activeMember ? (
            <div className="cpm-assignee-chip" style={{ cursor: "grabbing", boxShadow: "0 8px 32px rgba(0,0,0,0.45)", opacity: 0.95 }}>
              <ChipAvatar member={activeMember.member} />
              <span className="cpm-assignee-chip-name">{activeMember.member?.displayName}</span>
              {selectedMemberIds.has(activeMember.memberId) && selectedMemberIds.size > 1 && (
                <span className="cpm-drag-group-badge">{selectedMemberIds.size}</span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          project={project}
          projectBlockers={projectBlockers}
          onBlockersChange={refreshBlockers}
          onClose={() => {
            closeTaskModal();
          }}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          onTaskCreated={handleTaskCreated}
        />
      )}

      {blockerPrompt && (
        <BlockerNameModal
          count={blockerPrompt.taskIds.length}
          projectMembers={(project.members ?? []).map(pm => pm.member ?? pm)}
          onCreate={(label, color, assigneeId) => {
            createBlockerAndAttach(label, color, blockerPrompt.taskIds, assigneeId);
            setBlockerPrompt(null);
          }}
          onCancel={() => setBlockerPrompt(null)}
        />
      )}

      {showAddTask && project && canEdit && (
        <AddProjectTaskModal
          projectId={project.id}
          initialStatus={addTaskInitialStatus}
          projectMembers={(project.members ?? []).map(pm => pm.member ?? pm)}
          onClose={() => setShowAddTask(false)}
          onCreated={handleTaskCreated}
        />
      )}

      {compact && compactLayer?.type === 'filters' && (
        <MobileSheet title="Filters & sort" onClose={() => setCompactLayer(null)} returnFocusSelector='[data-m-opener="task-filters"]'>
          <CompactTaskFilters
            sortBy={sortBy}
            onSort={setSortBy}
            priority={compactPriority}
            onPriority={setCompactPriority}
            due={compactDue}
            onDue={setCompactDue}
            showArchived={showArchived}
            onShowArchived={setShowArchived}
            onClear={() => { setSortBy('priority'); setCompactPriority('all'); setCompactDue('any'); setShowArchived(false); }}
          />
        </MobileSheet>
      )}

      {compact && compactLayer?.type === 'move' && compactLayer.task && (
        <MobileSheet title={`Move “${compactLayer.task.title}”`} onClose={() => setCompactLayer(null)}>
          <div className="pm-m-move-picker">
            {BINS.map(bin => <button key={bin.id} type="button" className="pm-m-row" aria-current={compactLayer.task.status === bin.id ? 'true' : undefined} disabled={compactLayer.task.status === bin.id || compactSaving} onClick={async () => { if (bin.id === 'BLOCKED') { setCompactLayer({ type: 'move-blocked', task: compactLayer.task }); return; } setCompactSaving(true); try { await moveTasksToStatus([compactLayer.task.id], bin.id); setCompactLayer(null); } finally { setCompactSaving(false); } }}><span className="pm-m-task-group-dot" style={{ background: bin.color }} /><span className="pm-m-row-main">{bin.label}</span>{compactLayer.task.status === bin.id ? <span className="pm-m-row-end">Current</span> : null}</button>)}
          </div>
        </MobileSheet>
      )}

      {compact && compactLayer?.type === 'assign' && compactLayer.task && (
        <MobileSheet title={`Assign “${compactLayer.task.title}”`} onClose={() => setCompactLayer(null)}>
          <CompactAssigneePicker task={compactLayer.task} members={allMembers} onChange={ids => handleCompactAssignees(compactLayer.task, ids)} />
          {compactSaving ? <div className="pm-m-save-state" role="status">Saving…</div> : null}
        </MobileSheet>
      )}

      {/* Move › Blocked asks what is blocking the task, as the desktop drop does. */}
      {compact && compactLayer?.type === 'move-blocked' && compactLayer.task && (
        <MobileSheet title={`What's blocking “${compactLayer.task.title}”?`} onClose={() => setCompactLayer(null)}>
          <div className="pm-m-move-picker">
            {(projectBlockers ?? []).filter(b => !b.resolvedAt).map(b => (
              <button key={b.id} type="button" className="pm-m-row" disabled={compactSaving} onClick={async () => { setCompactSaving(true); try { await attachBlockerToTasks([compactLayer.task.id], b.id); setCompactLayer(null); } finally { setCompactSaving(false); } }}>
                <i className="fas fa-tag pm-m-row-icon" style={{ color: b.color || undefined }} aria-hidden="true" /><div className="pm-m-row-main">{b.label}</div>
              </button>
            ))}
          </div>
          <h3 className="pm-m-sheet-subhead">New blocker</h3>
          <CompactBlockerForm
            projectMembers={(project.members ?? []).map(pm => pm.member ?? pm)}
            submitLabel="Create blocker and move"
            busy={compactSaving}
            onSubmit={async ({ label, color, assigneeId }) => { setCompactSaving(true); try { await createBlockerAndAttach(label, color, [compactLayer.task.id], assigneeId); setCompactLayer(null); } finally { setCompactSaving(false); } }}
          />
          <button type="button" className="pm-m-btn pm-m-blocker-plain" disabled={compactSaving} onClick={async () => { setCompactSaving(true); try { await moveTasksToStatus([compactLayer.task.id], 'BLOCKED'); setCompactLayer(null); } finally { setCompactSaving(false); } }}>
            Mark blocked without naming a blocker
          </button>
        </MobileSheet>
      )}

      {compact && compactLayer?.type === 'blocker-edit' && compactLayer.blocker && (
        <MobileSheet title={`Edit blocker “${compactLayer.blocker.label}”`} onClose={() => setCompactLayer(null)} returnFocusSelector={`[data-m-opener="blocker-edit-${compactLayer.blocker.id}"]`}>
          <CompactBlockerForm
            initial={compactLayer.blocker}
            projectMembers={(project.members ?? []).map(pm => pm.member ?? pm)}
            submitLabel="Save blocker"
            busy={compactSaving}
            onSubmit={async (fields) => { setCompactSaving(true); try { await handleRenameBlocker(compactLayer.blocker.id, fields); setCompactLayer(null); } finally { setCompactSaving(false); } }}
          />
        </MobileSheet>
      )}

      {compact && compactLayer?.type === 'blocker-resolve' && compactLayer.blocker && (
        <MobileSheet title={`Resolve “${compactLayer.blocker.label}”?`} onClose={() => setCompactLayer(null)} returnFocusSelector={`[data-m-opener="blocker-resolve-${compactLayer.blocker.id}"]`}>
          <div className="pm-m-blocker-confirm">
            <div>
              This removes the blocker from {compactLayer.count === 1 ? 'its 1 task' : `all ${compactLayer.count} of its tasks`}. A task with nothing else blocking it returns to To do.
            </div>
            <button type="button" className="pm-m-btn pm-m-btn--primary" disabled={compactSaving} onClick={async () => { setCompactSaving(true); try { await handleResolveBlocker(compactLayer.blocker.id); setCompactLayer(null); } finally { setCompactSaving(false); } }}>
              {compactSaving ? 'Resolving…' : 'Resolve blocker'}
            </button>
            <button type="button" className="pm-m-btn" onClick={() => setCompactLayer(null)}>Cancel</button>
          </div>
        </MobileSheet>
      )}

      {headerDrivePreview && (
        <DrivePreviewModal
          url={headerDrivePreview.url}
          label={headerDrivePreview.label}
          onClose={() => setHeaderDrivePreview(null)}
        />
      )}

      {showEditProject && (
        <EditProjectModal
          project={project}
          isAdmin={!!member?.isAdmin}
          onClose={() => setShowEditProject(false)}
          onSaved={updated => {
            // PATCH returns the bare row (no tasks/members), so merge rather than replace.
            setProject(prev => ({ ...prev, ...updated }));
            window.dispatchEvent(new CustomEvent("pm-project-updated", { detail: updated }));
          }}
        />
      )}

      {activeTab === "tasks" && canEdit && (
        <BulkActionBar
          count={selectedTaskIds.size}
          projectMembers={(project.members ?? []).map(pm => pm.member ?? pm)}
          busy={bulkActing}
          deleteConfirm={bulkDeleteConfirm}
          onAssign={(memberIds) => handleBulkPatch({ assigneeIds: memberIds })}
          onDueDate={(iso) => handleBulkPatch({ dueDate: iso })}
          onStatus={(status) => handleBulkPatch({ status })}
          onPriority={(priority) => handleBulkPatch({ priority })}
          onArchive={handleBulkArchive}
          onRequestDelete={() => setBulkDeleteConfirm(true)}
          onCancelDelete={() => setBulkDeleteConfirm(false)}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      )}
    </div>
    </div>
  );
}
