import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { suggestActions, executePlan, getAiPlanPrompt, importAiPlan } from "../../api/clubPmClient";

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
  const [goal, setGoal] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [planItems, setPlanItems] = useState(null); // null = no plan generated yet
  const [executing, setExecuting] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [importing, setImporting] = useState(false);
  const [droppedNotes, setDroppedNotes] = useState([]);

  const members = useMemo(() => {
    const src = allMembers?.length ? allMembers : (project?.members || []);
    return src.map(pm => pm.member ?? pm).filter(Boolean);
  }, [allMembers, project]);

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

  async function handleBuildPrompt(e) {
    e.preventDefault();
    if (!goal.trim()) return;
    setLoadingPrompt(true);
    try {
      const { prompt } = await getAiPlanPrompt(projectId, goal.trim());
      setPromptText(prompt);
      setDroppedNotes([]);
    } catch (err) {
      toast.error(err.message ?? "Failed to build the prompt");
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(promptText);
      toast.success("Prompt copied — paste it into Claude");
    } catch {
      toast.error("Could not copy. Select the text and copy manually.");
    }
  }

  async function handleImport() {
    if (!pasteText.trim()) return;
    setImporting(true);
    try {
      const { actions, dropped } = await importAiPlan(projectId, pasteText);
      setPlanItems(toPlanItems(actions));
      setDroppedNotes(dropped || []);
      if (!actions?.length) toast.error("No usable actions were found in that reply.");
    } catch (err) {
      toast.error(err.message ?? "Could not read that reply");
    } finally {
      setImporting(false);
    }
  }

  async function handleSuggest(e) {
    e.preventDefault();
    if (!goal.trim()) return;
    setSuggesting(true);
    try {
      const { actions } = await suggestActions(projectId, goal.trim());
      setPlanItems(toPlanItems(actions));
      setDroppedNotes([]);
      if (!actions?.length) toast.error("AI found no concrete actions for that goal.");
    } catch (err) {
      toast.error(err.message ?? "Failed to generate action plan");
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

  return (
    <div className="cpm-actionplan-section">
      <div className="cpm-actionplan-header">
        <i className="fas fa-diagram-project" aria-hidden="true" />
        Action Plan
      </div>
      <p className="cpm-actionplan-hint">
        Describe a goal and get a concrete, editable set of actions across tasks, milestones, and blockers.
      </p>

      <div className="cpm-actionplan-mode-row">
        <button
          type="button"
          className={`cpm-actionplan-mode-btn${manualMode ? "" : " active"}`}
          onClick={() => setManualMode(false)}
        >
          <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Built-in AI
        </button>
        <button
          type="button"
          className={`cpm-actionplan-mode-btn${manualMode ? " active" : ""}`}
          onClick={() => setManualMode(true)}
        >
          <i className="fas fa-clipboard" aria-hidden="true" /> Plan with Claude
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
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder='e.g. "Get us ready for the design review next week"'
        />
        {manualMode ? (
          <button type="submit" className="clubpm-btn-primary" disabled={loadingPrompt || !goal.trim()}>
            {loadingPrompt
              ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Building…</>
              : <><i className="fas fa-file-lines" aria-hidden="true" /> Build Prompt</>}
          </button>
        ) : (
          <button type="submit" className="clubpm-btn-primary" disabled={suggesting || !goal.trim()}>
            {suggesting
              ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Thinking…</>
              : <><i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Suggest Plan</>}
          </button>
        )}
      </form>

      {manualMode && (
        <div className="cpm-actionplan-manual">
          <p className="cpm-actionplan-manual-help">
            Build the prompt, paste it into your own Claude or ChatGPT session, then paste the whole
            reply back below. Nothing is sent to an AI provider from here — this uses your own
            subscription, so it costs the club no quota.
          </p>

          {promptText && (
            <>
              <div className="cpm-actionplan-manual-head">
                <span className="cpm-actionplan-manual-label">Step 1 — copy this prompt</span>
                <button type="button" className="clubpm-btn-secondary" onClick={handleCopyPrompt}>
                  <i className="fas fa-copy" aria-hidden="true" /> Copy
                </button>
              </div>
              <textarea className="cpm-actionplan-prompt-box" readOnly value={promptText} rows={8} />

              <div className="cpm-actionplan-manual-head">
                <span className="cpm-actionplan-manual-label">Step 2 — paste the reply</span>
              </div>
              <textarea
                className="cpm-actionplan-paste-box"
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={6}
                placeholder="Paste the entire reply here, including the ```json block."
              />
              <button
                type="button"
                className="clubpm-btn-primary"
                disabled={importing || !pasteText.trim()}
                onClick={handleImport}
              >
                {importing
                  ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Reading…</>
                  : <><i className="fas fa-download" aria-hidden="true" /> Load Plan</>}
              </button>
            </>
          )}
        </div>
      )}

      {droppedNotes.length > 0 && (
        <div className="cpm-actionplan-dropped">
          <strong>
            {droppedNotes.length} action{droppedNotes.length === 1 ? " was" : "s were"} skipped:
          </strong>
          <ul>
            {droppedNotes.map((d, i) => (
              <li key={i}>{d.type} — {d.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(planItems) && planItems.length > 0 && (
        <>
          <div className="cpm-actionplan-list">
            {planItems.map((item, idx) => (
              <ActionCard
                key={item._id}
                item={item}
                taskTitleById={taskTitleById}
                tasks={tasks}
                members={members}
                milestones={milestones}
                blockers={blockers}
                onToggleAccept={() => updateItem(idx, { _accepted: !item._accepted })}
                onSetTarget={val => updateItem(idx, { targetTaskId: val || null })}
                onParamChange={(key, value) => updateParam(idx, key, value)}
                onToggleArrayParam={(key, value) => toggleArrayParam(idx, key, value)}
              />
            ))}
          </div>
          <div className="cpm-actionplan-execute-row">
            <button
              className="clubpm-btn-primary"
              disabled={executing || acceptedCount === 0}
              onClick={handleExecute}
            >
              {executing
                ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Executing…</>
                : <><i className="fas fa-play" aria-hidden="true" /> Execute Accepted ({acceptedCount})</>}
            </button>
          </div>
        </>
      )}

      {Array.isArray(planItems) && planItems.length === 0 && (
        <div className="cpm-actionplan-empty">No concrete actions were proposed for that goal — try being more specific.</div>
      )}
    </div>
  );
}

function ActionCard({ item, taskTitleById, tasks, members, milestones, blockers, onToggleAccept, onSetTarget, onParamChange, onToggleArrayParam }) {
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

function FieldEditor({ fieldKey, item, tasks, members, milestones, blockers, onParamChange, onToggleArrayParam }) {
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
          <div className="cpm-actionplan-chip-list">
            {members.map(m => (
              <button
                type="button"
                key={m.id}
                className={`cpm-actionplan-chip${(value ?? []).includes(m.id) ? " selected" : ""}`}
                onClick={() => onToggleArrayParam("assigneeIds", m.id)}
              >
                {m.displayName}
              </button>
            ))}
          </div>
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
          <select value={value ?? ""} onChange={e => onParamChange("ownerId", e.target.value || undefined)}>
            <option value="">— none —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
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
