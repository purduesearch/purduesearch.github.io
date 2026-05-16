# Timeline Centering & Task Tags — Design Spec
_Date: 2026-05-15_

## Overview

Four related improvements to the ClubPM subsystem:
1. Fix Gantt timeline centering (ignore completed tasks; add left-edge anchor setting)
2. Add tags to website task creation modals (AddTaskModal, AddProjectTaskModal)
3. Display tags on task bars in Dashboard and ProjectDetail
4. Sort-by-tags grouping within status bins

---

## 1. Timeline Centering

**File:** `src/components/clubpm/GanttChart.jsx`

Add `centerMode` state: `"oldest_active" | "today" | "newest_active"`, default `"today"`.

Chart extent (minDate/maxDate, all task rows) is **unchanged** — completed tasks still render. A `useEffect` sets `scrollLeft` on the `overflow-x: auto` container ref after layout so the anchor date lands at the left edge.

Anchor date logic (non-completed = `status !== "DONE"`):
- `oldest_active` → earliest `createdAt` among non-completed tasks
- `today` → `new Date()`
- `newest_active` → latest `dueDate ?? createdAt` among non-completed tasks

UI: small labeled button group in the Gantt toolbar (next to Day/Week/Month), separated by a divider. Labels: "Oldest", "Today", "Newest".

---

## 2. Tags in Website Task Creation Modals

### AddTaskModal (Dashboard.jsx)
- On project selection change, fetch `GET /api/projects/:id/tags`
- Pill-style multi-select; each pill colored
- "+ New tag" inline creates via `POST /api/projects/:id/tags` then auto-selects
- Max 5 tags — counter badge, add UI disabled when full

### AddProjectTaskModal (ProjectDetail.jsx)
- Same as above; project fixed so tags load on mount

### TaskModal.jsx (edit screen)
- Already has add/remove; verify 5-tag limit enforced
- Add "+ New tag" inline creation (currently only selects from existing)

### Slack modal (backend/src/slack/modals.ts + actions.ts handler)
- Already has `tags_block` multi-select
- Add server-side cap of 5 tags in `new_task_submit` handler

---

## 3. Tag Display on Task Bars

### Dashboard TaskRow
- Add tag pills in meta row (after assignees + due date)
- Show up to 2 tag names; overflow as `+N`
- Pill style: tag color as border + 15% tinted background

### ProjectDetail CompactTaskRow
- Colored dots (no text, tooltip on hover) — more compact
- Show text labels if space allows (bar is wide enough)

---

## 4. Sort by Tags (Grouping Within Status Bins)

Add `"tags"` option to sort dropdown in both ProjectDetail and Dashboard.

**Within each status bin**, when `sortBy === "tags"`:
- Collect unique tags from all tasks in that bin (alphabetical by tag name)
- Render a colored sub-header per tag, then tasks carrying that tag
- Tasks with multiple tags appear under each of their tags
- Tasks with no tags → "Untagged" sub-group at bottom of bin

**Dashboard WorkPanel**: same grouping applied to the flat task list.
