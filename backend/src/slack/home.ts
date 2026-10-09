import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { HomeView, ModalView } from "@slack/types";
import { prisma } from "../db/prisma.js";
import { loadMyWorkData, loadProjectsData, loadFilesData, loadCalendarData, loadHomeProjects } from "../services/slackHomeData.js";
import * as labVisits from "../services/labVisitService.js";
import { buildMyWork, buildProjects, homeSection, type HomeTab } from "./views/home.js";
import { buildFiles, buildCalendar } from "./views/homeFilesCalendar.js";
import { loadingView, trunc } from "./views/common.js";
import { openTaskModal } from "./handlers/taskModal.js";
import { openPlanModal } from "./handlers/plan.js";
import { getMilestonesForProject } from "../services/milestoneService.js";
import { buildProjectReport } from "../utils/blockKit.js";

const tabs = new Map<string, HomeTab>();
const fileProjects = new Map<string, string>();
const loginText = () => `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`;
const isTab = (value: string): value is HomeTab => ["mywork", "projects", "files", "calendar"].includes(value);
function messageView(text: string): ModalView {
  return { type: "modal", title: { type: "plain_text", text: "Constellation" }, close: { type: "plain_text", text: "Close" }, blocks: [homeSection(text)] };
}

export async function refreshAppHome(client: WebClient, slackId: string): Promise<void> {
  try {
    const member = await prisma.member.findUnique({ where: { slackId } });
    let view: HomeView;
    if (!member) view = { type: "home", blocks: [homeSection(loginText())] };
    else {
      switch (tabs.get(slackId) ?? "mywork") {
        case "projects": view = buildProjects(await loadProjectsData(member)); break;
        case "files": {
          const data = await loadFilesData(member, fileProjects.get(slackId));
          if (data.projectId) fileProjects.set(slackId, data.projectId);
          view = buildFiles(data); break;
        }
        case "calendar": view = buildCalendar(await loadCalendarData(member)); break;
        default: view = buildMyWork(await loadMyWorkData(member));
      }
    }
    await client.views.publish({ user_id: slackId, view });
  } catch (error) { console.error("refreshAppHome error:", error); }
}

export function registerHome(app: App): void {
  app.event("app_home_opened", async ({ event, client }) => {
    if (event.tab === "home") await refreshAppHome(client, event.user);
  });
  app.action("home_tab", async ({ ack, body, action, client }) => {
    await ack();
    if (action.type !== "button" || !action.value || !isTab(action.value)) return;
    tabs.set(body.user.id, action.value);
    await refreshAppHome(client, body.user.id);
  });
  app.action("home_files_project", async ({ ack, body, action, client }) => {
    await ack();
    if (action.type !== "static_select" || !action.selected_option) return;
    fileProjects.set(body.user.id, action.selected_option.value);
    tabs.set(body.user.id, "files");
    await refreshAppHome(client, body.user.id);
  });
  for (const actionId of ["home_create_task", "home_plan", "home_report", "home_lab"]) {
    app.action(actionId, async ({ ack, body, action, client }) => {
      await ack();
      if (!("trigger_id" in body) || !body.trigger_id || action.type !== "button") return;
      // Reserve the trigger before identity or project queries.
      const opened = await client.views.open({ trigger_id: body.trigger_id, view: loadingView("Constellation") });
      if (!opened.view?.id) return;
      const update = (view: ModalView) => client.views.update({ view_id: opened.view!.id!, hash: opened.view!.hash, view });
      try {
        const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
        if (!member) { await update(messageView(loginText())); return; }
        const value = action.value;
        const projectId = value && !["new", "plan", "in", "out"].includes(value) ? value : undefined;
        if (actionId === "home_create_task") {
          await openTaskModal(client, body.trigger_id, { memberId: member.id, isAdmin: member.isAdmin, projectId, openedView: opened.view });
        } else if (actionId === "home_plan") {
          await openPlanModal(client, body.trigger_id, { memberId: member.id, projectId, openedView: opened.view });
        } else if (actionId === "home_report") {
          const accessible = await loadHomeProjects(member);
          if (!accessible.some(p => p.id === projectId)) throw new Error("You cannot access that project.");
          const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { tasks: { where: { archivedAt: null }, include: { assignees: true } }, milestones: true } });
          const top = project.tasks.filter(t => !t.parentTaskId);
          const counts = top.reduce<Record<string, number>>((c, t) => { c[t.status] = (c[t.status] ?? 0) + 1; return c; }, {});
          const overdue = top.filter(t => t.status !== "DONE" && t.dueDate && t.dueDate < new Date()).length;
          const blocks = buildProjectReport(project, project.tasks, await getMilestonesForProject(project.id), counts, overdue);
          await update({ ...messageView("Project report"), title: { type: "plain_text", text: "Project report" }, blocks });
        } else if (value === "out") {
          await labVisits.checkOut(member.id, { source: "SLACK" });
          await update(messageView("You are checked out."));
          await refreshAppHome(client, body.user.id);
        } else {
          const scheduled = await labVisits.scheduledSpacesToday(member.id);
          const spaces = scheduled.length === 1 ? scheduled : await labVisits.findSpaces("");
          if (spaces.length === 1) {
            await labVisits.checkIn(member.id, spaces[0].id, "SLACK");
            await update(messageView(`Checked in to ${spaces[0].name}.`));
            await refreshAppHome(client, body.user.id);
          } else if (!spaces.length) await update(messageView("There are no lab spaces yet."));
          else await update({ ...messageView("Choose a lab space."), callback_id: "home_lab_checkin", submit: { type: "plain_text", text: "Check in" }, blocks: [{ type: "input", block_id: "space", label: { type: "plain_text", text: "Lab space" }, element: { type: "static_select", action_id: "workspace", options: spaces.slice(0, 100).map(w => ({ text: { type: "plain_text", text: trunc(w.name, 75) }, value: w.id })) } }] });
        }
      } catch (error) {
        console.error(`${actionId} error:`, error);
        await update(messageView(error instanceof Error ? error.message : "Could not complete that action. Try again."));
      }
    });
  }
  app.view("home_lab_checkin", async ({ ack, body, view, client }) => {
    const workspaceId = view.state.values.space?.workspace?.selected_option?.value;
    if (!workspaceId) { await ack({ response_action: "errors", errors: { space: "Choose a lab space." } }); return; }
    await ack({ response_action: "update", view: loadingView("Lab check-in") });
    try {
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) throw new Error(loginText());
      const result = await labVisits.checkIn(member.id, workspaceId, "SLACK");
      // The submission acknowledgement replaced the view, so its old hash is stale.
      await client.views.update({ view_id: view.id, view: messageView(`Checked in to ${result.workspace.name}.`) });
      await refreshAppHome(client, body.user.id);
    } catch (error) {
      await client.views.update({ view_id: view.id, view: messageView(error instanceof Error ? error.message : "Could not check in.") });
    }
  });
}
