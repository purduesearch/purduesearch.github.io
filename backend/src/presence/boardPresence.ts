import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { prisma } from "../db/prisma.js";
import { verifyBearerToken } from "../api/auth.js";
import { taskAssignmentPermissions } from "../middleware/taskAccess.js";
import { LIMITS, LockTable, RateLimiter, isId, parseClientMessage, type ClientMsg, type Released } from "./boardPresenceCore.js";

/**
 * Live board presence relay. Holds, per project family (root + sub-projects),
 * who is on which board, their latest cursor, selections and card locks — all
 * in memory. Task data never flows through here except as server-built patches
 * (boardPatch.ts). Mounted under /collab/ because production nginx only
 * forwards WebSocket upgrades there.
 */
export const PRESENCE_PATH = "/collab/board";

export type Conn = {
  sid: string;
  ws: WebSocket;
  memberId: string;
  name: string;
  avatarUrl: string | null;
  room: string;
  family: Family;
  limiter: RateLimiter;
  cursor: [string, number, number] | null;
  cursorDirty: boolean;
  sel: string[];
  drag: { ids: string[]; grabbed: string } | null;
  carry: string | null;
  viewing: string | null;
  hidden: boolean;
  lastSeen: number;
};

export type Family = {
  root: string;
  projects: Map<string, string>; // projectId → name
  conns: Map<string, Conn>;
  locks: LockTable;
};

const families = new Map<string, Family>();
const loading = new Map<string, Promise<Family>>();
let sidCounter = 0;

function sendRaw(c: Conn, data: string, droppable: boolean): void {
  if (c.ws.readyState !== WebSocket.OPEN) return;
  // A slow client skips cursor frames; it must still get events and patches.
  if (droppable && c.ws.bufferedAmount > 256 * 1024) return;
  c.ws.send(data);
}
function send(c: Conn, msg: unknown): void { sendRaw(c, JSON.stringify(msg), false); }

function familycast(f: Family, msg: unknown, except?: Conn): void {
  const data = JSON.stringify(msg);
  for (const c of f.conns.values()) if (c !== except) sendRaw(c, data, false);
}
function roomcast(from: Conn, msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const c of from.family.conns.values()) {
    if (c !== from && c.room === from.room && !c.hidden) sendRaw(c, data, false);
  }
}
/** Patches go to every socket on that board, hidden tabs included. */
export function sendToRoom(f: Family, room: string, msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const c of f.conns.values()) if (c.room === room) sendRaw(c, data, false);
}

export function getFamily(root: string): Family | undefined { return families.get(root); }
export function allFamilies(): Family[] { return [...families.values()]; }

async function loadFamily(root: string): Promise<Family> {
  const existing = families.get(root);
  if (existing) return existing;
  const pending = loading.get(root);
  if (pending) return pending;
  const p = (async () => {
    const rows = await prisma.project.findMany({
      where: { OR: [{ id: root }, { parentId: root }] },
      select: { id: true, name: true },
    });
    const family: Family = { root, projects: new Map(rows.map(r => [r.id, r.name])), conns: new Map(), locks: new LockTable() };
    // PHASE 3: seed unexpired mirrored locks for this family here.
    families.set(root, family);
    return family;
  })().finally(() => loading.delete(root));
  loading.set(root, p);
  return p;
}

function snapshot(c: Conn) {
  const f = c.family;
  const all = [...f.conns.values()];
  const room = all.filter(o => o.room === c.room);
  return {
    self: c.sid,
    room: c.room,
    projects: [...f.projects.entries()],
    conns: all.map(o => [o.sid, o.memberId, o.name, o.avatarUrl, o.room]),
    locks: f.locks.entries().map(([id, h]) => [id, h.sid, h.memberId]),
    drags: all.filter(o => o.drag).map(o => [o.sid, o.drag!.ids, o.drag!.grabbed]),
    sel: room.filter(o => o.sel.length).map(o => [o.sid, o.sel]),
    cursors: room.filter(o => o.cursor).map(o => [o.sid, ...o.cursor!]),
    carry: room.filter(o => o.carry).map(o => [o.sid, o.carry]),
    viewing: room.filter(o => o.viewing).map(o => [o.sid, o.viewing]),
  };
}

/** Tells the family about released locks. PHASE 3 adds the mirror delete. */
export function announceReleased(f: Family, released: Released[]): void {
  for (const r of released) {
    if (!r.ids.length) continue;
    const holder = r.sid ? f.conns.get(r.sid) : undefined;
    if (holder?.drag) holder.drag = null;
    familycast(f, ["e", r.sid, "dc", r.ids]);
  }
}

function firstAuthMessage(ws: WebSocket): Promise<string | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => done(null), LIMITS.authTimeoutMs);
    const onMsg = (data: RawData) => {
      const m = parseClientMessage(data.toString());
      done(m?.t === "auth" ? m.token : null);
    };
    const onClose = () => done(null);
    function done(v: string | null) {
      clearTimeout(timer);
      ws.off("message", onMsg);
      ws.off("close", onClose);
      resolve(v);
    }
    ws.on("message", onMsg);
    ws.on("close", onClose);
  });
}

async function accept(ws: WebSocket, url: URL): Promise<void> {
  const projectId = url.searchParams.get("project") ?? "";
  const rootHint = url.searchParams.get("root");
  const token = await firstAuthMessage(ws);
  const memberId = token ? await verifyBearerToken(token) : null;
  if (!memberId) { ws.close(4401, "unauthorized"); return; }
  if (!isId(projectId)) { ws.close(4404, "not found"); return; }
  const [project, member] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, parentId: true } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true, avatarUrl: true } }),
  ]);
  if (!project || !member) { ws.close(4404, "not found"); return; }
  const root = project.parentId ?? project.id;
  if (rootHint && rootHint !== root) { ws.close(4409, root); return; }
  const family = await loadFamily(root);
  if (!family.projects.has(projectId)) family.projects.set(projectId, "");
  if (ws.readyState !== WebSocket.OPEN) return;

  const c: Conn = {
    sid: `s${++sidCounter}`, ws, memberId, name: member.displayName, avatarUrl: member.avatarUrl ?? null,
    room: projectId, family, limiter: new RateLimiter(), cursor: null, cursorDirty: false,
    sel: [], drag: null, carry: null, viewing: null, hidden: false, lastSeen: Date.now(),
  };
  family.conns.set(c.sid, c);
  ws.on("message", (data: RawData) => onMessage(c, data));
  ws.on("close", () => onClose(c));
  send(c, ["hi", snapshot(c)]);
  familycast(family, ["join", c.sid, c.memberId, c.name, c.avatarUrl, c.room], c);
}

function onMessage(c: Conn, data: RawData): void {
  const now = Date.now();
  if (!c.limiter.allow(now)) return;
  const msg = parseClientMessage(data.toString());
  if (!msg) return;
  c.lastSeen = now;
  c.family.locks.renew(c.sid, now);
  handle(c, msg, now);
}

function handle(c: Conn, msg: ClientMsg, now: number): void {
  const f = c.family;
  switch (msg.t) {
    case "auth": case "hb": return;
    case "c": c.cursor = [msg.anchor, msg.x, msg.y]; c.cursorDirty = true; return;
    case "sel": c.sel = msg.ids; roomcast(c, ["e", c.sid, "sel", msg.ids]); return;
    case "ds": void requestLock(c, msg.ids, msg.grabbed); return;
    case "de":
      f.locks.markDropped(c.sid, msg.ids, now);
      familycast(f, ["e", c.sid, "de", msg.ids, msg.status], c);
      return;
    case "dc": {
      const ids = f.locks.release(c.sid, msg.ids);
      c.drag = null;
      if (ids.length) announceReleased(f, [{ sid: c.sid, memberId: c.memberId, ids }]);
      return;
    }
    case "as": c.carry = msg.memberId; roomcast(c, ["e", c.sid, "as", msg.memberId]); return;
    case "ae": c.carry = null; roomcast(c, ["e", c.sid, "ae", msg.taskId]); return;
    case "ac": c.carry = null; roomcast(c, ["e", c.sid, "ac"]); return;
    case "o": c.viewing = msg.taskId; roomcast(c, ["e", c.sid, "o", msg.taskId]); return;
    case "oc": c.viewing = null; roomcast(c, ["e", c.sid, "oc"]); return;
    case "h": c.hidden = msg.hidden; if (!msg.hidden) send(c, ["hi", snapshot(c)]); return;
    case "join": void joinRoom(c, msg.projectId); return;
  }
}

async function requestLock(c: Conn, ids: string[], grabbed: string): Promise<void> {
  const f = c.family;
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, projectId: true, createdById: true, archivedAt: true, assignees: { select: { id: true } } },
  });
  const inFamily = tasks.length === ids.length && tasks.every(t => f.projects.has(t.projectId));
  const allowed = inFamily && (await taskAssignmentPermissions(c.memberId, tasks)).every(t => t.canAssign);
  if (c.ws.readyState !== WebSocket.OPEN) return;
  if (!allowed) { send(c, ["no", ids, null, null]); return; }
  // Checked and granted synchronously after the await, so two racing requests cannot both win.
  const r = f.locks.tryAcquire(ids, c.sid, c.memberId, Date.now());
  if (!r.ok) { send(c, ["no", ids, r.holder.sid, r.holder.memberId]); return; }
  c.drag = { ids, grabbed };
  send(c, ["ok", ids]);
  familycast(f, ["e", c.sid, "ds", ids, grabbed], c);
  // PHASE 3: mirror the grant (boardLockService.mirrorAcquire).
}

async function joinRoom(c: Conn, projectId: string): Promise<void> {
  const f = c.family;
  if (!f.projects.has(projectId)) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, parentId: true } });
    const root = p ? p.parentId ?? p.id : "";
    if (!p || root !== f.root) { c.ws.close(4409, root); return; }
    f.projects.set(p.id, p.name);
  }
  c.room = projectId;
  c.cursor = null; c.sel = []; c.carry = null; c.viewing = null;
  familycast(f, ["room", c.sid, projectId], c);
  send(c, ["hi", snapshot(c)]);
}

function onClose(c: Conn): void {
  const f = c.family;
  if (f.conns.get(c.sid) !== c) return;
  f.conns.delete(c.sid);
  const ids = f.locks.release(c.sid);
  if (ids.length) announceReleased(f, [{ sid: c.sid, memberId: c.memberId, ids }]);
  familycast(f, ["bye", c.sid]);
  if (!f.conns.size && !f.locks.size) families.delete(f.root);
}

function tick(): void {
  for (const f of families.values()) {
    const byRoom = new Map<string, unknown[]>();
    for (const c of f.conns.values()) {
      if (!c.cursorDirty || !c.cursor) continue;
      c.cursorDirty = false;
      const list = byRoom.get(c.room) ?? [];
      list.push([c.sid, ...c.cursor]);
      byRoom.set(c.room, list);
    }
    for (const [room, list] of byRoom) {
      const data = JSON.stringify(["f", list]);
      for (const c of f.conns.values()) if (c.room === room && !c.hidden) sendRaw(c, data, true);
    }
  }
}

function sweep(): void {
  const now = Date.now();
  for (const f of allFamilies()) {
    announceReleased(f, f.locks.sweep(now));
    for (const c of f.conns.values()) if (now - c.lastSeen > 60_000) c.ws.terminate();
    // PHASE 3: every 5 s, renew the mirror rows of locks still held.
    if (!f.conns.size && !f.locks.size) families.delete(f.root);
  }
}

export function attachBoardPresence(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxMessageBytes });
  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== PRESENCE_PATH) return;
    wss.handleUpgrade(req, socket, head, ws => {
      // An unhandled "error" on a ws socket is rethrown and kills the process.
      ws.on("error", err => console.error("[presence] socket error:", err.message));
      accept(ws, url).catch(err => {
        console.error("[presence] accept failed:", err);
        if (ws.readyState === WebSocket.OPEN) ws.close(1011, "error");
      });
    });
  });
  setInterval(tick, LIMITS.tickMs).unref();
  setInterval(sweep, 2_000).unref();
}
