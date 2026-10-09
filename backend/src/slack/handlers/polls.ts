import type { App } from "@slack/bolt";
import type { InputBlock } from "@slack/types";
import { prisma } from "../../db/prisma.js";
import { canRespond, getPoll, getSuggestedAvailability, resolveContext, slotKey, upsertResponse } from "../../services/pollService.js";
import { registerCardRenderer } from "../../services/slackCardService.js";
import { assertBlockBudget, loadingView } from "../views/common.js";
import { buildPollInvite, buildPollModal } from "../views/pollModal.js";

const login = () => `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`;
async function accessiblePoll(pollId: string, memberId: string) {
  const poll = await getPoll(pollId);
  if (!poll) throw new Error("Poll not found.");
  if (poll.status !== "OPEN") throw new Error("Poll is closed.");
  const ctx = await resolveContext(memberId, poll);
  if (!canRespond({ ...poll, invitedMemberIds: poll.invitedMembers.map(m => m.id) }, ctx).ok) throw new Error("Not allowed to respond to this poll.");
  return poll;
}

export function registerPolls(app: App): void {
  registerCardRenderer("POLL_INVITE", async message => {
    const blocks = [];
    for (const ref of message.refs.filter(r => r.entityType === "MEETING_POLL").slice(0, 16)) {
      const poll = await getPoll(ref.entityId);
      if (poll) blocks.push(...buildPollInvite(poll));
    }
    if (!blocks.length) blocks.push({ type: "section" as const, text: { type: "plain_text" as const, text: "This meeting poll is no longer available." } });
    assertBlockBudget(blocks, 50);
    return { text: "Fill in your meeting availability", blocks };
  });

  app.action("poll_open", async ({ ack, action, body, client, respond }) => {
    await ack();
    if (action.type !== "button" || !action.value || !("trigger_id" in body)) return;
    let loading: { id: string; hash?: string } | undefined;
    try {
      const opened = await client.views.open({ trigger_id: body.trigger_id, view: loadingView("Meeting availability") });
      if (!opened.view?.id) return;
      loading = { id: opened.view.id, hash: opened.view.hash };
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) { await respond({ response_type: "ephemeral", text: login(), replace_original: false }); await client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view: { type: "modal", title: { type: "plain_text", text: "Sign in first" }, close: { type: "plain_text", text: "Close" }, blocks: [{ type: "section", text: { type: "plain_text", text: login() } }] } }); return; }
      const value = JSON.parse(action.value) as { p: string };
      const poll = await accessiblePoll(value.p, member.id);
      await client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view: buildPollModal(poll, poll.responses.find(r => r.memberId === member.id)?.slots ?? []) });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to open poll.";
      if (loading) await client.views.update({ view_id: loading.id, hash: loading.hash, view: { type: "modal", title: { type: "plain_text", text: "Unable to open poll" }, close: { type: "plain_text", text: "Close" }, blocks: [{ type: "section", text: { type: "plain_text", text } }] } });
      else await respond({ response_type: "ephemeral", text, replace_original: false });
    }
  });

  app.action("poll_usual", async ({ ack, body, client, respond }) => {
    await ack();
    if (!("view" in body) || !body.view || body.view.type !== "modal") return;
    try {
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) { await respond({ response_type: "ephemeral", text: login(), replace_original: false }); return; }
      const poll = await accessiblePoll(body.view.private_metadata, member.id);
      const suggestion = await getSuggestedAvailability(member.id, poll);
      // New block ids make Slack apply the prefill instead of retaining old checkbox state.
      await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildPollModal(poll, suggestion.slots, String(Date.now())) });
    } catch (error) { await respond({ response_type: "ephemeral", text: error instanceof Error ? error.message : "Unable to suggest availability.", replace_original: false }); }
  });

  app.view("poll_submit", async ({ ack, body, view, client }) => {
    // Loading replacement acknowledges before database work, and remains available for errors.
    await ack({ response_action: "update", view: loadingView("Saving availability") });
    try {
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) throw new Error(login());
      const poll = await accessiblePoll(view.private_metadata, member.id);
      const visible = new Set(view.blocks.flatMap(block => {
        if (block.type !== "input" || !("element" in block)) return [];
        const input = block as InputBlock;
        return input.element.type === "checkboxes" ? input.element.options.map(o => o.value) : [];
      }));
      const selected = Object.values(view.state.values).flatMap(actions => actions.poll_slots?.selected_options?.map(o => o.value) ?? []);
      const hidden = (poll.responses.find(r => r.memberId === member.id)?.slots ?? []).map(slotKey).filter(s => !visible.has(s));
      await upsertResponse(poll.id, { memberId: member.id, slots: [...hidden, ...selected] });
      const dm = await client.conversations.open({ users: body.user.id });
      if (dm.channel?.id) await client.chat.postMessage({ channel: dm.channel.id, text: `Saved your availability for ${poll.title}` });
      await client.views.update({ view_id: view.id, view: { type: "modal", title: { type: "plain_text", text: "Availability saved" }, close: { type: "plain_text", text: "Close" }, blocks: [{ type: "section", text: { type: "plain_text", text: `Saved your availability for ${poll.title}` } }] } });
    } catch (error) {
      await client.views.update({ view_id: view.id, view: { type: "modal", title: { type: "plain_text", text: "Unable to save" }, close: { type: "plain_text", text: "Close" }, blocks: [{ type: "section", text: { type: "plain_text", text: error instanceof Error ? error.message : "Unable to save availability." } }] } });
    }
  });
}
