import type { ProjectContext } from "../services/projectContextService.js";
import { todayContext } from "../services/ai/aiRouter.js";
import { renderProjectContext, computeProjectSignals, renderSignals } from "./projectContextRender.js";

// ── Task extraction from documents ────────────────────────────

export function driveToTasksPrompt(context: ProjectContext, today: string, suggestedTaskCount?: number) {
  const countHint = suggestedTaskCount
    ? `Aim to extract approximately ${suggestedTaskCount} tasks (adjust slightly if the document clearly warrants more or fewer).`
    : "Extract all clearly actionable tasks.";
  const snapshot = renderProjectContext(context, today, { ids: true, descChars: 120, tasks: "open" });
  return `You are a project management assistant for a student engineering/research team. You work on ONE project; the snapshot below is everything you may know about it.

${snapshot}

Read the document at the end and extract actionable tasks for this project. ${countHint}
Rules:
- Do NOT duplicate any open task above, and do not re-extract work the document describes as already done. If the document only adds detail to an existing task, skip it.
- Fit the work to the project: use the team's real member ids, milestone ids and the sizing the team already uses (look at the points and hours on existing tasks) rather than inventing a scale.
- Only suggest an assignee when the document names or clearly implies a person who is on the team list. Never invent members.
- Only suggest a milestone when the task clearly belongs to one of the milestones listed.

For each task, determine:
- title: short imperative title (≤80 chars)
- description: 1-3 sentence context from the doc
- priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
- dueDate: ISO date string if clearly mentioned (resolve relative dates against today), otherwise null
- suggestedAssigneeName: that person's name exactly as listed in the team, otherwise null
- suggestedAssigneeId: that person's id from the team list, otherwise null
- suggestedMilestoneId: a milestone id from the list, otherwise null
- storyPoints: integer 1, 2, 3, 5 or 8 if the document gives enough to size it, otherwise null
- estimatedHours: number if the document states or implies one, otherwise null
- dependsOn: titles of open tasks above, or other tasks in this extraction, that must finish first (usually empty)
- sourceContext: exact quote (≤100 chars) from the doc that led to this task

Return ONLY a JSON object: { "tasks": [...] }. If no tasks found, return { "tasks": [] }.`;
}

// ── Meeting notes → action items ──────────────────────────────

export function meetingNotesToTasksPrompt(projectName: string, attendees: string[], today: string, suggestedTaskCount?: number) {
  const countHint = suggestedTaskCount
    ? `Aim to extract approximately ${suggestedTaskCount} action items (adjust slightly if the notes clearly warrant more or fewer).`
    : "Extract all clearly actionable items.";
  return `Extract action items and decisions from these meeting notes for project "${projectName}".
Attendees: ${attendees.join(", ") || "unknown"}. Today: ${today}. ${countHint}

For each action item, return:
- title: imperative task title (≤80 chars)
- description: context from the meeting
- priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
- dueDate: ISO date if mentioned, else null
- assigneeName: name of person responsible, or null
- decisionContext: what was decided that led to this task

Return ONLY: { "tasks": [...], "summary": "1-2 sentence meeting summary" }`;
}

// ── Screenshot / image → bug task ────────────────────────────

export function imageToTaskPrompt(projectName: string, userNote: string) {
  return `You are analyzing a screenshot or image shared in a project management context.
Project: "${projectName}". User note: "${userNote || "none provided"}".

Describe what you see and create a task if there is an obvious bug, error, or work item visible.
Return ONLY: {
  "hasTask": boolean,
  "title": string,
  "description": string,
  "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "screenshotDescription": "2-sentence description of what you see"
}`;
}

// ── Duplicate / similarity detection ─────────────────────────

export function duplicateDetectionPrompt(newTitle: string, newDescription: string, existingTasks: Array<{ id: string; title: string; description?: string | null }>) {
  return `You are checking if a new task duplicates or substantially overlaps an existing task.

New task:
- Title: "${newTitle}"
- Description: "${newDescription || "none"}"

Existing open tasks:
${existingTasks.map(t => `- [${t.id}] "${t.title}" ${t.description ? `— ${t.description.slice(0, 100)}` : ""}`).join("\n")}

Return ONLY: { "isDuplicate": boolean, "duplicateTaskId": "id or null", "similarityReason": "short explanation or null", "confidence": 0.0-1.0 }`;
}

// ── Task description enrichment ───────────────────────────────

export function enrichTaskPrompt(title: string, description: string, projectType: string) {
  return `Enhance this ${projectType} project task for a student team. Keep it practical and concise.

Title: "${title}"
Existing description: "${description || "none"}"

Add:
1. A clearer 2-3 sentence description (if weak/missing)
2. 3-5 concrete acceptance criteria as bullet points
3. Any obvious technical considerations or gotchas
4. Definition of Done (1 sentence)

Return ONLY: {
  "description": "enhanced description",
  "acceptanceCriteria": ["criterion 1", ...],
  "technicalNotes": "optional 1-2 sentences, or null",
  "definitionOfDone": "single sentence"
}`;
}

// ── Smart deadline suggestion ─────────────────────────────────

export function deadlineSuggestionPrompt(
  title: string, description: string, storyPoints: number | null,
  teamVelocityPointsPerWeek: number, projectDeadline: string | null, today: string
) {
  return `Suggest a realistic due date for this engineering/research task.

Task: "${title}" — ${description || "no description"}
Story points: ${storyPoints ?? "unset"}
Team velocity: ~${teamVelocityPointsPerWeek} points/week
Project deadline: ${projectDeadline ?? "none set"}
Today: ${today}

Consider: complexity, typical student team schedules (part-time), testing/review time.
Return ONLY: { "suggestedDueDate": "ISO date", "reasoning": "1-2 sentences" }`;
}

// ── Risk analysis ─────────────────────────────────────────────

export function riskAnalysisPrompt(context: ProjectContext, today: string) {
  const snapshot = renderProjectContext(context, today, { ids: true, descChars: 160, activity: true });
  const signals = renderSignals(computeProjectSignals(context, today));
  return `Analyze this ONE project for risks. Be specific and actionable. You may use only the data below; do not assume facts about other projects or people outside the team list.

${snapshot}

${signals}

Identify, using the real tasks, people, milestones, dates and velocity above:
1. Schedule risks (overdue work, milestones or the target date that current velocity cannot reach, work due soon with no owner)
2. Dependency risks (real waiting-on chains and category blockers, and which milestones they hold up)
3. Coverage gaps (areas the description and milestones imply but no task covers)
4. Team load and bus-factor risks (overloaded members, work only one person touches, people with no recent activity)
5. Momentum risks (stale in-progress work, a velocity that has stalled in the recent activity)
Skip any category that has no real evidence. Do not pad the list; a healthy project can have few risks.

Every risk must cite task ids from the list. Return ONLY: {
  "overallRisk": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "riskScore": 0-100,
  "risks": [{ "category": string, "description": string, "affectedTaskIds": [string], "owner": "member name from the team list who should act, or null", "mitigation": "one concrete next step", "severity": "LOW"|"MEDIUM"|"HIGH" }],
  "topRecommendation": "single most important action the PM should take right now"
}`;
}

// ── Sprint planning ───────────────────────────────────────────

export interface SprintPlanInputs {
  capacityPoints: number;
  /** Where the capacity figure came from, shown to the model so it can say how firm it is. */
  capacitySource: "requested" | "velocity" | "default";
  sprintDays: number;
}

export function sprintPlanPrompt(context: ProjectContext, inputs: SprintPlanInputs, today: string) {
  const snapshot = renderProjectContext(context, today, { ids: true, descChars: 160, tasks: "open", activity: true });
  const signals = renderSignals(computeProjectSignals(context, today));
  const hoursPerPerson = inputs.sprintDays * 3;
  const sourceNote = {
    requested: "set by the person running this plan",
    velocity: `derived from this project's last ${context.velocity.windowDays} days of completed points`,
    default: "a default, because the project has no completed-points history yet; say so in risksInPlan",
  }[inputs.capacitySource];
  return `Plan the next ${inputs.sprintDays}-day sprint for this ONE project. Capacity: ${inputs.capacityPoints} story points (${sourceNote}). Assume each member has about ${hoursPerPerson}h available in the sprint (part-time students) and never fill someone beyond that.

${snapshot}

${signals}

Select tasks for the sprint from the open tasks above, by id. Use only these ids. Prefer, in order: work that unblocks other tasks or a milestone due soon, overdue and high-priority work, upcoming deadlines, then anything that balances load across the members listed. Do not select a task that is waiting on an open dependency or category blocker unless the plan also includes the task it waits on. Subtasks travel with their parent, so do not list a parent and its subtasks separately.
If tasks have no points, size them from similar estimated tasks and say so in risksInPlan rather than treating them as free.
If an unassigned task is selected, propose an owner from the team list with spare capacity.

Return ONLY: {
  "sprintTasks": [{ "taskId": string, "reason": "short reason", "suggestedAssigneeId": "member id, only for unassigned tasks, else null" }],
  "totalPoints": number,
  "focusTheme": "1 sentence describing sprint theme",
  "risksInPlan": ["risk 1", "risk 2"] or []
}`;
}

// ── Project brief / README generator ─────────────────────────

export function projectBriefPrompt(project: { name: string; description?: string | null; type: string; targetDate?: string | null }, tasks: Array<{ title: string; status: string; priority: string }>, milestones: Array<{ name: string; targetDate?: string | null; status: string }>, recentUpdates: string[]) {
  return `Generate a concise project brief (like a README) for stakeholders and new members.

Project: "${project.name}" (${project.type})
Description: ${project.description ?? "none"}
Target: ${project.targetDate ?? "TBD"}

Tasks: ${tasks.length} total, ${tasks.filter(t => t.status === "DONE").length} done, ${tasks.filter(t => t.status === "IN_PROGRESS").length} in progress
Top priorities: ${tasks.filter(t => t.priority === "CRITICAL" || t.priority === "HIGH").map(t => t.title).slice(0, 5).join(", ") || "none"}

Milestones: ${milestones.map(m => `${m.name} (${m.status})`).join(", ") || "none"}

Recent updates: ${recentUpdates.slice(0, 3).join(" | ") || "none"}

Write a concise, professional brief in Markdown with these sections: Overview, Current Status, Key Goals, Team Focus This Week, How to Contribute.
Return ONLY: { "markdown": "full markdown content", "tldr": "2-sentence plain text summary" }`;
}

// ── Standup synthesis ─────────────────────────────────────────

export function standupSynthesisPrompt(standups: Array<{ memberName: string; yesterday: string; today: string; blockers: string }>, projectName: string) {
  return `Synthesize these team standup responses into a concise project digest for "${projectName}".

Standups:
${standups.map(s => `**${s.memberName}**: Yesterday: ${s.yesterday} | Today: ${s.today} | Blockers: ${s.blockers || "none"}`).join("\n")}

Identify: key progress, active blockers, any team member who may need help (cross-reference blockers and today's plans).
Return ONLY: {
  "digest": "2-4 sentence narrative summary for a project channel",
  "blockers": [{ "member": string, "issue": string }],
  "momentum": "STALLED" | "SLOW" | "STEADY" | "STRONG",
  "callout": "highlight one positive or one concern worth flagging, 1 sentence"
}`;
}

// ── Sentiment / wellbeing analysis ────────────────────────────

export function standupSentimentPrompt(standups: Array<{ memberName: string; text: string }>) {
  return `Analyze the sentiment of these standup responses. Look for signs of stress, frustration, low confidence, or burnout.
Do NOT flag normal negative statements (e.g., "I'm blocked on X" is a normal update, not a wellbeing concern).
Only flag genuine signs of overwhelm or disengagement.

Responses:
${standups.map(s => `${s.memberName}: "${s.text}"`).join("\n")}

Return ONLY: {
  "concerns": [{ "member": string, "signal": string, "recommendation": "private message suggestion to send them" }],
  "teamMorale": "LOW" | "NEUTRAL" | "HIGH"
}`;
}

// ── Dependency inference ──────────────────────────────────────

export function inferDependenciesPrompt(tasks: Array<{ id: string; title: string; description?: string | null }>) {
  return `Analyze these tasks and infer likely dependencies based on their titles and descriptions.

Tasks:
${tasks.map(t => `[${t.id}] "${t.title}" — ${t.description?.slice(0, 120) ?? "no description"}`).join("\n")}

Only suggest dependencies that are clearly implied by the content (e.g., "deploy API" clearly depends on "build API").
Return ONLY: {
  "dependencies": [{ "blockedTaskId": string, "blockingTaskId": string, "confidence": 0.0-1.0, "reason": "short reason" }]
}
Omit low-confidence (<0.7) suggestions.`;
}

// ── Capacity / workload analysis ──────────────────────────────

export function capacityAnalysisPrompt(context: ProjectContext, sprintDays: number, today: string) {
  const snapshot = renderProjectContext(context, today, { ids: true, descChars: 100, tasks: "open" });
  return `Analyze the workload of this ONE project's team and suggest redistribution if needed. Sprint length: ${sprintDays} days. Only the people in the team list belong to this project; judge them only by the work and time shown here, not by anything they may do elsewhere.

${snapshot}

Assume each member has about ${sprintDays * 3}h available per sprint (part-time students, 3h/day) unless their logged hours in the last 14 days clearly show a different pace; if you adjust, say so.
Read the numbers carefully: "unestimated" tasks make the point and hour totals lower bounds. Include members with no open work as underloaded. Count unassigned open work as a team-level gap, not as someone's load.
Suggest moves only of real open tasks (by id) from an overloaded member to a member with spare capacity, preferring tasks that are not in progress and not already close to done. Never move a task to someone who is not on the team list.

Return ONLY: {
  "overloaded": [{ "member": string, "recommendation": string }],
  "underloaded": [{ "member": string, "suggestion": string }],
  "reassignments": [{ "taskId": string, "toMemberId": string, "reason": "short reason" }],
  "unassignedWork": "1 sentence on the unowned open work and who could take it, or null",
  "balanceScore": 0-100,
  "summary": "1-2 sentence overall assessment"
}`;
}
// ── NL → task (web UI) ────────────────────────────────────────

export function nlToTaskPrompt(input: string, projectName: string, members: string[], today: string) {
  return `Convert this natural language input into a structured task for project "${projectName}".
Team members: ${members.join(", ") || "unknown"}. Today: ${today}.

Input: "${input}"

Return ONLY: {
  "title": string,
  "description": string or null,
  "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "dueDate": "ISO date or null",
  "assigneeName": "member name or null"
}`;
}

// ── Stakeholder email generator ───────────────────────────────

export function stakeholderEmailPrompt(project: { name: string; targetDate?: string | null }, completedThisWeek: string[], inProgress: string[], blockers: string[], overallHealthScore: number) {
  return `Write a professional but friendly weekly status email for stakeholders of project "${project.name}".
Target date: ${project.targetDate ?? "TBD"}. Health score: ${overallHealthScore}/100.

Completed this week: ${completedThisWeek.join(", ") || "none"}
In progress: ${inProgress.join(", ") || "none"}
Blockers: ${blockers.join(", ") || "none"}

Return ONLY: {
  "subject": "email subject line",
  "body": "full email body in plain text, 150-250 words, professional but not stiff"
}`;
}

// ── Project Q&A (rich context) ────────────────────────────────

export function projectContextPrompt(question: string, today: string, context: ProjectContext): string {
  const { project, tasks, milestones, members, recentActivity, activeBlockers } = context;

  const taskLines = tasks.map(t => {
    const flags = [
      t.blockedByOpenDependencies ? "waiting-on-dependency" : null,
      t.activeCategoryBlockers.length ? `blocked-by:${t.activeCategoryBlockers.join("/")}` : null,
      t.subtaskCounts.total ? `subtasks:${t.subtaskCounts.done}/${t.subtaskCounts.total}` : null,
    ].filter(Boolean).join(" ");
    const desc = t.description ? `\n  ${t.description.slice(0, 300)}` : "";
    return `- [${t.status}] "${t.title}" | ${t.priority} | due: ${t.dueDate ?? "none"} | ${t.assignees.join(", ") || "unassigned"}${t.milestoneTitle ? ` | milestone: ${t.milestoneTitle}` : ""}${flags ? ` | ${flags}` : ""}${desc}`;
  }).join("\n") || "none";

  const milestoneLines = milestones.map(m => `${m.title} (${m.status}, due ${m.targetDate ?? "no date"})`).join(", ") || "none";

  const memberLines = members.map(m => `${m.displayName} (${m.projectRole}, ${m.openTaskCount} open tasks)`).join(", ") || "unknown";

  const blockerLines = activeBlockers.map(b => `${b.label}${b.assigneeName ? ` (owner: ${b.assigneeName})` : ""} — affects: ${b.attachedTaskTitles.join(", ") || "no tasks"}`).join("\n") || "none";

  const activityLines = recentActivity.map(a => `${a.createdAt}: ${a.eventType}${a.actorName ? ` by ${a.actorName}` : ""}${a.taskTitle ? ` on "${a.taskTitle}"` : ""}`).join("\n") || "none";

  return `${today}

You are a project assistant for "${project.name}" (${project.type}).
Description: ${project.description ?? "none"}
Target: ${project.targetDate ?? "TBD"}

Team (${members.length}): ${memberLines}

Tasks (${tasks.length}${context.truncated ? ", truncated to most relevant" : ""}):
${taskLines}

Milestones: ${milestoneLines}

Active blockers:
${blockerLines}

Recent activity:
${activityLines}

Question: "${question}"

Answer concisely and factually based only on the data above. If the answer isn't in the data, say so.`;
}

// ── Agentic action-plan generation ────────────────────────────
// Produces an editable, executable plan of concrete site actions toward a
// stated goal. Every id referenced in the output MUST come from the ids
// listed below — the caller drops/clamps anything else.

export function suggestActionsPrompt(goal: string, context: ProjectContext): string {
  const { project } = context;
  const today = new Date().toISOString().split("T")[0];
  const snapshot = renderProjectContext(context, today, { ids: true, descChars: 200, activity: true });
  const signals = renderSignals(computeProjectSignals(context, today));

  return `${todayContext()}

You are an agentic project-management assistant for "${project.name}" (${project.type}). Given a goal, propose an ORDERED list of concrete actions to move the project toward it. A human will review, edit, and selectively execute your plan — so be specific and use only real ids from the lists below.
You know only this one project. Plan around its real people, workload, estimates, velocity, dependencies and deadlines: do not assign work to someone who is already overloaded when a teammate has room, do not schedule more than the team's recent velocity suggests it can finish, and do not duplicate work that an existing task already covers (update that task instead).

Goal: "${goal}"

${snapshot}

${signals}

Each action is an object: { "type": string, "targetTaskId": string or null, "params": object, "rationale": "1 sentence: why this action helps the goal" }

Valid "type" values and their "params" shape:
- CREATE_TASK: targetTaskId null. params: { title (string, required), description? (string), priority? ("LOW"|"MEDIUM"|"HIGH"|"CRITICAL"), dueDate? (ISO date string), assigneeIds? (string[], from member ids above), milestoneId? (string, from milestone ids above), subtasks? (string[] — titles of child subtasks to create under this new task) }
- UPDATE_TASK: targetTaskId required (existing task id). params: { title?, description?, priority?, dueDate?, assigneeIds? } — any subset of these fields
- DELETE_TASK: targetTaskId required. params: {}
- SET_STATUS: targetTaskId required. params: { status: "TODO"|"IN_PROGRESS"|"BLOCKED"|"DONE" }
- SET_PRIORITY: targetTaskId required. params: { priority: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }
- SET_DUE: targetTaskId required. params: { dueDate: ISO date string or null }
- ASSIGN: targetTaskId required. params: { assigneeIds: string[] } — replaces the task's full assignee list
- CREATE_SUBTASK: targetTaskId required (the parent task). params: { title (string, required), assigneeIds? (string[]) }
- ADD_DEPENDENCY: targetTaskId required (the task that will be blocked). params: { blockingTaskId (string, required — the task it depends on), reason? (string) }
- ATTACH_BLOCKER: targetTaskId required. params: { blockerId (string, required, from blocker ids above), reason? (string) }
- RESOLVE_BLOCKER: targetTaskId null. params: { blockerId (string, required, from blocker ids above) }
- ADD_COMMENT: targetTaskId required. params: { content (string, required) }
- CREATE_MILESTONE: targetTaskId null. params: { title (string, required), dueDate? (ISO date string), description? (string), ownerId? (string, from member ids above) }
- LINK_MILESTONE: targetTaskId optional (a single task to link). params: { milestoneId (string, required, from milestone ids above), taskIds? (string[], additional tasks to link) } — at least one of targetTaskId/params.taskIds must be set

When a new task naturally breaks down into sub-items, steps, or a checklist, put those child items in the CREATE_TASK "subtasks" array (a list of short titles) — do NOT enumerate them inside "description". Use CREATE_SUBTASK only to add a subtask to a task that ALREADY exists (has an id in the list above); it cannot target a task you are creating in this same plan.

Only reference ids that appear in the lists above. Do not invent ids. Keep the plan focused — prefer fewer, high-value actions over an exhaustive list.

Return ONLY: { "actions": [ ... ] }. If no actions are warranted, return { "actions": [] }.`;
}
