# Timeline Centering & Task Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Gantt timeline centering to ignore completed tasks, add a left-edge anchor setting, add tag support to all website task creation modals, display tags on task rows, and add sort-by-tags grouping within status bins.

**Architecture:** All changes are pure frontend edits except one backend one-liner (Slack 5-tag cap). The GanttChart gains a `centerMode` state and a scroll ref. The three task-creation modals gain tag state + inline creation. TaskRow and CompactTaskRow gain tag pill rendering. StatusBin and WorkPanel gain tag-group rendering when `sortBy === "tags"`.

**Tech Stack:** React 19, plain CSS custom properties, existing `get`/`post`/`patch` REST helpers from `../../api/clubPmClient`, Prisma Tag model, `@slack/bolt` view handler.

---

## File Map

| File | What changes |
|------|-------------|
| `src/components/clubpm/GanttChart.jsx` | centerMode state, scrollRef, anchor scroll effect, toolbar buttons |
| `src/components/clubpm/TaskModal.jsx` | 5-tag limit on `addTag`, inline tag creation UI + state |
| `src/pages/ClubPM/Dashboard.jsx` | Tags in `AddTaskModal`; tag pills on `TaskRow`; sort-by-tags in `WorkPanel` |
| `src/pages/ClubPM/ProjectDetail.jsx` | Tags in `AddProjectTaskModal`; tag dots on `CompactTaskRow`; sort-by-tags in `StatusBin` + sort dropdown |
| `backend/src/slack/modals.ts` | `.slice(0, 5)` on tagIds in `new_task_submit` handler |

---

## Task 1: GanttChart — centerMode + scroll anchor

**Files:**
- Modify: `src/components/clubpm/GanttChart.jsx`

- [ ] **Step 1: Add `centerMode` state and `scrollRef`**

In `GanttChart`, after the existing state declarations (after `const [containerWidth, setContainerWidth] = useState(0);`), add:

```jsx
const [centerMode, setCenterMode] = useState("today");
const scrollRef = useRef(null);
```

`useRef` is already imported on line 1.

- [ ] **Step 2: Add `anchorScrollX` memo**

After the `criticalPathSet` useMemo, add:

```jsx
const anchorScrollX = useMemo(() => {
  const active = tasks.filter(t => t.status !== "DONE" && t.progress !== "COMPLETED");
  let anchorDate;
  if (centerMode === "today") {
    anchorDate = new Date();
  } else if (centerMode === "oldest_active") {
    if (!active.length) return 0;
    anchorDate = new Date(Math.min(...active.map(t => new Date(t.createdAt).getTime())));
  } else {
    if (!active.length) return 0;
    anchorDate = new Date(Math.max(...active.map(t =>
      t.dueDate ? new Date(t.dueDate).getTime() : new Date(t.createdAt).getTime()
    )));
  }
  const diffMs = anchorDate.getTime() - minDate.getTime();
  return Math.max(0, (diffMs / 86400000) * DAY_WIDTH);
}, [centerMode, tasks, minDate, DAY_WIDTH]);
```

- [ ] **Step 3: Add scroll effect**

After `anchorScrollX`, add:

```jsx
useEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollLeft = anchorScrollX;
  }
}, [anchorScrollX]);
```

- [ ] **Step 4: Update toolbar JSX**

Replace the entire `<div className="pm-gantt-toolbar">` block with:

```jsx
<div className="pm-gantt-toolbar">
  {["day", "week", "month"].map((s) => (
    <button
      key={s}
      className={`pm-gantt-scale-btn${scale === s ? " active" : ""}`}
      onClick={() => setScale(s)}
    >
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </button>
  ))}
  <div style={{ width: 1, background: "var(--clubpm-border)", margin: "0 8px", alignSelf: "stretch" }} />
  {[
    { id: "oldest_active", label: "Oldest" },
    { id: "today",         label: "Today"  },
    { id: "newest_active", label: "Newest" },
  ].map((m) => (
    <button
      key={m.id}
      className={`pm-gantt-scale-btn${centerMode === m.id ? " active" : ""}`}
      onClick={() => setCenterMode(m.id)}
    >
      {m.label}
    </button>
  ))}
</div>
```

- [ ] **Step 5: Attach `scrollRef` to the scrollable div**

Find `<div className="overflow-x-auto">` and change it to:

```jsx
<div className="overflow-x-auto" ref={scrollRef}>
```

- [ ] **Step 6: Verify manually**

Run `npm start`. Open a project Gantt view. Confirm:
- "Today" button scrolls so today's line is at the left edge of the chart area.
- "Oldest" scrolls to the oldest non-completed task's creation date.
- "Newest" scrolls to the newest non-completed task's due date.
- Completed tasks still render in the row list.

- [ ] **Step 7: Commit**

```bash
git add src/components/clubpm/GanttChart.jsx
git commit -m "feat: add gantt centerMode anchor setting (oldest/today/newest active task)"
```

---

## Task 2: TaskModal — 5-tag limit + inline tag creation

**Files:**
- Modify: `src/components/clubpm/TaskModal.jsx`

- [ ] **Step 1: Add `newTagName`, `newTagColor`, `creatingTag` state**

After the existing `const [projectTags, setProjectTags] = useState([]);` (line 889), add:

```jsx
const [newTagName, setNewTagName] = useState("");
const [newTagColor, setNewTagColor] = useState("#6c5ce7");
const [creatingTag, setCreatingTag] = useState(false);
```

- [ ] **Step 2: Guard `addTag` with 5-tag limit**

Replace the `addTag` function (lines 1095–1100):

```jsx
function addTag(tag) {
  if (!tag || tags.length >= 5) return;
  if (tags.some(t => (t.id ?? t) === (tag.id ?? tag))) return;
  const newTags = [...tags, tag];
  setTags(newTags);
  saveField({ tagIds: newTags.map(t => t.id) });
}
```

- [ ] **Step 3: Add `createTag` async function**

After `removeTag` (after line 1106), add:

```jsx
async function createTag() {
  if (!newTagName.trim() || !task.projectId || creatingTag) return;
  setCreatingTag(true);
  try {
    const tag = await post(`/api/projects/${task.projectId}/tags`, {
      name: newTagName.trim(),
      color: newTagColor,
    });
    setProjectTags(prev => [...prev, tag]);
    addTag(tag);
    setNewTagName("");
  } catch {
    // tag with that name may already exist — ignore
  } finally {
    setCreatingTag(false);
  }
}
```

- [ ] **Step 4: Update the Tags MetaRow render**

Replace the entire `<MetaRow label="Tags">` block (lines 1376–1413) with:

```jsx
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
            cursor: newTagName.trim() ? "pointer" : "default",
            opacity: newTagName.trim() ? 1 : 0.45 }}>
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
```

- [ ] **Step 5: Verify manually**

Open the TaskModal on an existing task. Confirm:
- Existing tags show with × to remove.
- Can add an existing project tag from dropdown.
- Can create a new tag inline (name + color picker + Create button).
- After 5 tags, the add controls disappear and "Max 5 tags" appears.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/TaskModal.jsx
git commit -m "feat: add 5-tag limit and inline tag creation to task edit modal"
```

---

## Task 3: Dashboard — Tags in AddTaskModal

**Files:**
- Modify: `src/pages/ClubPM/Dashboard.jsx`

- [ ] **Step 1: Add tag state to `AddTaskModal`**

In `AddTaskModal`, after `const [error, setError] = useState(null);`, add:

```jsx
const [tags, setTags]           = useState([]);
const [projectTags, setProjectTags] = useState([]);
const [newTagName, setNewTagName]   = useState("");
const [newTagColor, setNewTagColor] = useState("#6c5ce7");
const [creatingTag, setCreatingTag] = useState(false);
```

- [ ] **Step 2: Fetch tags when `projectId` changes**

After the state declarations, add:

```jsx
useEffect(() => {
  if (!projectId) { setProjectTags([]); setTags([]); return; }
  get(`/api/projects/${projectId}/tags`).then(setProjectTags).catch(() => {});
  setTags([]);
}, [projectId]);
```

- [ ] **Step 3: Add tag helpers**

After the `useEffect`, add:

```jsx
function addTag(tag) {
  if (!tag || tags.length >= 5 || tags.some(t => t.id === tag.id)) return;
  setTags(prev => [...prev, tag]);
}
function removeTag(tagId) {
  setTags(prev => prev.filter(t => t.id !== tagId));
}
async function createTag() {
  if (!newTagName.trim() || !projectId || creatingTag) return;
  setCreatingTag(true);
  try {
    const tag = await post(`/api/projects/${projectId}/tags`, { name: newTagName.trim(), color: newTagColor });
    setProjectTags(prev => [...prev, tag]);
    addTag(tag);
    setNewTagName("");
  } catch { } finally { setCreatingTag(false); }
}
```

- [ ] **Step 4: Pass `tagIds` in `handleSubmit`**

In `handleSubmit`, change the `post` call to:

```jsx
await post(`/api/projects/${projectId}/tasks`, {
  title: title.trim(),
  priority,
  dueDate: dueDate || undefined,
  tagIds: tags.map(t => t.id),
});
```

- [ ] **Step 5: Add tags UI in the form**

After the Due Date `<div>` block and before the `{error && ...}` block, add:

```jsx
<div>
  <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>
    Tags {tags.length > 0 && (
      <span style={{ color: "var(--clubpm-text-muted)", fontWeight: 400 }}>({tags.length}/5)</span>
    )}
  </div>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
    {tags.map(tag => (
      <span key={tag.id} style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "2px 8px", borderRadius: 10, fontSize: 11,
        background: tag.color + "22", border: `1px solid ${tag.color}`, color: tag.color,
      }}>
        {tag.name}
        <button onClick={() => removeTag(tag.id)} style={{
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
          style={{ width: "100%", padding: "6px 10px", borderRadius: 6, marginBottom: 5,
            background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
            color: "var(--clubpm-text-muted)", fontSize: 12 }}
        >
          <option value="">+ Add existing tag</option>
          {projectTags.filter(pt => !tags.some(t => t.id === pt.id))
            .map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
        </select>
      )}
      <div style={{ display: "flex", gap: 5 }}>
        <input type="text" placeholder="New tag name" value={newTagName}
          onChange={e => setNewTagName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && createTag()}
          style={{ flex: 1, padding: "5px 8px", borderRadius: 6, fontSize: 12,
            background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
            color: "var(--clubpm-text-primary)", outline: "none" }} />
        <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
          style={{ width: 30, padding: 1, borderRadius: 4, cursor: "pointer",
            border: "1px solid var(--clubpm-border)", background: "transparent" }} />
        <button onClick={createTag} disabled={!newTagName.trim() || creatingTag}
          style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12,
            background: "var(--clubpm-accent-primary)", border: "none", color: "#fff",
            cursor: newTagName.trim() ? "pointer" : "default",
            opacity: newTagName.trim() ? 1 : 0.5 }}>
          {creatingTag ? "…" : "Create"}
        </button>
      </div>
    </>
  )}
  {tags.length >= 5 && (
    <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>Max 5 tags</span>
  )}
</div>
```

- [ ] **Step 6: Verify manually**

Open Dashboard → click + to add a task. Confirm tags section appears, lets you select existing project tags or create new ones, caps at 5, and created tasks show tags when reopened in TaskModal.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ClubPM/Dashboard.jsx
git commit -m "feat: add tag selection and creation to dashboard AddTaskModal"
```

---

## Task 4: ProjectDetail — Tags in AddProjectTaskModal

**Files:**
- Modify: `src/pages/ClubPM/ProjectDetail.jsx`

- [ ] **Step 1: Add tag state to `AddProjectTaskModal`**

In `AddProjectTaskModal`, after `const [milestones, setMilestones] = useState([]);`, add:

```jsx
const [tags, setTags]               = useState([]);
const [projectTags, setProjectTags] = useState([]);
const [newTagName, setNewTagName]   = useState("");
const [newTagColor, setNewTagColor] = useState("#6c5ce7");
const [creatingTag, setCreatingTag] = useState(false);
```

- [ ] **Step 2: Fetch tags on mount**

In the existing `useEffect` (the one that fetches milestones), add a tags fetch inside it:

```jsx
useEffect(() => {
  get(`/api/milestones/project/${projectId}`)
    .then(ms => setMilestones(
      ms.filter(m => m.status !== "COMPLETED" && m.status !== "CANCELLED")
    ))
    .catch(() => {});
  get(`/api/projects/${projectId}/tags`).then(setProjectTags).catch(() => {});
}, [projectId]);
```

- [ ] **Step 3: Add tag helpers**

After the `useEffect`, add:

```jsx
function addTag(tag) {
  if (!tag || tags.length >= 5 || tags.some(t => t.id === tag.id)) return;
  setTags(prev => [...prev, tag]);
}
function removeTag(tagId) {
  setTags(prev => prev.filter(t => t.id !== tagId));
}
async function createTag() {
  if (!newTagName.trim() || creatingTag) return;
  setCreatingTag(true);
  try {
    const tag = await post(`/api/projects/${projectId}/tags`, { name: newTagName.trim(), color: newTagColor });
    setProjectTags(prev => [...prev, tag]);
    addTag(tag);
    setNewTagName("");
  } catch { } finally { setCreatingTag(false); }
}
```

- [ ] **Step 4: Pass `tagIds` in `handleSubmit`**

In `handleSubmit`, change the `post` call to:

```jsx
const newTask = await post(`/api/projects/${projectId}/tasks`, {
  title: title.trim(),
  priority,
  status: initialStatus,
  dueDate: dueDate || undefined,
  milestoneId: milestoneId || undefined,
  tagIds: tags.map(t => t.id),
});
```

- [ ] **Step 5: Add tags UI in the form**

After the milestone `<div>` (the one conditionally shown when `milestones.length > 0`) and before the `{error && ...}` block, add:

```jsx
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
        <button onClick={() => removeTag(tag.id)} style={{
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
          onKeyDown={e => e.key === "Enter" && createTag()}
          style={{ ...inputStyle, flex: 1 }} />
        <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
          style={{ width: 38, padding: 2, borderRadius: 6, cursor: "pointer",
            border: "1px solid var(--clubpm-border)", background: "transparent" }} />
        <button onClick={createTag} disabled={!newTagName.trim() || creatingTag}
          style={{ padding: "7px 14px", borderRadius: 7, border: "none",
            background: "var(--clubpm-accent-primary)", color: "#fff", fontSize: 13,
            cursor: newTagName.trim() ? "pointer" : "default",
            opacity: newTagName.trim() ? 1 : 0.5 }}>
          {creatingTag ? "…" : "Create"}
        </button>
      </div>
    </>
  )}
  {tags.length >= 5 && (
    <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)" }}>Max 5 tags</span>
  )}
</div>
```

Note: `inputStyle` and `labelStyle` are already defined as local constants in `AddProjectTaskModal`.

- [ ] **Step 6: Verify manually**

Open a project → "Add Task" in a status bin → confirm tags UI appears, selection and creation work, cap enforced. Created task should show tags in the kanban row.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ClubPM/ProjectDetail.jsx
git commit -m "feat: add tag selection and creation to project AddProjectTaskModal"
```

---

## Task 5: Dashboard — Tag pills on TaskRow

**Files:**
- Modify: `src/pages/ClubPM/Dashboard.jsx`

- [ ] **Step 1: Add tag pills inside `TaskRow`'s meta div**

In `TaskRow`, find the `<div className="cpm-task-row-meta">` block. After the due date `<span>` (and still inside the meta div), add:

```jsx
{task.tags && task.tags.length > 0 && (
  <div style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
    {task.tags.slice(0, 2).map(tag => (
      <span key={tag.id} style={{
        fontSize: 10, padding: "1px 6px", borderRadius: 8,
        background: tag.color + "22", border: `1px solid ${tag.color}`,
        color: tag.color, whiteSpace: "nowrap",
      }}>
        {tag.name}
      </span>
    ))}
    {task.tags.length > 2 && (
      <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)", whiteSpace: "nowrap" }}>
        +{task.tags.length - 2}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 2: Verify manually**

Go to Dashboard. Tasks with tags should show colored pill(s) in the row. Tasks with no tags are unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClubPM/Dashboard.jsx
git commit -m "feat: show tag pills on dashboard task rows"
```

---

## Task 6: ProjectDetail — Tag indicators on CompactTaskRow

**Files:**
- Modify: `src/pages/ClubPM/ProjectDetail.jsx`

- [ ] **Step 1: Add tag indicators inside `CompactTaskRow`**

In `CompactTaskRow`, find the due date `<span>` at the end of the row. After that span (still inside the outer `<div>`), add:

```jsx
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
```

- [ ] **Step 2: Verify manually**

Open a project with tagged tasks. Tags should appear as small colored pills on each kanban row.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClubPM/ProjectDetail.jsx
git commit -m "feat: show tag pills on project detail compact task rows"
```

---

## Task 7: ProjectDetail — Sort-by-tags grouping in StatusBin

**Files:**
- Modify: `src/pages/ClubPM/ProjectDetail.jsx`

- [ ] **Step 1: Add `getTagGroups` helper at module level**

After the `PRIORITY_RANK` constant and before any component definitions, add:

```jsx
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
```

- [ ] **Step 2: Add `"tags"` to `tasksByBin` sort logic**

In the `tasksByBin` useMemo, in the `sorted` function, add a new case before the final `return 0`:

```jsx
if (sortBy === "tags") {
  const aTag = (a.tags?.[0]?.name ?? "").toLowerCase();
  const bTag = (b.tags?.[0]?.name ?? "").toLowerCase();
  if (!aTag && bTag) return 1;
  if (aTag && !bTag) return -1;
  return aTag.localeCompare(bTag);
}
```

- [ ] **Step 3: Add `"tags"` option to the sort dropdown**

Find the sort `<select>` in the `activeTab === "tasks"` render. Add:

```jsx
<option value="tags">Sort: Tags</option>
```

- [ ] **Step 4: Pass `sortBy` to `StatusBin`**

In the `tasksByBin.map(bin => <StatusBin ... />)` call, add `sortBy={sortBy}` as a prop.

- [ ] **Step 5: Update `StatusBin` to accept and use `sortBy`**

In the `StatusBin` function signature, add `sortBy = "priority"` to the destructured props:

```jsx
function StatusBin({ bin, tasks, subtasksByParent, expandedParents, onToggleParent, isOver, overTaskId, onTaskClick, onAddTask, canEdit = true, sortBy = "priority" }) {
```

Then in the `!collapsed` render, replace the `<SortableContext>` block's inner content with tag-grouping logic. Find the block that maps tasks:

```jsx
{tasks.length === 0 ? (
  <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--clubpm-text-muted)", fontStyle: "italic" }}>
    Drop tasks here
  </div>
) : (
  tasks.map((task) => { ... })
)}
```

Replace with:

```jsx
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
            background: group.tag.color + "22", border: `1px solid ${group.tag.color}`,
            color: group.tag.color,
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
            />
            {isExpanded && subs.map((sub) => (
              <KanbanSubtaskRow key={sub.id} subtask={sub} onClick={onTaskClick} isDropTarget={overTaskId === sub.id} />
            ))}
          </React.Fragment>
        );
      })}
    </React.Fragment>
  ))
) : (
  tasks.map((task) => {
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
        />
        {isExpanded && subs.map((sub) => (
          <KanbanSubtaskRow key={sub.id} subtask={sub} onClick={onTaskClick} isDropTarget={overTaskId === sub.id} />
        ))}
      </React.Fragment>
    );
  })
)}
```

Note: The `SortableContext items` prop stays as `tasks.map(t => t.id)` — this keeps DnD functional (each task ID is unique in the list; tasks appear once under their first tag).

- [ ] **Step 6: Verify manually**

In a project with tagged tasks, select "Sort: Tags" from the dropdown. Confirm status bins show tag sub-headers with tasks grouped beneath them. DnD to move tasks between bins should still work.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ClubPM/ProjectDetail.jsx
git commit -m "feat: add sort-by-tags grouping within project detail status bins"
```

---

## Task 8: Dashboard — Sort-by-tags grouping in WorkPanel

**Files:**
- Modify: `src/pages/ClubPM/Dashboard.jsx`

- [ ] **Step 1: Add `getTagGroups` helper at module level in Dashboard.jsx**

After the `applyFilters` and `activeFilterCount` helpers, add:

```jsx
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
```

- [ ] **Step 2: Add `sortBy` state to `WorkPanel`**

In `WorkPanel`, after `const [showRecap, setShowRecap] = useState(false);`, add:

```jsx
const [sortBy, setSortBy] = useState("default");
```

- [ ] **Step 3: Add `groupedTasks` memo**

After the `filtered` useMemo in WorkPanel, add:

```jsx
const groupedTasks = useMemo(() => {
  if (sortBy !== "tags") return null;
  return getTagGroups(filtered);
}, [sortBy, filtered]);
```

- [ ] **Step 4: Add sort control to the panel header**

In the `cpm-panel-header-right` div (which currently just has the + button), add the sort select before the + button:

```jsx
<div className="cpm-panel-header-right">
  <select
    value={sortBy}
    onChange={e => setSortBy(e.target.value)}
    style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6,
      background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
      color: "var(--clubpm-text-secondary)", cursor: "pointer" }}
  >
    <option value="default">Sort: Default</option>
    <option value="tags">Sort: Tags</option>
  </select>
  <button className="cpm-panel-icon-btn" title="Add task" onClick={() => setShowAddTask(true)}>
    <i className="fas fa-plus" />
  </button>
</div>
```

- [ ] **Step 5: Update the task list render**

Replace the `<div className="cpm-work-list">` contents with:

```jsx
<div className="cpm-work-list">
  {sortBy === "tags" && groupedTasks ? (
    groupedTasks.length === 0 ? (
      <p className="cpm-empty-msg">No tasks assigned to you</p>
    ) : (
      groupedTasks.map(group => (
        <React.Fragment key={group.tag?.id ?? "untagged"}>
          <div style={{
            padding: "8px 16px 3px",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {group.tag ? (
              <span style={{
                fontSize: 10, padding: "1px 8px", borderRadius: 8, fontWeight: 600,
                background: group.tag.color + "22", border: `1px solid ${group.tag.color}`,
                color: group.tag.color,
              }}>
                {group.tag.name}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)", fontWeight: 600 }}>Untagged</span>
            )}
            <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>{group.tasks.length}</span>
          </div>
          {group.tasks.map(task => (
            <TaskRow key={task.id} task={task} onProgressChange={onProgressChange} showProject />
          ))}
        </React.Fragment>
      ))
    )
  ) : (
    filtered.length === 0 ? (
      <p className="cpm-empty-msg">
        {tasks.length === 0 ? "No tasks assigned to you" : "No tasks match your filters"}
      </p>
    ) : (
      filtered.map(task => (
        <TaskRow key={task.id} task={task} onProgressChange={onProgressChange} showProject />
      ))
    )
  )}
</div>
```

- [ ] **Step 6: Verify manually**

Dashboard → switch sort to "Tags" → tasks should group under colored tag headers, untagged tasks under "Untagged" at the bottom. Switching back to "Default" restores the flat list.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ClubPM/Dashboard.jsx
git commit -m "feat: add sort-by-tags grouping to dashboard work panel"
```

---

## Task 9: Slack — Server-side 5-tag cap

**Files:**
- Modify: `backend/src/slack/modals.ts`

- [ ] **Step 1: Slice tagIds to 5 in the new_task_submit handler**

In `modals.ts`, find the `new_task_submit` handler (line 631). Find this line (around line 661):

```ts
const tagIds = (values.tags_block?.tags?.selected_options ?? [])
  .map((o: any) => o.value).filter((v: string) => v !== "none");
```

Change it to:

```ts
const tagIds = (values.tags_block?.tags?.selected_options ?? [])
  .map((o: any) => o.value).filter((v: string) => v !== "none").slice(0, 5);
```

- [ ] **Step 2: Verify**

Run `cd backend && npm run build`. Confirm no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/slack/modals.ts
git commit -m "fix: enforce 5-tag limit server-side in slack new_task_submit handler"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Timeline centering: `centerMode` state, scroll to left edge, 3 modes — Task 1
- ✅ Ignore completed tasks for centering: anchor computed from `status !== "DONE" && progress !== "COMPLETED"` — Task 1
- ✅ Tags in website task modal (edit): 5-limit + inline creation — Task 2
- ✅ Tags in website task creation (Dashboard): — Task 3
- ✅ Tags in website task creation (ProjectDetail): — Task 4
- ✅ Tags displayed on dashboard task bars: — Task 5
- ✅ Tags displayed on project detail task bars: — Task 6
- ✅ Sort-by-tags grouping in ProjectDetail: — Task 7
- ✅ Sort-by-tags grouping in Dashboard: — Task 8
- ✅ Slack 5-tag cap: — Task 9

**Placeholder scan:** No TBDs, all code blocks complete.

**Type consistency:**
- `getTagGroups` returns `{ tag: Tag | null, tasks: Task[] }[]` consistently across Tasks 7 and 8
- `addTag(tag)`, `removeTag(tagId)` naming is consistent across Tasks 2, 3, 4
- `tags.map(t => t.id)` used consistently for `tagIds` payload in Tasks 2, 3, 4
