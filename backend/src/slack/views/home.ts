import type { ActionsBlock, HomeView, KnownBlock, SectionBlock } from "@slack/types";
import { assertBlockBudget, escapeMrkdwn, relativeDue, statusPill, trunc } from "./common.js";

export type HomeTab = "mywork" | "projects" | "files" | "calendar";
export interface HomeLink { id: string; title: string; url: string }
export interface HomeTask extends HomeLink { status: string; dueDate?: Date | string | null; projectName?: string }
export interface HomePoll extends HomeLink { answered?: boolean }
export interface HomeProject { id: string; name: string; statusCounts?: Record<string, number>; nextMilestone?: { title: string; dueDate?: Date | string | null } | null }
export interface MyWorkData {
  frontendUrl: string; now: Date; displayName?: string; tasks: HomeTask[];
  reviews: HomeLink[]; polls: HomePoll[]; checkedIn?: boolean;
}
export interface ProjectsData { frontendUrl: string; projects: HomeProject[] }

export function homeTabs(active: HomeTab): ActionsBlock {
  const tabs: [HomeTab, string][] = [["mywork", "My work"], ["projects", "Projects"], ["files", "Files"], ["calendar", "Calendar"]];
  return { type: "actions", block_id: "home_tabs", elements: tabs.map(([value, text]) => ({
    type: "button" as const, text: { type: "plain_text" as const, text }, action_id: `home_tab_${value}`, value,
    ...(active === value ? { style: "primary" as const } : {}),
  })) };
}

export function homeSection(text: string): SectionBlock {
  return { type: "section", text: { type: "mrkdwn", text: trunc(text, 3000) } };
}
export function homeLink(item: Pick<HomeLink, "title" | "url">): string {
  // Escape delimiters so a title or URL cannot create a second Slack link.
  return `<${item.url.replace(/[<>|\s]/g, c => encodeURIComponent(c))}|${escapeMrkdwn(trunc(item.title, 180)).replace(/\|/g, "&#124;")}>`;
}
export function homeButton(text: string, action_id: string, value: string) {
  return { type: "button" as const, text: { type: "plain_text" as const, text: trunc(text, 75) }, action_id, value };
}
export function homeView(active: HomeTab, summary: string, body: KnownBlock[]): HomeView {
  const blocks: KnownBlock[] = [homeTabs(active), { type: "context", elements: [{ type: "mrkdwn", text: trunc(escapeMrkdwn(summary), 3000) }] }, ...body];
  assertBlockBudget(blocks, 100);
  return { type: "home", blocks };
}
export function homeOverflow(body: KnownBlock[], count: number, url: string): void {
  if (count > 0) body.push(homeSection(`+${count} more · ${homeLink({ title: "Open in Constellation ↗", url })}`));
}
export function homeDate(date: Date | string): string {
  const d = new Date(date);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : "No date";
}

export function buildMyWork(data: MyWorkData): HomeView {
  const body: KnownBlock[] = [];
  const now = data.now.getTime(), week = now + 7 * 86_400_000;
  const tasks = data.tasks.filter(t => t.status !== "DONE" && t.status !== "ARCHIVED");
  const groups: [string, HomeTask[]][] = [
    ["Overdue", tasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() < now)],
    ["This week", tasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() >= now && new Date(t.dueDate).getTime() <= week)],
    ["Later", tasks.filter(t => !t.dueDate || !Number.isFinite(new Date(t.dueDate).getTime()) || new Date(t.dueDate).getTime() > week)],
  ];
  for (const [label, items] of groups) {
    body.push(homeSection(`*${label}*`));
    if (!items.length) body.push(homeSection(`No tasks ${label === "Overdue" ? "overdue" : label === "This week" ? "due this week" : "for later"}.`));
    for (const task of items.slice(0, 20)) body.push(homeSection(`${homeLink(task)}\n${statusPill(task.status)}${task.projectName ? ` · ${escapeMrkdwn(trunc(task.projectName, 180))}` : ""}${task.dueDate ? ` · ${relativeDue(task.dueDate, data.now)}` : " · No due date"}`));
    homeOverflow(body, items.length - 20, `${data.frontendUrl}/clubpm`);
  }
  const waiting = [...data.reviews.map(r => ({ ...r, kind: "CR review" })), ...data.polls.filter(p => !p.answered).map(p => ({ ...p, kind: "Poll not answered" }))];
  body.push(homeSection("*Waiting on you*"));
  if (!waiting.length) body.push(homeSection("No CR reviews or unanswered polls waiting on you."));
  for (const item of waiting.slice(0, 20)) body.push(homeSection(`${item.kind} · ${homeLink(item)}`));
  homeOverflow(body, waiting.length - 20, `${data.frontendUrl}/clubpm`);
  body.push({ type: "actions", elements: [homeButton("New task", "home_create_task", "new"), homeButton("Plan", "home_plan", "plan"), homeButton(data.checkedIn ? "Lab check-out" : "Lab check-in", "home_lab", data.checkedIn ? "out" : "in")] });
  return homeView("mywork", `${data.displayName ? `${data.displayName} · ` : ""}${tasks.length} open tasks · ${waiting.length} waiting on you`, body);
}

export function buildProjects(data: ProjectsData): HomeView {
  const body: KnownBlock[] = [];
  if (!data.projects.length) body.push(homeSection("No projects yet — join a project in Constellation."));
  for (const project of data.projects.slice(0, 30)) {
    const url = `${data.frontendUrl}/clubpm/projects/${encodeURIComponent(project.id)}`;
    const counts = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].map(status => `${statusPill(status)} ${project.statusCounts?.[status] ?? 0}`).join(" · ");
    body.push(homeSection(`*${homeLink({ title: project.name, url })}*\n${counts}\n${project.nextMilestone ? `Next milestone: ${escapeMrkdwn(trunc(project.nextMilestone.title, 180))}${project.nextMilestone.dueDate ? ` · ${homeDate(project.nextMilestone.dueDate)}` : ""}` : "No upcoming milestone."}`));
    body.push({ type: "actions", elements: [homeButton("Report", "home_report", project.id), homeButton("Plan", "home_plan", project.id), homeButton("New task", "home_create_task", project.id)] });
  }
  homeOverflow(body, data.projects.length - 30, `${data.frontendUrl}/clubpm`);
  return homeView("projects", `${data.projects.length} projects`, body);
}
