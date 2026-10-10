import type { App } from "@slack/bolt";
import type { CmdCtx } from "../router.js";
import { prisma } from "../../db/prisma.js";
import { searchVault } from "../../services/vaultSearchService.js";
import { checkoutItem, undoCheckout, VaultCheckoutError } from "../../services/vaultCheckoutService.js";
import { approveCr, rejectCr, getCr } from "../../services/changeRequestService.js";
import { signoffCr, reviewStatus } from "../../services/vaultPrReviewService.js";
import { canAccessVaultProject } from "../../services/vaultGithubJobs.js";
import { setVaultSubscription, subscriptionView } from "../../services/vaultNotificationService.js";
import { refreshCardsSoon } from "../../services/slackCardService.js";
import { buildVaultItemCard, buildVaultCrCard, buildCrNoteModal, buildVaultCheckoutConflict } from "../views/vaultCards.js";
import { loadingView, assertBlockBudget, LIMITS } from "../views/common.js";

const login = () => `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`;
const admin = (member: { isAdmin: boolean; role: string }) => member.isAdmin || member.role === "ADMIN";
async function actor(slackId: string) {
  const member = await prisma.member.findUnique({ where: { slackId } });
  if (!member) throw new Error(login());
  return member;
}
type Actor = Awaited<ReturnType<typeof actor>>;
async function access(memberId: string, projectId: string) {
  if (!await canAccessVaultProject(memberId, projectId)) throw new Error("You cannot access this Vault project.");
}
async function itemFor(memberId: string, id: string) {
  const item = await prisma.vaultItem.findUnique({ where: { id }, include: { checkedOutBy: { select: { displayName: true, slackId: true } } } });
  if (!item || item.deletedAt) throw new Error("Vault item not found.");
  await access(memberId, item.projectId); return item;
}
async function itemBlocks(member: Actor, id: string) {
  const item = await itemFor(member.id, id);
  const subscription = await prisma.vaultSubscription.findUnique({ where: { memberId_itemId: { memberId: member.id, itemId: id } } });
  return buildVaultItemCard(item, { memberId: member.id, isAdmin: admin(member), watching: subscriptionView(subscription).watching });
}
async function crBlocks(member: Actor, id: string) {
  const cr = await getCr(id); await access(member.id, cr.projectId);
  return buildVaultCrCard(cr, { memberId: member.id, isAdmin: admin(member) }, await reviewStatus(id));
}
export async function handleVaultCommand(ctx: CmdCtx): Promise<void> {
  try {
    const member = await actor(ctx.command.user_id);
    const q = ctx.text.replace(/^\S+\s*/, "").trim();
    if (!q) { await ctx.respond({ response_type: "ephemeral", text: "Search CAD parts with /c vault <query>." }); return; }
    const { results } = await searchVault(member.id, { q, limit: 5 });
    const blocks = []; const seen = new Set<string>();
    for (const result of results) {
      const key = result.crId ? `cr:${result.crId}` : result.itemId ? `item:${result.itemId}` : null;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      blocks.push(...(result.crId ? await crBlocks(member, result.crId) : await itemBlocks(member, result.itemId!)));
    }
    assertBlockBudget(blocks, LIMITS.messageBlocks);
    await ctx.respond({ response_type: "ephemeral", text: blocks.length ? `${seen.size} Vault results` : "No matching CAD parts or change requests.", ...(blocks.length ? { blocks } : {}) });
  } catch (err) { await ctx.respond({ response_type: "ephemeral", text: message(err) }); }
}
function message(err: unknown): string { return err instanceof Error ? err.message : "Unable to update the Vault."; }
async function reply(ctx: any, payload: object) {
  if (ctx.respond) await ctx.respond({ response_type: "ephemeral", replace_original: false, ...payload });
  else if (ctx.body.channel?.id) await ctx.client.chat.postEphemeral({ channel: ctx.body.channel.id, user: ctx.body.user.id, ...payload });
}
export function registerVault(app: App): void {
  app.action("vc_open", async ({ ack }) => { await ack(); });
  for (const actionId of ["vc_checkout", "vc_undo", "vc_watch", "cr_signoff", "cr_approve", "cr_reject"]) app.action(actionId, async (ctx: any) => {
    await ctx.ack();
    try {
      const value = JSON.parse(ctx.action.value);
      if (actionId === "cr_approve" || actionId === "cr_reject") {
        // Claim the short-lived trigger before permission queries and review work.
        const opened = await ctx.client.views.open({ trigger_id: ctx.body.trigger_id, view: loadingView("Review change request") });
        try {
          const member = await actor(ctx.body.user.id);
          if (!admin(member)) throw new Error("Only admins can approve or reject change requests.");
          const cr = await getCr(value.c); await access(member.id, cr.projectId);
          if (cr.status !== "OPEN") throw new Error("Change request is not open.");
          await ctx.client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view: buildCrNoteModal(cr.id, actionId === "cr_approve" ? "approve" : "reject", ctx.body.channel?.id) });
        } catch (err) {
          const view = loadingView("Review unavailable"); view.blocks = [{ type: "section", text: { type: "plain_text", text: message(err) } }];
          await ctx.client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view });
        }
        return;
      }
      const member = await actor(ctx.body.user.id);
      if (actionId === "cr_signoff") {
        const cr = await getCr(value.c); await access(member.id, cr.projectId);
        const review = await reviewStatus(cr.id);
        await signoffCr(cr.id, member.id, review.signoffs.some(s => s.memberId === member.id));
        refreshCardsSoon("CHANGE_REQUEST", cr.id);
        await reply(ctx, { text: "Sign-off updated.", blocks: await crBlocks(member, cr.id) }); return;
      }
      const item = await itemFor(member.id, value.i);
      if (actionId === "vc_checkout") {
        try { await checkoutItem(member.id, item.id, { source: "SLACK", force: value.force === true }); }
        catch (err) {
          if (err instanceof VaultCheckoutError && err.status === 409 && err.holder) {
            const current = await itemFor(member.id, item.id);
            await reply(ctx, { text: "This item is already checked out.", blocks: buildVaultCheckoutConflict(current) }); return;
          }
          throw err;
        }
      } else if (actionId === "vc_undo") await undoCheckout(member.id, item.id, "SLACK");
      else {
        const row = await prisma.vaultSubscription.findUnique({ where: { memberId_itemId: { memberId: member.id, itemId: item.id } } });
        const watching = !subscriptionView(row).watching;
        await setVaultSubscription(member.id, item.id, item.projectId, { checkins: watching, decisions: watching, conflicts: watching });
      }
      refreshCardsSoon("VAULT_ITEM", item.id);
      await reply(ctx, { text: "Vault item updated.", blocks: await itemBlocks(member, item.id) });
    } catch (err) { await reply(ctx, { text: message(err) }); }
  });
  app.view("cr_note_submit", async (ctx: any) => {
    await ctx.ack();
    let channelId: string | undefined;
    try {
      const data = JSON.parse(ctx.view.private_metadata); channelId = data.channelId;
      const member = await actor(ctx.body.user.id);
      if (!admin(member)) throw new Error("Only admins can approve or reject change requests.");
      const cr = await getCr(data.c); await access(member.id, cr.projectId);
      const reviewNote = ctx.view.state.values.cr_note?.note?.value ?? undefined;
      if (data.decision === "approve") await approveCr(cr.id, member.id, { reviewNote });
      else if (data.decision === "reject") await rejectCr(cr.id, member.id, { reviewNote });
      else throw new Error("Invalid review decision.");
      refreshCardsSoon("CHANGE_REQUEST", cr.id);
      if (channelId) await ctx.client.chat.postEphemeral({ channel: channelId, user: ctx.body.user.id, text: "Change request reviewed.", blocks: await crBlocks(member, cr.id) });
    } catch (err) {
      if (channelId) await ctx.client.chat.postEphemeral({ channel: channelId, user: ctx.body.user.id, text: message(err) });
      else console.error("[slack-vault] CR review failed", message(err));
    }
  });
}
