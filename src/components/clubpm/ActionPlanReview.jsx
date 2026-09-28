import React, { useId, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { suggestActions, executePlan, getAiPlanPrompt, importAiPlan } from "../../api/clubPmClient";
import ClaudePromptSteps from "./ClaudePromptSteps";
import MobileSheet from "./MobileSheet";
import { useCompactLayout } from "../../clubpm/layout/compactLayout";

const TYPE_LABELS = {
  CREATE_TASK: "Create Task",
  UPDATE_TASK: "Update Task",
  DELETE_TASK: "Delete Task",
  SET_STATUS: "Set Status",
  SET_PRIORITY: "Set Priority",
  SET_DUE: "Set Due Date",
  ASSIGN: "Assign",
  CREATE_SUBTASK: "Create Subtask",
  ADD_DEPENDENCY: "Add Dependency",
  ATTACH_BLOCKER: "Attach Blocker",
  RESOLVE_BLOCKER: "Resolve Blocker",
  ADD_COMMENT: "Add Comment",
  CREATE_MILESTONE: "Create Milestone",
  LINK_MILESTONE: "Link Milestone",
};

// Which editable param keys apply to each action type — drives the field
// renderer below. Order here is the display order.
const FIELD_CONFIG = {
  CREATE_TASK: ["title", "description", "priority", "dueDate", "assigneeIds", "milestoneId", "subtasks"],
  UPDATE_TASK: ["title", "description", "priority", "dueDate", "assigneeIds"],
  DELETE_TASK: [],
  SET_STATUS: ["status"],
  SET_PRIORITY: ["priority"],
  SET_DUE: ["dueDate"],
  ASSIGN: ["assigneeIds"],
  CREATE_SUBTASK: ["title", "assigneeIds"],
  ADD_DEPENDENCY: ["blockingTaskId", "reason"],
  ATTACH_BLOCKER: ["blockerId", "reason"],
  RESOLVE_BLOCKER: ["blockerId"],
  ADD_COMMENT: ["content"],
  CREATE_MILESTONE: ["title", "description", "dueDate", "ownerId"],
  LINK_MILESTONE: ["milestoneId", "taskIds"],
};

// Action types that reference an existing task via `targetTaskId`.
const REQUIRES_TARGET = new Set([
  "UPDATE_TASK", "DELETE_TASK", "SET_STATUS", "SET_PRIORITY", "SET_DUE", "ASSIGN",
  "CREATE_SUBTASK", "ADD_DEPENDENCY", "ATTACH_BLOCKER", "ADD_COMMENT",
]);

const PRIORITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUS_LEVELS = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];

function titleCase(s) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

function toDateInputValue(v) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

export default function ActionPlanReview({ projectId, project, allMembers, projectBlockers, onExecuted }) {
  const compact = useCompactLayout();
  // Index of the action being reviewed full-screen on a phone. A proposal's
  // rationale, target picker and every editable field need more width than a
  // 320px card, so the list stays a scannable summary and each action opens
  // into the shared full-screen dialog with the same editor desktop shows.
  const [reviewIndex, setReviewIndex] = useState(null);
  const [goal, setGoal] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [planItems, setPlanItems] = useState(null); // null = no plan generated yet
  const [executing, setExecuting] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [promptText, setPromptText] = useState("");
  // The goal the current promptText was built from. Without this, editing the
  // goal after building leaves a prompt for the OLD goal sitting under a "copy
  // this" heading — the user pastes it and gets a plan for something else.
  const [promptGoal, setPromptGoal] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [importing, setImporting] = useState(false);
  const [droppedNotes, setDroppedNotes] = useState([]);

  // Only this project's members are offered as assignees/owners. The club-wide
  // roster is kept solely to name an id the AI proposed that isn't on the
  // project, so the chip reads as a person (and can be removed) rather than
  // an opaque id.
  const members = useMemo(() => (
    (project?.members || []).map(pm => pm.member ?? pm).filter(Boolean)
      .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""))
  ), [project]);
  const memberNameById = useMemo(() => {
    const map = new Map();
    for (const m of (allMembers || []).map(pm => pm.member ?? pm)) if (m?.id) map.set(m.id, m.displayName);
    for (const m of members) map.set(m.id, m.displayName);
    return map;
  }, [allMembers, members]);

  const tasks = useMemo(() => project?.tasks ?? [], [project]);
  const milestones = project?.milestones ?? [];
  const blockers = projectBlockers ?? [];

  const taskTitleById = useMemo(() => new Map(tasks.map(t => [t.id, t.title])), [tasks]);

  // Both the generated and pasted paths produce the same card list — keep one
  // adapter so the two never drift in shape.
  function toPlanItems(actions) {
    return (actions || []).map((a, i) => ({
      type: a.type,
      targetTaskId: a.targetTaskId ?? null,
      params: { ...(a.params || {}) },
      rationale: a.rationale || "",
      _id: `${Date.now()}-${i}`,
      _accepted: true,
      _result: null,
    }));
  }

  // Switching lanes clears the other lane's output. Leaving a built-in plan on
  // screen under the clipboard steps (or vice versa) makes it ambiguous which
  // lane produced the cards you are about to execute.
  function switchMode(next) {
    if (next === manualMode) return;
    setManualMode(next);
    setReviewIndex(null);
    setPlanItems(null);
    setDroppedNotes([]);
    setPromptText("");
    setPromptGoal("");
    setPasteText("");
  }

  async function handleBuildPrompt(e) {
    e.preventDefault();
    if (!goal.trim()) return;
    setLoadingPrompt(true);
    try {
      const { prompt } = await getAiPlanPrompt(projectId, goal.trim());
      setPromptText(prompt);
      setPromptGoal(goal.trim());
      setDroppedNotes([]);
    } catch (err) {
      toast.error(err.message ?? "Couldn't build the prompt. Try again.");
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function handleImport() {
    if (!pasteText.trim()) return;
    setImporting(true);
    try {
      const { actions, dropped } = await importAiPlan(projectId, pasteText);
      setReviewIndex(null);
      setPlanItems(toPlanItems(actions));
      setDroppedNotes(dropped || []);
      if (actions?.length) {
        toast.success(`Loaded ${actions.length} action${actions.length === 1 ? "" : "s"}`);
      } else {
        toast.error("That reply had no actions this project can apply.");
      }
    } catch (err) {
      toast.error(err.message ?? "Couldn't read that reply.");
    } finally {
      setImporting(false);
    }
  }

  function handleStartOver() {
    setPromptText("");
    setPromptGoal("");
    setPasteText("");
    setReviewIndex(null);
    setPlanItems(null);
    setDroppedNotes([]);
  }

  async function handleSuggest(e) {
    e.preventDefault();
    if (!goal.trim()) return;
    setSuggesting(true);
    try {
      const { actions } = await suggestActions(projectId, goal.trim());
      setReviewIndex(null);
      setPlanItems(toPlanItems(actions));
      setDroppedNotes([]);
      if (!actions?.length) toast.error("AI found no concrete actions for that goal.");
    } catch (err) {
      toast.error(err.message ?? "Failed to generate action plan");
      setReviewIndex(null);
      setPlanItems(null);
    } finally {
      setSuggesting(false);
    }
  }

  function updateItem(idx, patch) {
    setPlanItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function updateParam(idx, key, value) {
    setPlanItems(prev => prev.map((it, i) => (i === idx ? { ...it, params: { ...it.params, [key]: value } } : it)));
  }

  function toggleArrayParam(idx, key, value) {
    setPlanItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const current = Array.isArray(it.params[key]) ? it.params[key] : [];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...it, params: { ...it.params, [key]: next } };
    }));
  }

  async function handleExecute() {
    const accepted = planItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item._accepted && !item._result?.ok);
    if (!accepted.length) return;

    setExecuting(true);
    try {
      const payload = accepted.map(({ item }) => ({
        type: item.type,
        targetTaskId: item.targetTaskId,
        params: item.params,
        rationale: item.rationale,
      }));
      const { results } = await executePlan(projectId, payload);
      setPlanItems(prev => prev.map((item, idx) => {
        const pos = accepted.findIndex(a => a.index === idx);
        if (pos === -1) return item;
        return { ...item, _result: results[pos] };
      }));
      const succeeded = results.filter(r => r.ok).length;
      if (succeeded > 0) {
        toast.success(`${succeeded} of ${results.length} action(s) applied`);
        onExecuted?.();
      } else {
        toast.error("No actions could be applied");
      }
    } catch (err) {
      toast.error(err.message ?? "Failed to execute action plan");
    } finally {
      setExecuting(false);
    }
  }

  const acceptedCount = planItems?.filter(it => it._accepted && !it._result?.ok).length ?? 0;
  const promptStale = Boolean(promptText) && goal.trim() !== promptGoal;

  return (
    <div className="cpm-actionplan-section">
      <div className="cpm-actionplan-header">
        <i className="fas fa-diagram-project" aria-hidden="true" />
        Action Plan
      </div>
      <p className="cpm-actionplan-hint">
        Describe a goal and get a concrete, editable set of actions across tasks, milestones, and blockers.
        Nothing is applied until you review the cards and choose Execute.
      </p>

      <div className="cpm-actionplan-mode-row" role="group" aria-label="How to build the plan">
        <button
          type="button"
          className={`cpm-actionplan-mode-btn${manualMode ? "" : " active"}`}
          aria-pressed={!manualMode}
          onClick={() => switchMode(false)}
        >
          <span className="cpm-actionplan-mode-name">
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Built-in AI
          </span>
          <span className="cpm-actionplan-mode-sub">Writes the plan for you, on the club's quota</span>
        </button>
        <button
          type="button"
          className={`cpm-actionplan-mode-btn${manualMode ? " active" : ""}`}
          aria-pressed={manualMode}
          onClick={() => switchMode(true)}
        >
          <span className="cpm-actionplan-mode-name">
            <i className="fas fa-clipboard" aria-hidden="true" /> Plan with Claude
          </span>
          <span className="cpm-actionplan-mode-sub">You run the prompt in your own chat, then paste it back</span>
        </button>
      </div>

      <form
        className="cpm-actionplan-goal-form"
        onSubmit={manualMode ? handleBuildPrompt : handleSuggest}
      >
        <input
          type="text"
          className="cpm-actionplan-goal-input"
          data-tour-id="ai.goal"
          aria-label="Goal"
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder='e.g. "Get us ready for the design review next week"'
        />
        {manualMode ? (
          <button type="submit" className="clubpm-btn-primary" disabled={loadingPrompt || !goal.trim()}>
            {loadingPrompt
              ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Building…</>
              : <><i className="fas fa-file-lines" aria-hidden="true" /> {promptText ? "Rebuild prompt" : "Build prompt"}</>}
          </button>
        ) : (
          <button type="submit" className="clubpm-btn-primary" disabled={suggesting || !goal.trim()}>
            {suggesting
              ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Thinking…</>
              : <><i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Suggest plan</>}
          </button>
        )}
      </form>

      {manualMode && (
        <ClaudePromptSteps
          help={<>
            ClubPM makes no AI call in this mode, so it spends none of the club's quota. The prompt
            carries this project's task titles, descriptions, and member names — you are handing that
            to whichever chat app you paste it into.
          </>}
          step1={
            // <div>, not <p> — see the colour note in ClaudePromptSteps.
            <div className={`cpm-actionplan-step-note${promptStale ? " is-stale" : ""}`} role="status">
              {promptStale
                ? <><i className="fas fa-triangle-exclamation" aria-hidden="true" /> The goal changed since this prompt was built. Choose Rebuild prompt to match it.</>
                : promptText
                  ? <><i className="fas fa-circle-check" aria-hidden="true" /> Ready — built for “{promptGoal}”.</>
                  : "Type a goal above, then choose Build prompt."}
            </div>
          }
          promptText={promptText}
          stale={promptStale}
          pasteText={pasteText}
          onPasteChange={setPasteText}
          onImport={handleImport}
          importing={importing}
          onStartOver={handleStartOver}
        />
      )}

      {droppedNotes.length > 0 && (
        <div className="cpm-actionplan-dropped" role="status" aria-live="polite">
          <div className="cpm-actionplan-dropped-head">
            <i className="fas fa-filter-circle-xmark" aria-hidden="true" />
            <span>
              {droppedNotes.length} action{droppedNotes.length === 1 ? "" : "s"} couldn't be used.
              {" "}The rest loaded below.
            </span>
          </div>
          <ul>
            {droppedNotes.map((d, i) => (
              <li key={`${d.index}-${i}`}>
                <code className="cpm-actionplan-dropped-type">{TYPE_LABELS[d.type] ?? d.type}</code>
                {d.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(planItems) && planItems.length > 0 && (
        <>
          <div className="cpm-actionplan-list">
            {planItems.map((item, idx) => (compact ? (
              <ActionSummaryRow
                key={item._id}
                item={item}
                index={idx}
                targetLabel={item.targetTaskId ? (taskTitleById.get(item.targetTaskId) ?? "Unknown task") : null}
                onToggleAccept={() => updateItem(idx, { _accepted: !item._accepted })}
                onReview={() => setReviewIndex(idx)}
              />
            ) : (
              <ActionCard
                key={item._id}
                item={item}
                taskTitleById={taskTitleById}
                tasks={tasks}
                members={members}
                memberNameById={memberNameById}
                milestones={milestones}
                blockers={blockers}
                onToggleAccept={() => updateItem(idx, { _accepted: !item._accepted })}
                onSetTarget={val => updateItem(idx, { targetTaskId: val || null })}
                onParamChange={(key, value) => updateParam(idx, key, value)}
                onToggleArrayParam={(key, value) => toggleArrayParam(idx, key, value)}
              />
            )))}
          </div>

          {compact && reviewIndex !== null && planItems[reviewIndex] ? (
            <MobileSheet
              title={TYPE_LABELS[planItems[reviewIndex].type] ?? planItems[reviewIndex].type}
              onClose={() => setReviewIndex(null)}
              variant="fullscreen"
              className="pm-m-actionplan-layer"
              returnFocusSelector={`[data-m-opener="plan-action-${reviewIndex}"]`}
              footer={(
                <button
                  type="button"
                  className="pm-m-btn pm-m-btn--primary pm-m-btn--block"
                  onClick={() => setReviewIndex(null)}
                >
                  Done
                </button>
              )}
            >
              <ActionCard
                item={planItems[reviewIndex]}
                taskTitleById={taskTitleById}
                tasks={tasks}
                members={members}
                memberNameById={memberNameById}
                milestones={milestones}
                blockers={blockers}
                onToggleAccept={() => updateItem(reviewIndex, { _accepted: !planItems[reviewIndex]._accepted })}
                onSetTarget={val => updateItem(reviewIndex, { targetTaskId: val || null })}
                onParamChange={(key, value) => updateParam(reviewIndex, key, value)}
                onToggleArrayParam={(key, value) => toggleArrayParam(reviewIndex, key, value)}
              />
            </MobileSheet>
          ) : null}
          <div className="cpm-actionplan-execute-row">
            <button
              className="clubpm-btn-primary"
              disabled={executing || acceptedCount === 0}
              onClick={handleExecute}
            >
              {executing
                ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Executing…</>
                : <><i className="fas fa-play" aria-hidden="true" /> Execute {acceptedCount} action{acceptedCount === 1 ? "" : "s"}</>}
            </button>
          </div>
        </>
      )}

      {Array.isArray(planItems) && planItems.length === 0 && (
        <div className="cpm-actionplan-empty">
          {manualMode
            ? "Nothing in that reply could be applied to this project. Rebuild the prompt so the reply uses current task ids, then try again."
            : "No concrete actions were proposed for that goal — try being more specific."}
        </div>
      )}
    </div>
  );
}

/**
 * Phone list row for one proposed action: what it is, what it targets, whether
 * it is accepted, and an explicit Review control that opens the full editor.
 * Accept/decline stays on the row so the common case needs no drill-down.
 */
function ActionSummaryRow({ item, index, targetLabel, onToggleAccept, onReview }) {
  const result = item._result;
  const summary = item.params?.title || item.params?.content || item.params?.status
    || item.params?.priority || item.params?.dueDate || item.rationale || "";

  return (
    <div className={`cpm-actionplan-card pm-m-plan-row${item._accepted ? "" : " declined"}${result ? (result.ok ? " succeeded" : " failed") : ""}`}>
      <div className="pm-m-plan-row-main">
        <span className="cpm-actionplan-type-badge">{TYPE_LABELS[item.type] ?? item.type}</span>
        {targetLabel && <span className="cpm-actionplan-target">on "{targetLabel}"</span>}
        {summary && <span className="pm-m-plan-row-summary">{summary}</span>}
      </div>
      <div className="pm-m-plan-row-actions">
        <button
          type="button"
          className={`pm-m-btn${item._accepted ? " pm-m-btn--primary" : ""}`}
          onClick={onToggleAccept}
          disabled={result?.ok}
          aria-pressed={!!item._accepted}
        >
          <i className={`fas ${item._accepted ? "fa-check" : "fa-xmark"}`} aria-hidden="true" />
          {item._accepted ? " Accepted" : " Declined"}
        </button>
        <button
          type="button"
          className="pm-m-btn"
          data-m-opener={`plan-action-${index}`}
          aria-haspopup="dialog"
          onClick={onReview}
        >
          Review
        </button>
      </div>
      {result && (
        <div className={`cpm-actionplan-result ${result.ok ? "result-ok" : (result.error?.includes("Forbidden") ? "result-skip" : "result-fail")}`}>
          {result.ok
            ? <><i className="fas fa-circle-check" aria-hidden="true" /> Applied</>
            : result.error?.includes("Forbidden")
              ? <><i className="fas fa-ban" aria-hidden="true" /> Skipped: no permission</>
              : <><i className="fas fa-circle-exclamation" aria-hidden="true" /> Failed: {result.error}</>}
        </div>
      )}
    </div>
  );
}

function ActionCard({ item, taskTitleById, tasks, members, memberNameById, milestones, blockers, onToggleAccept, onSetTarget, onParamChange, onToggleArrayParam }) {
  const fields = FIELD_CONFIG[item.type] ?? [];
  const showTargetPicker = REQUIRES_TARGET.has(item.type) || item.type === "LINK_MILESTONE";
  const targetLabel = item.targetTaskId ? (taskTitleById.get(item.targetTaskId) ?? "Unknown task") : null;
  const result = item._result;

  return (
    <div className={`cpm-actionplan-card${item._accepted ? "" : " declined"}${result ? (result.ok ? " succeeded" : " failed") : ""}`}>
      <div className="cpm-actionplan-card-header">
        <span className="cpm-actionplan-type-badge">{TYPE_LABELS[item.type] ?? item.type}</span>
        {targetLabel && <span className="cpm-actionplan-target">on "{targetLabel}"</span>}
        <div className="cpm-actionplan-toggle-group">
          <button
            type="button"
            className={`cpm-actionplan-toggle-btn accept${item._accepted ? " active" : ""}`}
            onClick={onToggleAccept}
            disabled={result?.ok}
            title="Accept"
          >
            <i className="fas fa-check" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`cpm-actionplan-toggle-btn decline${!item._accepted ? " active" : ""}`}
            onClick={onToggleAccept}
            disabled={result?.ok}
            title="Decline"
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>
      </div>

      {item.rationale && <div className="cpm-actionplan-rationale">{item.rationale}</div>}

      {item._accepted && !result?.ok && (
        <div className="cpm-actionplan-fields">
          {showTargetPicker && (
            <div className="cpm-actionplan-field">
              <label>Target task</label>
              <select value={item.targetTaskId ?? ""} onChange={e => onSetTarget(e.target.value)}>
                <option value="">— none —</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          )}

          {fields.map(key => (
            <FieldEditor
              key={key}
              fieldKey={key}
              item={item}
              tasks={tasks}
              members={members}
              memberNameById={memberNameById}
              milestones={milestones}
              blockers={blockers}
              onParamChange={onParamChange}
              onToggleArrayParam={onToggleArrayParam}
            />
          ))}
        </div>
      )}

      {result && (
        <div className={`cpm-actionplan-result ${result.ok ? "result-ok" : (result.error?.includes("Forbidden") ? "result-skip" : "result-fail")}`}>
          {result.ok
            ? <><i className="fas fa-circle-check" aria-hidden="true" /> Applied</>
            : result.error?.includes("Forbidden")
              ? <><i className="fas fa-ban" aria-hidden="true" /> Skipped: no permission</>
              : <><i className="fas fa-circle-exclamation" aria-hidden="true" /> Failed: {result.error}</>}
        </div>
      )}
    </div>
  );
}

function FieldEditor({ fieldKey, item, tasks, members, memberNameById, milestones, blockers, onParamChange, onToggleArrayParam }) {
  const value = item.params[fieldKey];

  switch (fieldKey) {
    case "title":
      return (
        <div className="cpm-actionplan-field">
          <label>Title</label>
          <input type="text" value={value ?? ""} onChange={e => onParamChange("title", e.target.value)} />
        </div>
      );
    case "description":
    case "content":
    case "reason":
      return (
        <div className="cpm-actionplan-field">
          <label>{titleCase(fieldKey)}</label>
          <textarea rows={2} value={value ?? ""} onChange={e => onParamChange(fieldKey, e.target.value)} />
        </div>
      );
    case "priority":
      return (
        <div className="cpm-actionplan-field">
          <label>Priority</label>
          <select value={value ?? "MEDIUM"} onChange={e => onParamChange("priority", e.target.value)}>
            {PRIORITY_LEVELS.map(p => <option key={p} value={p}>{titleCase(p)}</option>)}
          </select>
        </div>
      );
    case "status":
      return (
        <div className="cpm-actionplan-field">
          <label>Status</label>
          <select value={value ?? "TODO"} onChange={e => onParamChange("status", e.target.value)}>
            {STATUS_LEVELS.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </div>
      );
    case "dueDate":
      return (
        <div className="cpm-actionplan-field">
          <label>Due date</label>
          <input type="date" value={toDateInputValue(value)} onChange={e => onParamChange("dueDate", e.target.value || null)} />
        </div>
      );
    case "assigneeIds":
      return (
        <div className="cpm-actionplan-field">
          <label>Assignees</label>
          <MemberCombobox
            label="Assignees"
            members={members}
            memberNameById={memberNameById}
            selectedIds={Array.isArray(value) ? value : []}
            onToggle={id => onToggleArrayParam("assigneeIds", id)}
          />
        </div>
      );
    case "subtasks":
      return (
        <div className="cpm-actionplan-field">
          <label>Subtasks (one per line)</label>
          <textarea
            rows={4}
            value={Array.isArray(value) ? value.join("\n") : (value ?? "")}
            onChange={e => onParamChange("subtasks", e.target.value.split("\n").map(s => s.trim()).filter(Boolean))}
          />
        </div>
      );
    case "milestoneId":
      return (
        <div className="cpm-actionplan-field">
          <label>Milestone</label>
          <select value={value ?? ""} onChange={e => onParamChange("milestoneId", e.target.value || undefined)}>
            <option value="">— none —</option>
            {milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
      );
    case "ownerId":
      return (
        <div className="cpm-actionplan-field">
          <label>Owner</label>
          <MemberCombobox
            label="Owner"
            single
            members={members}
            memberNameById={memberNameById}
            selectedIds={value ? [value] : []}
            onToggle={id => onParamChange("ownerId", id === value ? undefined : id)}
          />
        </div>
      );
    case "blockingTaskId":
      return (
        <div className="cpm-actionplan-field">
          <label>Blocked by</label>
          <select value={value ?? ""} onChange={e => onParamChange("blockingTaskId", e.target.value)}>
            <option value="">— select task —</option>
            {tasks.filter(t => t.id !== item.targetTaskId).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
      );
    case "blockerId":
      return (
        <div className="cpm-actionplan-field">
          <label>Blocker</label>
          <select value={value ?? ""} onChange={e => onParamChange("blockerId", e.target.value)}>
            <option value="">— select blocker —</option>
            {blockers.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
      );
    case "taskIds":
      return (
        <div className="cpm-actionplan-field">
          <label>Additional tasks</label>
          <div className="cpm-actionplan-chip-list">
            {tasks.map(t => (
              <button
                type="button"
                key={t.id}
                className={`cpm-actionplan-chip${(value ?? []).includes(t.id) ? " selected" : ""}`}
                onClick={() => onToggleArrayParam("taskIds", t.id)}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Searchable member picker for the action-plan editor. Selected people show as
 * removable chips; typing filters the project's members in a dropdown listbox.
 * `single` makes a choice replace the current one and closes the list.
 */
function MemberCombobox({ label, members, memberNameById, selectedIds, onToggle, single = false }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();

  const q = query.trim().toLowerCase();
  const options = useMemo(() => members.filter(m => (
    !selectedIds.includes(m.id)
    && (!q || (m.displayName ?? "").toLowerCase().includes(q) || (m.slackHandle ?? "").toLowerCase().includes(q))
  )), [members, selectedIds, q]);

  function choose(m) {
    if (single && selectedIds[0] && selectedIds[0] !== m.id) onToggle(selectedIds[0]);
    onToggle(m.id);
    setQuery("");
    setActiveIdx(0);
    if (single) setOpen(false);
    else inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx(i => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && options[activeIdx]) {
        e.preventDefault();
        choose(options[activeIdx]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === "Backspace" && !query && selectedIds.length) {
      onToggle(selectedIds[selectedIds.length - 1]);
    }
  }

  const activeId = open && options[activeIdx] ? `${listId}-${options[activeIdx].id}` : undefined;

  return (
    <div className="cpm-member-combobox">
      {selectedIds.length > 0 && (
        <div className="cpm-actionplan-chip-list">
          {selectedIds.map(id => {
            const name = memberNameById.get(id) ?? "Unknown member";
            return (
              <button
                type="button"
                key={id}
                className="cpm-actionplan-chip selected"
                onClick={() => onToggle(id)}
                aria-label={`Remove ${name}`}
                title={`Remove ${name}`}
              >
                {name} <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      <div className="cpm-member-combobox-field">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={`Search project members for ${label}`}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          placeholder={single && selectedIds.length ? "Change owner…" : "Search project members…"}
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIdx(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {open && (
          <ul className="cpm-member-combobox-list" id={listId} role="listbox" aria-label={label}>
            {options.length === 0 ? (
              <li className="cpm-member-combobox-empty" role="presentation">
                {members.length === 0 ? "This project has no members" : "No matching project members"}
              </li>
            ) : options.map((m, i) => (
              <li
                key={m.id}
                id={`${listId}-${m.id}`}
                role="option"
                aria-selected={i === activeIdx}
                className={`cpm-member-combobox-option${i === activeIdx ? " active" : ""}`}
                // mousedown, not click: the input's blur would close the list first.
                onMouseDown={e => { e.preventDefault(); choose(m); }}
                onMouseEnter={() => setActiveIdx(i)}
              >
                {m.avatarUrl
                  ? <img src={m.avatarUrl} alt="" className="cpm-member-combobox-avatar" />
                  : <i className="fas fa-user cpm-member-combobox-avatar" aria-hidden="true" />}
                {m.displayName}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
