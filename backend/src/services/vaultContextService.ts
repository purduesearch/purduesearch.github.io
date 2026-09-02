import { prisma } from "../db/prisma.js";
// generateText / generateJson stay direct until the Phase 8 standard-lane migration.
import { generateText, generateJson, todayContext } from "./geminiService.js";
import { runText } from "./ai/aiRouter.js";
import type { ActivityEventType, ChangeRequestStatus } from "@prisma/client";

// ── Vault Context Service ────────────────────────────────────
// Assembles a typed snapshot of a project's vault for AI prompts (Q&A,
// duplicate detection, CR release notes / impact summaries), mirroring
// projectContextService's role for project-level AI features. All prompt
// building + Gemini calls live here so the vault routers stay thin.

const VAULT_EVENT_TYPES: ActivityEventType[] = [
  "VAULT_ITEM_CREATED", "VAULT_ITEM_UPDATED", "VAULT_ITEM_DELETED",
  "VAULT_VERSION_CHECKED_IN", "VAULT_ITEM_CHECKED_OUT", "VAULT_CHECKOUT_RELEASED",
  "VAULT_ITEM_PROMOTED", "VAULT_REVISION_RELEASED",
  "CHANGE_REQUEST_CREATED", "CHANGE_REQUEST_UPDATED", "CHANGE_REQUEST_APPROVED",
  "CHANGE_REQUEST_REJECTED", "CHANGE_REQUEST_CANCELLED",
  "VAULT_BOM_LINK_ADDED", "VAULT_BOM_LINK_REMOVED",
];

export interface VaultContextItem {
  id: string;
  name: string;
  description: string | null;
  partNumber: string | null;
  currentRevision: string | null;
  latestVersion: { versionNumber: number; fileName: string; note: string | null } | null;
  checkedOutBy: string | null;
  openCrNumbers: number[];
}

export interface VaultContextBomEdge {
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  quantity: number;
}

export interface VaultContextCr {
  id: string;
  number: number;
  title: string;
  status: ChangeRequestStatus;
  authorName: string | null;
  itemNames: string[];
  createdAt: string;
}

export interface VaultContextAuditEvent {
  eventType: string;
  actorName: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface VaultContext {
  project: { id: string; name: string };
  items: VaultContextItem[];
  bomEdges: VaultContextBomEdge[];
  changeRequests: VaultContextCr[];
  recentActivity: VaultContextAuditEvent[];
}

export async function buildVaultContext(projectId: string): Promise<VaultContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) return null;

  const [itemsRaw, crsRaw, auditRaw] = await Promise.all([
    prisma.vaultItem.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        checkedOutBy: { select: { displayName: true } },
        crItems: { where: { changeRequest: { status: "OPEN" } }, select: { changeRequest: { select: { number: true } } } },
        childLinks: { include: { child: { select: { id: true, name: true, deletedAt: true } } } },
      },
    }),
    prisma.changeRequest.findMany({
      where: { projectId },
      orderBy: { number: "desc" },
      include: {
        author: { select: { displayName: true } },
        items: { select: { item: { select: { name: true } } } },
      },
    }),
    prisma.activityLog.findMany({
      where: { projectId, eventType: { in: VAULT_EVENT_TYPES } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { member: { select: { displayName: true } } },
    }),
  ]);

  const items: VaultContextItem[] = itemsRaw.map((it) => ({
    id: it.id,
    name: it.name,
    description: it.description,
    partNumber: it.partNumber,
    currentRevision: it.currentRevision,
    latestVersion: it.versions[0]
      ? { versionNumber: it.versions[0].versionNumber, fileName: it.versions[0].fileName, note: it.versions[0].note }
      : null,
    checkedOutBy: it.checkedOutBy?.displayName ?? null,
    openCrNumbers: it.crItems.map((ci) => ci.changeRequest.number),
  }));

  const bomEdges: VaultContextBomEdge[] = itemsRaw.flatMap((it) =>
    it.childLinks
      .filter((edge) => !edge.child.deletedAt)
      .map((edge) => ({
        parentId: it.id,
        parentName: it.name,
        childId: edge.child.id,
        childName: edge.child.name,
        quantity: edge.quantity,
      }))
  );

  const changeRequests: VaultContextCr[] = crsRaw.map((cr) => ({
    id: cr.id,
    number: cr.number,
    title: cr.title,
    status: cr.status,
    authorName: cr.author?.displayName ?? null,
    itemNames: cr.items.map((ci) => ci.item.name),
    createdAt: cr.createdAt.toISOString(),
  }));

  const recentActivity: VaultContextAuditEvent[] = auditRaw.map((a) => ({
    eventType: a.eventType,
    actorName: a.member?.displayName ?? null,
    payload: (a.payload as Record<string, unknown> | null) ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  return { project, items, bomEdges, changeRequests, recentActivity };
}

// ── Q&A over the vault ───────────────────────────────────────

/** Returns the answer string, or null if the project doesn't exist. */
export async function askVault(
  projectId: string, question: string, memberId?: string | null
): Promise<string | null> {
  const context = await buildVaultContext(projectId);
  if (!context) return null;

  const prompt = `${todayContext()}

You are the CAD vault copilot for the SEARCH club's project "${context.project.name}".
Below is the current state of the project's Constellation Vault (revision-controlled CAD
files): items with their part numbers, released revisions, latest check-ins and checkout
holders; bill-of-materials links; change requests; and recent vault activity.

Answer the member's question using ONLY this data. Be concise and concrete — reference
items by name and part number, change requests as CR-<number>, and revisions as
"Rev <letter>". If the data doesn't contain the answer, say so plainly.

VAULT DATA (JSON):
${JSON.stringify({ items: context.items, bomEdges: context.bomEdges, changeRequests: context.changeRequests, recentActivity: context.recentActivity }, null, 2)}

QUESTION: ${question}`;

  return runText({ memberId }, "high", { prompt, json: false });
}

// ── Duplicate detection (heuristic + semantic, metadata only) ─

export interface DuplicateCandidate {
  itemId: string;
  name: string;
  partNumber: string | null;
  score: number;
  reason: string;
}

/** lowercase, strip extension/digits/separators, split into distinct tokens */
function nameTokens(raw: string): Set<string> {
  const base = raw.replace(/\.[a-z0-9]+$/i, "");
  return new Set(
    base
      .toLowerCase()
      .replace(/[0-9]+/g, " ")
      .split(/[\s\-_.,()[\]+]+/)
      .filter((t) => t.length > 1)
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

// Score combination: token overlap yields a 0-1 Jaccard score; the semantic
// pass is a soft signal layered on top. A semantic confirmation of a token
// match adds SEMANTIC_CONFIRM_BONUS (capped at 1); a semantic-only match
// enters at SEMANTIC_ONLY_SCORE — above weak token overlaps, below strong
// ones. Any new signal (e.g. geometry hashing) should slot into this scheme
// rather than invent new ad hoc constants.
const SEMANTIC_CONFIRM_BONUS = 0.3;
const SEMANTIC_ONLY_SCORE = 0.5;

/**
 * Filename token-overlap score against existing items, plus a Gemini semantic
 * pass over item names/descriptions. Metadata only — never claims anything
 * about geometry. Top 3 candidates, best first.
 */
export async function findDuplicateCandidates(
  projectId: string,
  fileName: string,
  name?: string | null
): Promise<DuplicateCandidate[]> {
  const items = await prisma.vaultItem.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, name: true, description: true, partNumber: true },
  });
  if (items.length === 0) return [];

  const inputTokens = nameTokens(`${fileName} ${name ?? ""}`);
  const byId = new Map<string, DuplicateCandidate>();

  for (const item of items) {
    const score = overlapScore(inputTokens, nameTokens(item.name));
    if (score > 0) {
      byId.set(item.id, {
        itemId: item.id,
        name: item.name,
        partNumber: item.partNumber,
        score: Math.round(score * 100) / 100,
        reason: "Similar file/item name",
      });
    }
  }

  // Semantic pass: metadata only (names + descriptions), soft signal.
  const semantic = await generateJson<{ candidates: { itemId: string; reason: string }[] }>(
    `A member is checking a new file into a CAD vault.
New file name: "${fileName}"${name ? `, proposed item name: "${name}"` : ""}.

Existing vault items (JSON):
${JSON.stringify(items.map((i) => ({ itemId: i.id, name: i.name, description: i.description })), null, 2)}

Based ONLY on names and descriptions (you cannot see any geometry), list up to 3 existing
items this new file might be a duplicate or a new version of. Only include genuinely
plausible matches — an empty list is a fine answer.

Respond with JSON: { "candidates": [{ "itemId": "...", "reason": "<one short sentence>" }] }`
  );

  for (const cand of semantic?.candidates ?? []) {
    const item = items.find((i) => i.id === cand.itemId);
    if (!item) continue; // ignore hallucinated ids
    const existing = byId.get(item.id);
    if (existing) {
      existing.score = Math.min(1, Math.round((existing.score + SEMANTIC_CONFIRM_BONUS) * 100) / 100);
      existing.reason = cand.reason || existing.reason;
    } else {
      byId.set(item.id, {
        itemId: item.id,
        name: item.name,
        partNumber: item.partNumber,
        score: SEMANTIC_ONLY_SCORE,
        reason: cand.reason || "Semantically similar item",
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 3);
}

// ── CR release-notes draft + impact summary ──────────────────

const CR_AI_INCLUDE = {
  author: { select: { displayName: true } },
  task: { select: { id: true, title: true, status: true } },
  items: {
    include: {
      item: { select: { id: true, name: true, partNumber: true, currentRevision: true } },
      version: { select: { versionNumber: true, fileName: true, note: true } },
    },
  },
} as const;

async function recentItemHistory(itemId: string, take = 10) {
  const logs = await prisma.activityLog.findMany({
    where: { vaultItemId: itemId },
    orderBy: { createdAt: "desc" },
    take,
    include: { member: { select: { displayName: true } } },
  });
  return logs.map((l) => ({
    eventType: l.eventType,
    actorName: l.member?.displayName ?? null,
    payload: l.payload,
    at: l.createdAt.toISOString(),
  }));
}

/** Draft release notes for a CR. Returns null if the CR doesn't exist. Not persisted. */
export async function draftCrReleaseNotes(crId: string): Promise<string | null> {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId }, include: CR_AI_INCLUDE });
  if (!cr) return null;

  const itemsWithHistory = await Promise.all(
    cr.items.map(async (ci) => ({
      name: ci.item.name,
      partNumber: ci.item.partNumber,
      currentRevision: ci.item.currentRevision,
      targetRevision: ci.targetRevision,
      version: ci.version,
      recentHistory: await recentItemHistory(ci.item.id),
    }))
  );

  const prompt = `${todayContext()}

Draft concise release notes for this CAD change request. Write 3-6 plain sentences (or a
short bullet list) a reviewer and future teammates can skim: what changed, why, and what
revision each item moves to. No headings, no preamble — output only the release notes text.

CHANGE REQUEST: CR-${cr.number} — ${cr.title}
Author: ${cr.author?.displayName ?? "Unknown"}
Reason: ${cr.description ?? "(none given)"}

ITEMS (JSON, including check-in notes and recent history):
${JSON.stringify(itemsWithHistory, null, 2)}`;

  return generateText(prompt);
}

type AncestorEdge = { parentId: string; parentLabel: string; quantity: number };

const WHERE_USED_MAX_DEPTH = 5;

/**
 * Batched upward BFS from all seed items at once — one query per depth level
 * (the same frontier-batching pattern as vaultService's wouldCreateBomCycle)
 * instead of one query per node. Returns childId → live parent edges.
 */
async function collectAncestorEdges(seedIds: string[]): Promise<Map<string, AncestorEdge[]>> {
  const edgesByChild = new Map<string, AncestorEdge[]>();
  const visited = new Set(seedIds);
  let frontier = [...new Set(seedIds)];

  for (let depth = 0; depth < WHERE_USED_MAX_DEPTH && frontier.length > 0; depth++) {
    const edges = await prisma.vaultBomEdge.findMany({
      where: { childId: { in: frontier } },
      include: { parent: { select: { id: true, name: true, partNumber: true, deletedAt: true } } },
    });
    const next: string[] = [];
    for (const edge of edges) {
      if (edge.parent.deletedAt) continue;
      const parentLabel = `${edge.parent.name}${edge.parent.partNumber ? ` (${edge.parent.partNumber})` : ""}`;
      const list = edgesByChild.get(edge.childId) ?? [];
      list.push({ parentId: edge.parent.id, parentLabel, quantity: edge.quantity });
      edgesByChild.set(edge.childId, list);
      if (!visited.has(edge.parent.id)) {
        visited.add(edge.parent.id);
        next.push(edge.parent.id);
      }
    }
    frontier = next;
  }
  return edgesByChild;
}

/** Readable where-used chains for one item, built from the in-memory edge map. */
function buildWhereUsedChains(itemId: string, itemName: string, edgesByChild: Map<string, AncestorEdge[]>): string[] {
  const chains: string[] = [];
  const walk = (id: string, label: string, visited: Set<string>, depth: number): void => {
    const parents = (edgesByChild.get(id) ?? []).filter((e) => !visited.has(e.parentId));
    if (parents.length === 0 || depth >= WHERE_USED_MAX_DEPTH) {
      if (depth > 0) chains.push(label);
      return;
    }
    for (const edge of parents) {
      walk(edge.parentId, `${label} ← used in ${edge.parentLabel} ×${edge.quantity}`, new Set([...visited, edge.parentId]), depth + 1);
    }
  };
  walk(itemId, itemName, new Set([itemId]), 0);
  return chains;
}

/** Summarize the impact of approving a CR. Returns null if the CR doesn't exist. */
export async function summarizeCrImpact(crId: string): Promise<string | null> {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId }, include: CR_AI_INCLUDE });
  if (!cr) return null;

  const edgesByChild = await collectAncestorEdges(cr.items.map((ci) => ci.item.id));
  const chains = cr.items.flatMap((ci) => buildWhereUsedChains(ci.item.id, ci.item.name, edgesByChild));

  // Open project tasks whose title/description mention an item name or part number.
  const openTasks = await prisma.task.findMany({
    where: { projectId: cr.projectId, archivedAt: null, status: { not: "DONE" } },
    select: { title: true, description: true, status: true },
  });
  const needles = cr.items.flatMap((ci) =>
    [ci.item.name, ci.item.partNumber].filter((s): s is string => !!s).map((s) => s.toLowerCase())
  );
  const mentioningTasks = openTasks
    .filter((t) => {
      const haystack = `${t.title} ${t.description ?? ""}`.toLowerCase();
      return needles.some((n) => haystack.includes(n));
    })
    .map((t) => ({ title: t.title, status: t.status }));

  const prompt = `${todayContext()}

Summarize the impact of approving this CAD change request in 3-5 plain sentences for an
admin reviewer: which items get a new released revision, which assemblies use them
(where-used chains below), and any related open work. Base everything strictly on the data
below — no speculation about geometry or physical fit. Output only the summary text.

CHANGE REQUEST: CR-${cr.number} — ${cr.title}
Reason: ${cr.description ?? "(none given)"}
Linked task: ${cr.task ? `"${cr.task.title}" (${cr.task.status})` : "none"}

ITEMS BEING RELEASED (JSON):
${JSON.stringify(
    cr.items.map((ci) => ({
      name: ci.item.name,
      partNumber: ci.item.partNumber,
      currentRevision: ci.item.currentRevision,
      targetRevision: ci.targetRevision,
      version: ci.version.versionNumber,
    })),
    null,
    2
  )}

WHERE-USED CHAINS:
${chains.length > 0 ? chains.map((c) => `- ${c}`).join("\n") : "(none — no assemblies use these items)"}

OPEN TASKS MENTIONING THESE ITEMS:
${mentioningTasks.length > 0 ? JSON.stringify(mentioningTasks, null, 2) : "(none)"}`;

  return generateText(prompt);
}
