import { prisma } from "../db/prisma.js";
import { logAuditEvent } from "./activityService.js";
import { canAccessVaultProject } from "./vaultGithubJobs.js";
import { autoWatchSoon, notifyVaultCheckoutConflict } from "./vaultNotificationService.js";
import { eventKeys } from "./vaultNotifyCore.js";
import { reindexItemSoon } from "./vaultSearchService.js";
import { isAdminMember, MEMBER_SUMMARY } from "./vaultService.js";

export class VaultCheckoutError extends Error {
  constructor(public status: number, message: string, public holder?: unknown) {
    super(message);
  }
}

/** Advisory checkout: a forced takeover retains the existing notification rules. */
export async function checkoutItem(
  memberId: string,
  itemId: string,
  opts: { note?: string; force?: boolean; source: "WEB" | "SLACK" },
): Promise<any> {
  const item = await prisma.vaultItem.findUnique({
    where: { id: itemId },
    include: { checkedOutBy: { select: { id: true, displayName: true, avatarUrl: true, slackId: true } } },
  });
  if (!item || item.deletedAt) throw new VaultCheckoutError(404, "Vault item not found");
  if (!(await canAccessVaultProject(memberId, item.projectId))) throw new VaultCheckoutError(403, "Forbidden");

  const heldByOther = !!item.checkedOutById && item.checkedOutById !== memberId;
  if (heldByOther && !opts.force) {
    // One notice per requester per checkout session, however often they retry.
    notifyVaultCheckoutConflict(item, memberId, item.checkedOutById!, "CHECKOUT_BLOCKED", eventKeys.blocked(itemId, memberId, item.checkedOutById!, item.checkedOutAt));
    throw new VaultCheckoutError(409, "Item is already checked out", item.checkedOutBy);
  }

  const previousHolder = heldByOther ? item.checkedOutBy : null;
  const updated = await prisma.vaultItem.update({
    where: { id: itemId },
    data: {
      checkedOutById: memberId,
      checkedOutAt: new Date(),
      checkoutNote: typeof opts.note === "string" ? opts.note.trim() || null : null,
    },
    include: { checkedOutBy: MEMBER_SUMMARY },
  });

  if (previousHolder) {
    notifyVaultCheckoutConflict(item, memberId, previousHolder.id, "TAKEOVER", eventKeys.takeover(itemId, previousHolder.id, item.checkedOutAt));
  }
  autoWatchSoon(memberId, itemId, item.projectId);
  reindexItemSoon(itemId);
  logAuditEvent({
    projectId: item.projectId, memberId, source: opts.source,
    eventType: "VAULT_ITEM_CHECKED_OUT",
    payload: { itemId, forced: !!previousHolder, previousHolderId: previousHolder?.id ?? null },
  }).catch(console.error);
  return updated;
}

/** Release is allowed to the checkout holder or an admin with project access. */
export async function undoCheckout(memberId: string, itemId: string, source: "WEB" | "SLACK"): Promise<any> {
  const item = await prisma.vaultItem.findUnique({ where: { id: itemId } });
  if (!item || item.deletedAt) throw new VaultCheckoutError(404, "Vault item not found");
  if (!(await canAccessVaultProject(memberId, item.projectId))) throw new VaultCheckoutError(403, "Forbidden");
  if (!item.checkedOutById) return item;

  const isHolderOrAdmin = item.checkedOutById === memberId || (await isAdminMember(memberId));
  if (!isHolderOrAdmin) throw new VaultCheckoutError(403, "Only the checkout holder or an admin can release this checkout");

  const previousHolderId = item.checkedOutById;
  const updated = await prisma.vaultItem.update({
    where: { id: itemId },
    data: { checkedOutById: null, checkedOutAt: null, checkoutNote: null },
  });
  logAuditEvent({
    projectId: item.projectId, memberId, source,
    eventType: "VAULT_CHECKOUT_RELEASED",
    payload: { itemId, previousHolderId },
  }).catch(console.error);
  reindexItemSoon(itemId);
  return updated;
}
