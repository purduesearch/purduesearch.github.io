import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { Hocuspocus, type onAuthenticatePayload, type onLoadDocumentPayload, type onStoreDocumentPayload } from "@hocuspocus/server";
import * as Y from "yjs";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { prisma } from "../db/prisma.js";
import { verifyBearerToken } from "../api/auth.js";
import type { PMDoc } from "../services/blogRender.js";
import type { Prisma } from "@prisma/client";
import { blogCollabExtensions } from "./blogSchema.js";

// The path the Hocuspocus WS endpoint is mounted at. The Yjs document name
// (== ProjectPressKit.id) is carried by the Yjs/Hocuspocus wire protocol
// itself (the client's provider `name` option), not the URL path, so any
// request under this prefix is routed to Hocuspocus.
const COLLAB_PATH_PREFIX = "/collab/presskit";

// Field name the client's `Collaboration` TipTap extension binds to; must
// match on both sides for the Yjs<->TipTap-JSON transform to line up.
const YJS_FIELD = "default";

async function canAccessPressKit(memberId: string, pressKitId: string): Promise<boolean> {
  const kit = await prisma.projectPressKit.findUnique({ where: { id: pressKitId }, select: { projectId: true } });
  if (!kit) return false;
  const [membership, me] = await Promise.all([
    prisma.projectMember.findUnique({ where: { projectId_memberId: { projectId: kit.projectId, memberId } }, select: { memberId: true } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
  ]);
  return !!membership || !!me?.isAdmin;
}

const transformer = TiptapTransformer.extensions(blogCollabExtensions());

const hocuspocus = new Hocuspocus({
  async onAuthenticate({ token, documentName }: onAuthenticatePayload) {
    if (!token) throw new Error("Not authenticated");
    const memberId = await verifyBearerToken(token);
    if (!memberId) throw new Error("Not authenticated");
    if (!(await canAccessPressKit(memberId, documentName))) throw new Error("Forbidden");
    return { memberId };
  },

  async onLoadDocument({ documentName, document }: onLoadDocumentPayload) {
    const kit = await prisma.projectPressKit.findUnique({
      where: { id: documentName },
      select: { contentYjs: true, contentJson: true },
    });
    if (!kit) return document;
    if (kit.contentYjs && kit.contentYjs.length > 0) {
      Y.applyUpdate(document, new Uint8Array(kit.contentYjs));
    } else if (kit.contentJson) {
      // First collab session for this kit — seed Yjs state from the
      // existing contentJson so co-editors start from the current draft.
      const seedDoc = transformer.toYdoc(kit.contentJson as unknown as PMDoc, YJS_FIELD);
      Y.applyUpdate(document, Y.encodeStateAsUpdate(seedDoc));
    }
    return document;
  },

  async onStoreDocument({ documentName, document }: onStoreDocumentPayload) {
    const update = Y.encodeStateAsUpdate(document);
    const json = transformer.fromYdoc(document, YJS_FIELD) as unknown as PMDoc;
    await prisma.projectPressKit.update({
      where: { id: documentName },
      data: {
        contentYjs: Buffer.from(update),
        contentJson: json as unknown as Prisma.InputJsonValue,
      },
    });
  },
});

/**
 * Replace the LIVE collaborative document's body for a press kit with a new
 * TipTap doc (after AI (re)generation or a revision restore).
 *
 * Writing `contentJson` to the DB alone is invisible while an editor is
 * connected: the in-memory Yjs doc is authoritative and `onLoadDocument` only
 * runs on first load, so nulling `contentYjs` never re-seeds a doc that's still
 * held open. This pushes the new content straight into the live doc instead.
 * `openDirectConnection` loads the doc if it isn't already in memory, so this
 * works whether or not anyone is currently editing; every connected editor gets
 * the update in real time and `onStoreDocument` persists the new `contentYjs`.
 */
export async function replacePressKitDocContent(kitId: string, doc: PMDoc): Promise<void> {
  const update = Y.encodeStateAsUpdate(transformer.toYdoc(doc, YJS_FIELD));
  const connection = await hocuspocus.openDirectConnection(kitId);
  try {
    await connection.transact((document) => {
      const fragment = document.getXmlFragment(YJS_FIELD);
      if (fragment.length > 0) fragment.delete(0, fragment.length);
      Y.applyUpdate(document, update);
    });
  } finally {
    await connection.disconnect();
  }
}

export function attachPressKitCollab(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = request.url ?? "";
    if (!url.startsWith(COLLAB_PATH_PREFIX)) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      // Hocuspocus only reads `request.url` (see getParameters()) to pull
      // query params — a raw Node IncomingMessage is fine at runtime even
      // though its types expect a WHATWG Request.
      hocuspocus.handleConnection(ws, request as unknown as Request);
    });
  });
}
