import type { App } from "@slack/bolt";
import { prisma } from "../../db/prisma.js";
import { getUpcomingEvents } from "../../services/eventService.js";
import { getMemberRsvps, setMemberRsvp } from "../../services/eventRsvpService.js";
import { loadHomeProjects } from "../../services/slackHomeData.js";
import { refreshAppHome } from "../home.js";
import type { CmdCtx } from "../router.js";
import { buildEventList } from "../views/eventCards.js";

const frontend = () => (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const login = () => `Sign in to Constellation first: ${frontend()}/clubpm/login`;

async function eventList(member: { id: string; isAdmin: boolean; displayName: string; timezone?: string | null }) {
  const [upcoming, projects] = await Promise.all([getUpcomingEvents(7), loadHomeProjects(member)]);
  const projectIds = new Set(projects.map(p => p.id));
  const events = upcoming.filter(e => !e.projectId || projectIds.has(e.projectId));
  const going = await getMemberRsvps(member.id, events.map(e => e.id));
  return buildEventList(events.map(e => ({ id: e.id, title: e.title, startsAt: e.startTime, location: e.location, going: going.has(e.id), count: e._count.rsvps, url: `${frontend()}/clubpm/calendar?event=${encodeURIComponent(e.id)}` })), member.timezone);
}

export async function handleEventsCommand(ctx: CmdCtx): Promise<void> {
  const member = await prisma.member.findUnique({ where: { slackId: ctx.command.user_id } });
  if (!member) { await ctx.respond({ response_type: "ephemeral", text: login() }); return; }
  try { await ctx.respond({ response_type: "ephemeral", text: "Upcoming club events", blocks: await eventList(member) }); }
  catch (error) { await ctx.respond({ response_type: "ephemeral", text: error instanceof Error ? error.message : "Unable to load events." }); }
}

export function registerCalendar(app: App): void {
  app.action("cal_rsvp", async ({ ack, body, action, client, respond }) => {
    await ack();
    if (action.type !== "button" || !action.value) return;
    const isHome = "view" in body && body.view?.type === "home";
    const reply = async (text: string) => {
      if (isHome) await client.views.publish({ user_id: body.user.id, view: { type: "home", blocks: [{ type: "section", text: { type: "plain_text", text } }] } });
      else await respond({ response_type: "ephemeral", text, replace_original: false });
    };
    try {
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) { await reply(login()); return; }
      const value = JSON.parse(action.value) as { e?: unknown; g?: unknown; going?: unknown };
      const going = typeof value.g === "boolean" ? value.g : value.going;
      if (typeof value.e !== "string" || typeof going !== "boolean") throw new Error("Invalid RSVP action. Open the events list again.");
      const event = await prisma.event.findUnique({ where: { id: value.e }, select: { projectId: true } });
      if (!event) throw new Error("Event not found.");
      if (event.projectId && !(await loadHomeProjects(member)).some(p => p.id === event.projectId)) throw new Error("You cannot access this event's project.");
      await setMemberRsvp(value.e, member.id, going);
      if (isHome) await refreshAppHome(client, body.user.id);
      else await respond({ response_type: "ephemeral", replace_original: true, text: "Upcoming club events", blocks: await eventList(member) });
    } catch (error) { await reply(error instanceof Error ? error.message : "Unable to update RSVP."); }
  });
}
