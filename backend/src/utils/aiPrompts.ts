// ── Task extraction from documents ────────────────────────────

export function driveToTasksPrompt(projectName: string, projectDescription: string, existingTaskTitles: string[], today: string, suggestedTaskCount?: number) {
  const countHint = suggestedTaskCount
    ? `Aim to extract approximately ${suggestedTaskCount} tasks (adjust slightly if the document clearly warrants more or fewer).`
    : "Extract all clearly actionable tasks.";
  return `You are a project management assistant for a student engineering/research team.

Project: "${projectName}"
Description: "${projectDescription}"
Today: ${today}
Existing open tasks (do NOT duplicate these): ${existingTaskTitles.length > 0 ? existingTaskTitles.map(t => `"${t}"`).join(", ") : "none"}

Read the document below and extract actionable tasks. ${countHint} For each task, determine:
- title: short imperative title (≤80 chars)
- description: 1-3 sentence context from the doc
- priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
- dueDate: ISO date string if clearly mentioned, otherwise null
- suggestedAssigneeName: person's name if mentioned in doc, otherwise null
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

export function riskAnalysisPrompt(project: { name: string; targetDate?: string }, tasks: Array<{ title: string; status: string; dueDate?: string | null; priority: string; assignees: string[] }>, today: string) {
  return `Analyze this project for risks. Be specific and actionable.

Project: "${project.name}" (target: ${project.targetDate ?? "no deadline"})
Today: ${today}

Tasks (${tasks.length} total):
${tasks.map(t => `- [${t.status}] "${t.title}" | due: ${t.dueDate ?? "none"} | priority: ${t.priority} | assignees: ${t.assignees.join(", ") || "unassigned"}`).join("\n")}

Identify:
1. Schedule risks (overdue, no assignee on high-priority, etc.)
2. Dependency risks (likely blocking chains)
3. Coverage gaps (areas with no tasks but probably need work)
4. Team load issues

Return ONLY: {
  "overallRisk": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "riskScore": 0-100,
  "risks": [{ "category": string, "description": string, "affectedTasks": [string], "severity": "LOW"|"MEDIUM"|"HIGH" }],
  "topRecommendation": "single most important action the PM should take right now"
}`;
}

// ── Sprint planning ───────────────────────────────────────────

export function sprintPlanPrompt(
  tasks: Array<{ id: string; title: string; status: string; priority: string; storyPoints?: number | null; assignees: string[]; dueDate?: string | null }>,
  teamCapacityPoints: number,
  sprintLengthDays: number,
  today: string
) {
  return `Plan the next ${sprintLengthDays}-day sprint for this team. Team capacity: ${teamCapacityPoints} story points.
Today: ${today}

Backlog (non-DONE tasks):
${tasks.filter(t => t.status !== "DONE").map(t => `- [${t.id}] "${t.title}" | ${t.priority} | ${t.storyPoints ?? "?"}pts | ${t.assignees.join(", ") || "unassigned"} | due ${t.dueDate ?? "no date"}`).join("\n")}

Select tasks for the sprint. Prefer: high priority, upcoming deadlines, unblocking work, balanced assignee load.
Return ONLY: {
  "sprintTasks": [{ "taskId": string, "reason": "short reason" }],
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

export function capacityAnalysisPrompt(
  members: Array<{ name: string; taskCount: number; highPriorityCount: number; totalEstimatedHours: number | null }>,
  sprintDays: number
) {
  return `Analyze team workload and suggest redistribution if needed. Sprint length: ${sprintDays} days.

Members:
${members.map(m => `- ${m.name}: ${m.taskCount} tasks (${m.highPriorityCount} high/critical), ~${m.totalEstimatedHours ?? "?"}h estimated`).join("\n")}

Assume each member has ~${sprintDays * 3}h available (part-time students, 3h/day).
Return ONLY: {
  "overloaded": [{ "member": string, "recommendation": string }],
  "underloaded": [{ "member": string, "suggestion": string }],
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

// ── Project Q&A ───────────────────────────────────────────────

export function projectQaPrompt(question: string, project: { name: string; description?: string | null; type: string; targetDate?: string | null }, tasks: Array<{ title: string; status: string; priority: string; assignees: string[]; dueDate?: string | null }>, members: string[], milestones: Array<{ title: string; status: string; targetDate?: string | null }>, recentUpdates: string[]) {
  return `You are a project assistant for "${project.name}" (${project.type}).
Description: ${project.description ?? "none"}
Target: ${project.targetDate ?? "TBD"}

Team: ${members.join(", ") || "unknown"}

Tasks (${tasks.length}):
${tasks.map(t => `- [${t.status}] "${t.title}" | ${t.priority} | due: ${t.dueDate ?? "none"} | ${t.assignees.join(", ") || "unassigned"}`).join("\n")}

Milestones: ${milestones.map(m => `${m.title} (${m.status}, due ${m.targetDate ?? "no date"})`).join(", ") || "none"}

Recent updates: ${recentUpdates.join(" | ") || "none"}

Question: "${question}"

Answer concisely and factually based only on the data above. If the answer isn't in the data, say so.`;
}
