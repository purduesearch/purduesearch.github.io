// Pure. Who hears about a Vault event, on which channel, and what it says.
// The outbox/delivery machinery that acts on this lives in
// vaultNotificationService.ts; tests are in vaultNotify.test.ts.

import { routeFor } from "./notificationRouting.js";
import { vaultLink } from "./vaultSearchCore.js";

export type VaultEventKind = "CHECKIN" | "CR_DECIDED" | "CHECKOUT_CONFLICT";
export type DeliveryChannel = "IN_APP" | "SLACK";
export type ConflictKind = "CHECKIN_WHILE_HELD" | "TAKEOVER" | "CHECKOUT_BLOCKED";

export interface VaultEventPayload {
  itemName?: string;
  partNumber?: string | null;
  itemId?: string;
  versionId?: string;
  versionNumber?: number;
  fileName?: string;
  note?: string | null;
  crId?: string;
  crNumber?: number;
  crTitle?: string;
  decision?: "APPROVED" | "REJECTED";
  conflict?: ConflictKind;
  actorName?: string | null;
}

export interface VaultEventRow {
  id: string;
  kind: VaultEventKind;
  projectId: string;
  itemIds: string[];
  actorId: string | null;
  directRecipientIds: string[];
  payload: VaultEventPayload;
}

// ── Event keys ────────────────────────────────────────────────
// Deterministic, so the same real-world event always maps to one outbox row.

export const eventKeys = {
  checkin: (versionId: string) => `checkin:${versionId}`,
  crDecided: (crId: string, decision: string) => `cr:${crId}:${decision}`,
  checkinWhileHeld: (itemId: string, versionId: string) => `conflict:${itemId}:checkin:${versionId}`,
  takeover: (itemId: string, previousHolderId: string, previousCheckedOutAt: Date | null) =>
    `conflict:${itemId}:takeover:${previousHolderId}:${previousCheckedOutAt?.getTime() ?? 0}`,
  /** One notice per requester per checkout session, however many times they retry. */
  blocked: (itemId: string, requesterId: string, holderId: string, holderCheckedOutAt: Date | null) =>
    `conflict:${itemId}:blocked:${requesterId}:${holderId}:${holderCheckedOutAt?.getTime() ?? 0}`,
};

type ItemRef = { id: string; projectId: string; name: string; partNumber: string | null };
type VersionRef = { id: string; versionNumber: number; fileName: string; note: string | null };

/**
 * The events one check-in produces: CHECKIN for watchers, plus a
 * CHECKOUT_CONFLICT addressed to the holder when someone else held the item.
 */
export function checkinEventRows(item: ItemRef, version: VersionRef, actorId: string | null, actorName: string | null, otherHolderId: string | null): VaultEventRow[] {
  const base = { itemName: item.name, partNumber: item.partNumber, itemId: item.id, versionId: version.id, versionNumber: version.versionNumber, fileName: version.fileName, note: version.note, actorName };
  const rows: VaultEventRow[] = [{ id: eventKeys.checkin(version.id), kind: "CHECKIN", projectId: item.projectId, itemIds: [item.id], actorId, directRecipientIds: [], payload: base }];
  if (otherHolderId) {
    rows.push({ id: eventKeys.checkinWhileHeld(item.id, version.id), kind: "CHECKOUT_CONFLICT", projectId: item.projectId, itemIds: [item.id], actorId, directRecipientIds: [otherHolderId], payload: { ...base, conflict: "CHECKIN_WHILE_HELD" } });
  }
  return rows;
}

export function conflictEventRow(item: ItemRef, actorId: string | null, actorName: string | null, holderId: string, conflict: ConflictKind, key: string): VaultEventRow {
  return { id: key, kind: "CHECKOUT_CONFLICT", projectId: item.projectId, itemIds: [item.id], actorId, directRecipientIds: [holderId], payload: { itemName: item.name, partNumber: item.partNumber, itemId: item.id, conflict, actorName } };
}

export function crDecisionEventRow(cr: { id: string; projectId: string; number: number; title: string; authorId: string | null; items: Array<{ itemId: string; item: { name: string; partNumber: string | null } }> }, decision: "APPROVED" | "REJECTED", actorId: string | null, actorName: string | null): VaultEventRow {
  const first = cr.items[0]?.item;
  return {
    id: eventKeys.crDecided(cr.id, decision),
    kind: "CR_DECIDED",
    projectId: cr.projectId,
    itemIds: cr.items.map((i) => i.itemId),
    actorId,
    directRecipientIds: cr.authorId ? [cr.authorId] : [],
    payload: { crId: cr.id, crNumber: cr.number, crTitle: cr.title, decision, itemName: first?.name, partNumber: first?.partNumber ?? null, actorName },
  };
}

export const NOTIFICATION_TYPE: Record<VaultEventKind, "VAULT_CHECKIN" | "VAULT_CR_DECIDED" | "VAULT_CHECKOUT_CONFLICT"> = {
  CHECKIN: "VAULT_CHECKIN",
  CR_DECIDED: "VAULT_CR_DECIDED",
  CHECKOUT_CONFLICT: "VAULT_CHECKOUT_CONFLICT",
};

// ── Recipients ────────────────────────────────────────────────

export interface Subscriber { memberId: string; itemId: string; checkins: boolean; decisions: boolean; conflicts: boolean }
export interface RecipientProfile {
  id: string;
  slackId: string | null;
  isBot: boolean;
  notificationChannels: unknown;
  mutedProjectIds: string[];
  /** canAccessVaultProject for the event's project, evaluated now. */
  canAccess: boolean;
}

function wants(sub: Subscriber, kind: VaultEventKind): boolean {
  return kind === "CHECKIN" ? sub.checkins : kind === "CR_DECIDED" ? sub.decisions : sub.conflicts;
}

/**
 * Every (recipient, channel) pair for one event.
 *  - Direct recipients (CR author, checkout holder) plus subscribers whose
 *    per-item choice includes this kind.
 *  - Never the actor, a bot, or anyone who cannot open the project now — a
 *    subscription outlives a membership, the permission check does not.
 *  - A muted project silences it; notificationChannels picks in-app/Slack/off.
 *  - Slack needs a Slack id; a member without one still gets the in-app row.
 */
export function planDeliveries(event: VaultEventRow, subscribers: Subscriber[], profiles: Map<string, RecipientProfile>): Array<{ recipientId: string; channel: DeliveryChannel }> {
  const recipients = new Set<string>(event.directRecipientIds);
  for (const sub of subscribers) if (event.itemIds.includes(sub.itemId) && wants(sub, event.kind)) recipients.add(sub.memberId);
  const type = NOTIFICATION_TYPE[event.kind];
  const out: Array<{ recipientId: string; channel: DeliveryChannel }> = [];
  for (const id of [...recipients].sort()) {
    if (id === event.actorId) continue;
    const profile = profiles.get(id);
    if (!profile || profile.isBot || !profile.canAccess) continue;
    if (profile.mutedProjectIds.includes(event.projectId)) continue;
    const prefs = (profile.notificationChannels ?? {}) as Record<string, unknown>;
    const route = routeFor(type, prefs[type]);
    if (route.inApp) out.push({ recipientId: id, channel: "IN_APP" });
    if (route.slack && profile.slackId) out.push({ recipientId: id, channel: "SLACK" });
  }
  return out;
}

// ── Messages ──────────────────────────────────────────────────

function itemLabel(p: VaultEventPayload): string {
  return p.partNumber ? `${p.partNumber} "${p.itemName ?? "item"}"` : `"${p.itemName ?? "item"}"`;
}

export function eventLink(event: VaultEventRow): string {
  const p = event.payload;
  if (event.kind === "CR_DECIDED") return vaultLink({ projectId: event.projectId, crId: p.crId });
  return vaultLink({ projectId: event.projectId, itemId: p.itemId ?? event.itemIds[0], versionId: p.versionId });
}

/** The text one recipient sees. Direct recipients get the personal wording. */
export function renderMessage(event: VaultEventRow, recipientId: string): string {
  const p = event.payload;
  const who = p.actorName || "Someone";
  const direct = event.directRecipientIds.includes(recipientId);
  switch (event.kind) {
    case "CHECKIN": {
      const note = p.note ? `: ${p.note.length > 120 ? `${p.note.slice(0, 117)}…` : p.note}` : "";
      return `${who} checked in v${p.versionNumber ?? "?"} of ${itemLabel(p)} (${p.fileName ?? "file"})${note}`;
    }
    case "CR_DECIDED": {
      const verb = p.decision === "APPROVED" ? "approved" : "rejected";
      return direct
        ? `Your change request "${p.crTitle}" (CR-${p.crNumber}) was ${verb}.`
        : `CR-${p.crNumber} "${p.crTitle}" was ${verb} by ${who} — it covers ${itemLabel(p)}${event.itemIds.length > 1 ? ` and ${event.itemIds.length - 1} more` : ""}.`;
    }
    case "CHECKOUT_CONFLICT":
      switch (p.conflict) {
        case "CHECKIN_WHILE_HELD":
          return direct
            ? `${who} checked in v${p.versionNumber ?? "?"} of ${itemLabel(p)} while you had it checked out.`
            : `Checkout conflict on ${itemLabel(p)}: ${who} checked in v${p.versionNumber ?? "?"} while another member held it.`;
        case "TAKEOVER":
          return direct
            ? `${who} took over your checkout of ${itemLabel(p)}.`
            : `Checkout conflict on ${itemLabel(p)}: ${who} took over another member's checkout.`;
        default:
          return direct
            ? `${who} tried to check out ${itemLabel(p)}, which you have checked out.`
            : `Checkout conflict on ${itemLabel(p)}: ${who} tried to check it out while it was held.`;
      }
  }
}

export function slackText(message: string, link: string, frontendUrl: string | undefined): string {
  const base = (frontendUrl || "").replace(/\/+$/, "");
  return base ? `${message} <${base}${link}|Open in Constellation>` : message;
}

// ── Retry policy ──────────────────────────────────────────────

export const MAX_DELIVERY_ATTEMPTS = 6;
export const SENDING_LEASE_MS = 2 * 60_000;

/** Backoff after `attempts` failures, or null once the delivery should be FAILED. */
export function nextAttemptDelayMs(attempts: number): number | null {
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return null;
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}
