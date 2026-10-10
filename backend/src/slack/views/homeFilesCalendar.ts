import type { KnownBlock, HomeView } from "@slack/types";
import { trunc } from "./common.js";
import { homeButton, homeLink, homeOverflow, homeSection, homeView } from "./home.js";
import type { HomeLink, HomePoll, HomeProject } from "./home.js";
import { buildEventRow } from "./eventCards.js";

export interface FilesData {
  frontendUrl: string; projects: HomeProject[]; projectId?: string | null;
  drive?: { folderUrl?: string | null; files: HomeLink[] };
  github?: { url?: string; repositories: HomeLink[]; pullRequests: HomeLink[]; issues: HomeLink[]; recentLinks: HomeLink[] };
  vault?: { url?: string; checkouts: HomeLink[]; reviews: HomeLink[]; latestRelease?: HomeLink | null };
}
export interface HomeEvent extends HomeLink { id: string; startsAt: Date | string; going: boolean; location?: string | null; count?: number }
export interface CalendarData { frontendUrl: string; now: Date; events: HomeEvent[]; polls: HomePoll[]; timezone?: string | null }

export function buildFiles(data: FilesData): HomeView {
  const body: KnownBlock[] = [];
  const selected = data.projects.find(p => p.id === data.projectId) ?? data.projects[0];
  // Include the selected project even when it is outside Slack's 100-option cap.
  const projects = data.projects.slice(0, 100);
  if (selected && !projects.some(p => p.id === selected.id)) projects[projects.length - 1] = selected;
  if (projects.length) {
    const options = projects.map(p => ({ text: { type: "plain_text" as const, text: trunc(p.name, 75) }, value: p.id }));
    body.push({ type: "actions", elements: [{ type: "static_select", action_id: "home_files_project", placeholder: { type: "plain_text", text: "Choose a project" }, options, initial_option: options.find(o => o.value === selected?.id) }] });
  } else body.push(homeSection("No projects available — join a project to browse files."));
  const projectUrl = selected ? `${data.frontendUrl}/clubpm/projects/${encodeURIComponent(selected.id)}` : `${data.frontendUrl}/clubpm`;
  const group = (label: string, items: HomeLink[], empty: string, url: string) => {
    body.push(homeSection(`*${label}*`));
    if (!items.length) body.push(homeSection(empty));
    for (const item of items.slice(0, 10)) body.push(homeSection(homeLink(item)));
    homeOverflow(body, items.length - 10, url);
  };
  body.push(homeSection(`*Drive* · ${homeLink({ title: "Open ↗", url: data.drive?.folderUrl ?? projectUrl })}`));
  if (!data.drive?.folderUrl) body.push(homeSection("No Drive folder linked — link one in project settings"));
  else group("Recent files", data.drive.files, "No recent Drive files.", data.drive.folderUrl);
  const githubUrl = data.github?.url ?? projectUrl;
  body.push(homeSection(`*GitHub* · ${homeLink({ title: "Open ↗", url: githubUrl })}`));
  if (!data.github?.repositories.length) body.push(homeSection("No GitHub repository linked — link one in project settings"));
  else {
    group("Repositories", data.github.repositories, "No repositories.", githubUrl);
    group("Open PRs", data.github.pullRequests, "No open pull requests.", githubUrl);
    group("Open issues", data.github.issues, "No open issues.", githubUrl);
    group("Recent links", data.github.recentLinks, "No recent GitHub links.", githubUrl);
  }
  const vaultUrl = data.vault?.url ?? `${projectUrl}?tab=vault`;
  body.push(homeSection(`*Vault* · ${homeLink({ title: "Open ↗", url: vaultUrl })}`));
  if (!data.vault) body.push(homeSection("No Vault linked — set one up in project settings"));
  else {
    group("My checkouts", data.vault.checkouts, "No items checked out by you.", vaultUrl);
    group("CRs waiting on me", data.vault.reviews, "No CR reviews waiting on you.", vaultUrl);
    body.push(homeSection(data.vault.latestRelease ? `Latest release: ${homeLink(data.vault.latestRelease)}` : "No Vault releases yet."));
  }
  return homeView("files", selected ? `Files · ${selected.name}` : "Files · Choose a project", body);
}

export function buildCalendar(data: CalendarData): HomeView {
  const body: KnownBlock[] = [homeSection("*Next 14 days*")];
  const now = data.now.getTime(), end = now + 14 * 86_400_000;
  const events = data.events.filter(e => new Date(e.startsAt).getTime() >= now && new Date(e.startsAt).getTime() < end).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  if (!events.length) body.push(homeSection("No events in the next 14 days."));
  for (const event of events.slice(0, 45)) {
    body.push(buildEventRow(event, data.timezone));
  }
  homeOverflow(body, events.length - 45, `${data.frontendUrl}/clubpm/calendar`);
  body.push(homeSection("*Open polls*"));
  if (!data.polls.length) body.push(homeSection("No open meeting polls."));
  for (const poll of data.polls.slice(0, 45)) body.push({ ...homeSection(`${homeLink(poll)}${poll.answered ? " · Response saved" : " · Waiting on your availability"}`), accessory: homeButton("Vote", "poll_open", JSON.stringify({ p: poll.id })) });
  homeOverflow(body, data.polls.length - 45, `${data.frontendUrl}/clubpm/calendar`);
  return homeView("calendar", `${events.length} upcoming events · ${data.polls.length} open polls`, body);
}
