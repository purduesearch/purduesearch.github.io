import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { prisma } from "../../db/prisma.js";
import { getProjectByChannel } from "../../services/projectService.js";
import { getTask, createSubtask, addDependency } from "../../services/taskService.js";
import { getTaskPermissions } from "../../middleware/taskAccess.js";
import { createTaskAsMember, updateTaskAsMember, TaskMutationError, type TaskPatch } from "../../services/taskMutationService.js";
import { createBlockerAsMember, attachBlockerAsMember } from "../../services/blockerMutationService.js";
import { runJson } from "../../services/ai/aiRouter.js";
import { enrichTaskPrompt } from "../../utils/aiPrompts.js";
import { loadingView, trunc } from "../views/common.js";
import { buildTaskModal, parseTaskModal, type TaskModalState, type TaskModalMetadata, type ViewStateValues, type Opt } from "../views/taskModal.js";

interface OpenTaskOptions {
  channelId?: string; memberId: string; isAdmin: boolean; taskId?: string; projectId?: string;
  prefill?: TaskModalState["initial"];
  openedView?: { id?: string; hash?: string };
}
interface Session {
  memberId: string; slackId: string; state: TaskModalState; baseline: TaskModalState["initial"];
  expires: number; descriptionRevision: number; projectRevision: number; subtaskIds: string[];
}
const sessions = new Map<string, Session>();
const allSections: TaskModalState["sections"] = ["subtasks", "deps", "links", "meta", "estimate"];
const projectBlocks = ["blockers_block", "new_blocker_block", "dependency_tasks_block", "parent_task_block", "milestone_block", "tags_block"];
const option = (id: string, label: string): Opt => ({ text: { type: "plain_text", text: trunc(label, 75) || "Untitled" }, value: id });
const loginText = () => `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`;
const date = (value: Date | null | undefined) => value?.toISOString().slice(0, 10);

async function projectOptions(projectId?: string) {
  if (!projectId) return { tags: [], milestones: [], blockers: [] };
  const [tags, milestones, blockers] = await Promise.all([
    prisma.tag.findMany({ where: { projectId }, orderBy: { name: "asc" }, take: 100 }),
    prisma.milestone.findMany({ where: { projectId }, orderBy: { title: "asc" }, take: 100 }),
    prisma.blocker.findMany({ where: { projectId, resolvedAt: null }, orderBy: { label: "asc" }, take: 100 }),
  ]);
  return { tags: tags.map(t => option(t.id, t.name)), milestones: milestones.map(m => option(m.id, m.title)), blockers: blockers.map(b => option(b.id, b.label)) };
}

function render(session: Session) {
  const view = buildTaskModal(session.state);
  // Change only the AI description block's identity so Slack applies its new initial value.
  if (session.descriptionRevision) for (const block of view.blocks) {
    if ("block_id" in block && block.block_id === "description_block") block.block_id = `tm_description_${session.descriptionRevision}`;
  }
  // Project-specific selectors must forget the previous project's selected values.
  if (session.projectRevision) for (const block of view.blocks) {
    if ("block_id" in block && block.block_id && projectBlocks.includes(block.block_id)) block.block_id = `tm_project_${session.projectRevision}_${block.block_id}`;
  }
  return view;
}
function valuesOf(view: any): ViewStateValues {
  const values = { ...(view.state?.values ?? {}) };
  for (const [id, value] of Object.entries(values)) if (id.startsWith("tm_description_")) values.description_block = value;
  for (const [id, value] of Object.entries(values)) {
    const original = /^tm_project_\d+_(.+)$/.exec(id)?.[1];
    if (original) values[original] = value;
  }
  return values;
}
function capture(session: Session, view: any) {
  const parsed = parseTaskModal(valuesOf(view), JSON.parse(view.private_metadata) as TaskModalMetadata).input;
  const initial = session.state.initial;
  Object.assign(initial, { title: parsed.title, description: parsed.description, projectId: parsed.projectId,
    assigneeSlackIds: parsed.assigneeSlackIds, dueDate: parsed.dueDate, priority: parsed.priority,
    ...(session.state.mode === "edit" ? { status: parsed.status } : {}) });
  for (const section of session.state.sections) {
    if (section === "subtasks") initial.subtasks = parsed.subtasks;
    if (section === "deps") Object.assign(initial, { blockerIds: parsed.blockerIds, dependencyTaskIds: parsed.dependencyTaskIds, parentTaskId: parsed.parentTaskId });
    if (section === "links") initial.links = parsed.links;
    if (section === "meta") Object.assign(initial, { tagIds: parsed.tagIds, milestoneId: parsed.milestoneId });
    if (section === "estimate") Object.assign(initial, { estimatedHours: parsed.estimatedHours, storyPoints: parsed.storyPoints, recurrence: parsed.recurrence, recurrenceEnd: parsed.recurrenceEnd });
  }
}
async function interactionMember(ctx: any) {
  return prisma.member.findUnique({ where: { slackId: ctx.body.user.id } });
}
function getSession(viewId: string, memberId: string) {
  const session = sessions.get(viewId);
  if (!session || session.expires < Date.now() || session.memberId !== memberId) throw new Error("This task form expired. Open it again.");
  session.expires = Date.now() + 60 * 60_000;
  return session;
}
async function failure(client: WebClient, slackId: string, error: unknown) {
  const channel = (await client.conversations.open({ users: slackId })).channel?.id;
  if (channel) await client.chat.postMessage({ channel, text: `Task could not be saved: ${error instanceof Error ? error.message : "Please try again."}` });
}
async function signIn(client: WebClient, slackId: string, channelId?: string) {
  const channel = channelId ?? (await client.conversations.open({ users: slackId })).channel?.id;
  if (channel) await client.chat.postEphemeral({ channel, user: slackId, text: loginText() });
}

export function openTaskModal(client: WebClient, triggerId: string, opts: OpenTaskOptions): Promise<void>;
export function openTaskModal(client: WebClient, triggerId: string, memberId: string, opts?: Omit<OpenTaskOptions, "memberId" | "isAdmin">): Promise<void>;
export async function openTaskModal(client: WebClient, triggerId: string, options: OpenTaskOptions | string, extra: Omit<OpenTaskOptions, "memberId" | "isAdmin"> = {}): Promise<void> {
  const opts = typeof options === "string" ? { ...extra, memberId: options, isAdmin: false } : options;
  const opened = opts.openedView ?? (await client.views.open({ trigger_id: triggerId, view: loadingView(opts.taskId ? "Edit task" : "Create task") })).view;
  if (!opened?.id) return;
  try {
    // Legacy entry points pass a Slack ID; all writes use the resolved member ID.
    const member = await prisma.member.findFirst({ where: { OR: [{ id: opts.memberId }, { slackId: opts.memberId }] } });
    if (!member?.slackId) {
      if (/^[UW]/.test(opts.memberId)) await signIn(client, opts.memberId, opts.channelId);
      throw new Error(loginText());
    }
    const linked = opts.channelId ? await getProjectByChannel(opts.channelId) : null;
    const projects = await prisma.project.findMany({ where: member.isAdmin ? {} : { members: { some: { memberId: member.id } } }, orderBy: { name: "asc" } });
    const task = opts.taskId ? await getTask(opts.taskId) : null;
    if (opts.taskId && (!task || !(await getTaskPermissions(member.id, opts.taskId)).canEdit)) throw new Error("You cannot edit this task.");
    const projectLocked = !!task || !member.isAdmin && !!linked;
    const initial: TaskModalState["initial"] = { ...opts.prefill, projectId: task?.projectId ?? (projectLocked ? linked?.id : opts.projectId ?? opts.prefill?.projectId ?? linked?.id ?? projects[0]?.id) };
    if (initial.projectId && !projects.some(p => p.id === initial.projectId)) throw new Error("You cannot access this project.");
    if (task) Object.assign(initial, {
      title: task.title, description: task.description ?? undefined, priority: task.priority, status: task.status,
      assigneeSlackIds: task.assignees.flatMap(a => a.slackId ? [a.slackId] : []), dueDate: date(task.dueDate),
      parentTaskId: task.parentTaskId ?? undefined, milestoneId: task.milestoneId ?? undefined,
      tagIds: task.tags.map(t => t.id), estimatedHours: task.estimatedHours ?? undefined, storyPoints: task.storyPoints ?? undefined,
      recurrence: task.isRecurring ? task.recurrencePattern ?? undefined : undefined, recurrenceEnd: date(task.recurrenceEndDate),
      blockerIds: task.blockers.map(b => b.blockerId), dependencyTaskIds: task.blockedBy.map(d => d.blockingTaskId),
      links: (task.attachments as { url: string; label?: string }[] | null ?? []).map(a => a.label ? `${a.label} | ${a.url}` : a.url).join("\n"),
      subtasks: task.subtasks.map(s => s.title),
    });
    const initialSections = task ? [...allSections] : allSections.filter(section =>
      section === "subtasks" ? !!initial.subtasks?.length : section === "deps" ? !!(initial.parentTaskId || initial.blockerIds?.length || initial.dependencyTaskIds?.length) :
      section === "links" ? !!initial.links : section === "meta" ? !!(initial.milestoneId || initial.tagIds?.length) :
      initial.estimatedHours !== undefined || initial.storyPoints !== undefined || !!initial.recurrence);
    const session: Session = { memberId: member.id, slackId: member.slackId, state: { mode: task ? "edit" : "create", taskId: task?.id,
      projectLocked, sections: initialSections, subtaskRows: Math.max(1, initial.subtasks?.length ?? 1), initial,
      options: { projects: projects.map(p => option(p.id, p.name)), ...await projectOptions(initial.projectId) } },
      baseline: structuredClone(initial), expires: Date.now() + 60 * 60_000, descriptionRevision: 0, projectRevision: 0, subtaskIds: task?.subtasks.map(s => s.id) ?? [] };
    for (const [id, old] of sessions) if (old.expires < Date.now()) sessions.delete(id);
    sessions.set(opened.id, session);
    await client.views.update({ view_id: opened.id, hash: opened.hash, view: render(session) });
  } catch (error) {
    await client.views.update({ view_id: opened.id, hash: opened.hash, view: { ...loadingView("Task"), blocks: [{ type: "section", text: { type: "plain_text", text: trunc(error instanceof Error ? error.message : "Unable to open task", 3000) } }] } });
  }
}

export function registerTaskModal(app: App): void {
  for (const actionId of ["tm_section", "tm_add_sub", "project", "tm_ai_draft"]) app.action(actionId, async (ctx: any) => {
    await ctx.ack();
    try {
      if (ctx.body.view?.callback_id !== "task_modal_submit") return;
      const actor = await interactionMember(ctx);
      if (!actor) { await signIn(ctx.client, ctx.body.user.id); return; }
      const session = getSession(ctx.body.view.id, actor.id);
      const previousProject = session.state.initial.projectId;
      capture(session, ctx.body.view);
      if (actionId === "tm_section") {
        const section = ctx.action.value;
        if (allSections.includes(section) && !session.state.sections.includes(section)) session.state.sections.push(section);
      } else if (actionId === "tm_add_sub") session.state.subtaskRows = Math.min(10, session.state.subtaskRows + 1);
      else if (actionId === "project") {
        if (session.state.projectLocked) throw new Error("This project's selection is locked.");
        if (!session.state.options.projects.some(p => p.value === session.state.initial.projectId)) throw new Error("You cannot access this project.");
        if (previousProject !== session.state.initial.projectId) {
          session.projectRevision++;
          Object.assign(session.state.initial, { tagIds: [], milestoneId: undefined, blockerIds: [], dependencyTaskIds: [], parentTaskId: undefined });
          Object.assign(session.state.options, await projectOptions(session.state.initial.projectId));
        }
      } else {
        const project = await prisma.project.findUnique({ where: { id: session.state.initial.projectId }, select: { type: true } });
        const result = await runJson<{ description: string; acceptanceCriteria: string[]; technicalNotes: string | null; definitionOfDone: string }>({ memberId: actor.id }, "medium", {
          prompt: enrichTaskPrompt(session.state.initial.title ?? "", session.state.initial.description ?? "", project?.type ?? "engineering"), json: true, maxOutputTokens: 2048 });
        if (!result || typeof result.description !== "string") throw new Error("AI could not draft this task. Please try again.");
        session.state.initial.description = [result.description, Array.isArray(result.acceptanceCriteria) && result.acceptanceCriteria.length ? `Acceptance criteria:\n${result.acceptanceCriteria.filter(c => typeof c === "string").map(c => `- ${c}`).join("\n")}` : "", result.technicalNotes ? `Technical notes:\n${result.technicalNotes}` : "", result.definitionOfDone ? `Definition of done:\n${result.definitionOfDone}` : ""].filter(Boolean).join("\n\n");
        session.descriptionRevision++;
      }
      await ctx.client.views.update({ view_id: ctx.body.view.id, hash: ctx.body.view.hash, view: render(session) });
    } catch (error) { await failure(ctx.client, ctx.body.user.id, error); }
  });
  for (const actionId of ["tm_dep_tasks", "tm_parent"]) app.options(actionId, async (ctx: any) => {
    try {
      const actor = await interactionMember(ctx);
      if (!actor) { await ctx.ack({ options: [] }); await signIn(ctx.client, ctx.body.user.id).catch(console.error); return; }
      const session = getSession(ctx.body.view.id, actor.id);
      const projectId = session.state.initial.projectId;
      if (!projectId) { await ctx.ack({ options: [] }); return; }
      const tasks = await prisma.task.findMany({ where: { projectId, archivedAt: null, status: { not: "DONE" },
        ...(session.state.taskId ? { id: { not: session.state.taskId } } : {}), title: { contains: ctx.options.value ?? "", mode: "insensitive" } }, select: { id: true, title: true }, orderBy: { title: "asc" }, take: 100 });
      await ctx.ack({ options: tasks.map(t => option(t.id, t.title)) });
    } catch { await ctx.ack({ options: [] }); }
  });
  app.view("task_modal_submit", async (ctx: any) => {
    let acked = false;
    try {
      const meta = JSON.parse(ctx.view.private_metadata) as TaskModalMetadata;
      const values = valuesOf(ctx.view);
      const { input, errors } = parseTaskModal(values, meta);
      const actor = await interactionMember(ctx);
      if (!actor) errors.title_block = loginText();
      const session = actor ? getSession(ctx.view.id, actor.id) : null;
      const members = input.assigneeSlackIds.length ? await prisma.member.findMany({ where: { slackId: { in: input.assigneeSlackIds } }, select: { id: true, slackId: true } }) : [];
      if (input.assigneeSlackIds.some(id => !members.some(m => m.slackId === id))) errors.assignee_block = "Every assignee must sign in to Constellation first.";
      for (const [block, action] of [["estimated_hours_block", "estimated_hours"], ["story_points_block", "story_points"]]) {
        const raw = values[block]?.[action]?.value?.trim();
        if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) errors[block] = "Enter a nonnegative number.";
      }
      if (session && !session.state.options.projects.some(p => p.value === input.projectId)) errors.project_block = "You cannot access this project.";
      const referencedTaskIds = [...new Set([...(input.dependencyTaskIds ?? []), ...(input.parentTaskId ? [input.parentTaskId] : [])])];
      if (referencedTaskIds.length) {
        const allowedTasks = await prisma.task.findMany({ where: { id: { in: referencedTaskIds }, projectId: input.projectId, archivedAt: null }, select: { id: true } });
        const valid = (id: string) => id !== session?.state.taskId && allowedTasks.some(t => t.id === id);
        if ((input.dependencyTaskIds ?? []).some(id => !valid(id))) errors.dependency_tasks_block = "Select dependency tasks from this project.";
        if (input.parentTaskId && !valid(input.parentTaskId)) errors.parent_task_block = "Select another task from this project as the parent.";
      }
      if (Object.keys(errors).length || !actor || !session) {
        const renderedErrors = Object.fromEntries(Object.entries(errors).map(([id, message]) => [session?.projectRevision && projectBlocks.includes(id) ? `tm_project_${session.projectRevision}_${id}` : id, message]));
        await ctx.ack({ response_action: "errors", errors: renderedErrors });
        acked = true;
        if (!actor) await signIn(ctx.client, ctx.body.user.id).catch(console.error);
        return;
      }
      // Slack must close the modal before mutation services and follow-up writes run.
      await ctx.ack({ response_action: "clear" });
      acked = true;
      const assigneeIds = members.map(m => m.id);
      let taskId: string;
      if (meta.mode === "edit") {
        taskId = session.state.taskId!;
        const baseline = session.baseline;
        const patch: TaskPatch = {};
        const changed = (field: keyof TaskPatch, value: unknown, before: unknown) => {
          if (JSON.stringify(value) !== JSON.stringify(before)) (patch as Record<string, unknown>)[field] = value;
        };
        changed("title", input.title, baseline.title);
        changed("description", input.description ?? "", (baseline.description ?? "").slice(0, 3000));
        changed("priority", input.priority, baseline.priority);
        changed("status", input.status, baseline.status);
        changed("dueDate", input.dueDate ?? null, baseline.dueDate ?? null);
        if (JSON.stringify([...input.assigneeSlackIds].sort()) !== JSON.stringify([...(baseline.assigneeSlackIds ?? [])].sort())) patch.assigneeIds = assigneeIds;
        if (meta.sections.includes("links")) changed("attachments", input.attachments, (baseline.links ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
          const split = line.indexOf("|");
          return split < 0 ? { url: line } : { label: line.slice(0, split).trim() || undefined, url: line.slice(split + 1).trim() };
        }));
        if (meta.sections.includes("deps")) {
          changed("parentTaskId", input.parentTaskId ?? null, baseline.parentTaskId ?? null);
          changed("blockingTaskIds", input.dependencyTaskIds ?? [], baseline.dependencyTaskIds ?? []);
          changed("blockerIds", input.blockerIds ?? [], baseline.blockerIds ?? []);
        }
        if (meta.sections.includes("meta")) {
          changed("milestoneId", input.milestoneId ?? null, baseline.milestoneId ?? null);
          changed("tagIds", input.tagIds ?? [], baseline.tagIds ?? []);
        }
        if (meta.sections.includes("estimate")) {
          changed("estimatedHours", input.estimatedHours ?? null, baseline.estimatedHours ?? null);
          changed("storyPoints", input.storyPoints ?? null, baseline.storyPoints ?? null);
          changed("isRecurring", !!input.recurrence, !!baseline.recurrence);
          changed("recurrencePattern", input.recurrence ?? null, baseline.recurrence ?? null);
          changed("recurrenceEndDate", input.recurrenceEnd ?? null, baseline.recurrenceEnd ?? null);
        }
        if (meta.sections.includes("subtasks")) {
          const subtasks = [];
          for (let n = 0; n < meta.subtaskRows; n++) {
            const title = values[`tm_sub_${n}`]?.tm_subtask?.value?.trim();
            if (title && title !== baseline.subtasks?.[n]) subtasks.push({ ...(session.subtaskIds[n] ? { id: session.subtaskIds[n] } : {}), title });
          }
          if (subtasks.length) patch.subtasks = subtasks;
        }
        await updateTaskAsMember(actor.id, taskId, patch, "SLACK");
      } else {
        const task = await createTaskAsMember(actor.id, { projectId: input.projectId, title: input.title, description: input.description,
          priority: input.priority, dueDate: input.dueDate ? new Date(input.dueDate) : undefined, assigneeIds,
          parentTaskId: input.parentTaskId, milestoneId: input.milestoneId, tagIds: input.tagIds,
          estimatedHours: input.estimatedHours, storyPoints: input.storyPoints, isRecurring: !!input.recurrence,
          recurrencePattern: input.recurrence, recurrenceEndDate: input.recurrenceEnd ? new Date(input.recurrenceEnd) : undefined,
          attachments: input.attachments }, "SLACK");
        taskId = task.id;
        if (!(await getTaskPermissions(actor.id, taskId)).canEdit) throw new TaskMutationError(403, "You cannot add task details.");
        for (const title of input.subtasks) await createSubtask(taskId, { title, createdById: actor.id });
        for (const blockerId of input.blockerIds ?? []) await attachBlockerAsMember(actor.id, taskId, { blockerId }, "SLACK");
        for (const blockedById of input.dependencyTaskIds ?? []) await addDependency(taskId, blockedById);
      }
      if (input.newBlocker) {
        const blocker = await createBlockerAsMember(actor.id, input.projectId, { label: input.newBlocker }, "SLACK");
        await attachBlockerAsMember(actor.id, taskId, { blockerId: blocker.id }, "SLACK");
      }
      sessions.delete(ctx.view.id);
    } catch (error) {
      if (!acked) await ctx.ack({ response_action: "errors", errors: { title_block: error instanceof Error ? error.message : "Unable to save task." } });
      else await failure(ctx.client, ctx.body.user.id, error);
    }
  });
}
