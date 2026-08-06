import type { Server as HttpServer } from "node:http";
import { Hocuspocus, type onAuthenticatePayload, type onLoadDocumentPayload, type onStoreDocumentPayload } from "@hocuspocus/server";
import * as Y from "yjs";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { prisma } from "../db/prisma.js";
import { verifyBearerToken } from "../api/auth.js";
import { computeReadingTime, type PMDoc } from "../services/blogRender.js";
import type { Prisma } from "@prisma/client";
import { blogCollabExtensions } from "./blogSchema.js";
import { attachCollab } from "./collabUpgrade.js";

// The path the Hocuspocus WS endpoint is mounted at. The Yjs document name
// (== BlogPost.id) is carried by the Yjs/Hocuspocus wire protocol itself
// (the client's provider `name` option), not the URL path, so any request
// under this prefix is routed to Hocuspocus.
const COLLAB_PATH_PREFIX = "/collab/blog";

// Field name the client's `Collaboration` TipTap extension binds to; must
// match on both sides for the Yjs<->TipTap-JSON transform to line up.
const YJS_FIELD = "default";

async function isAdmin(memberId: string): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  return !!m?.isAdmin;
}

async function canAccessPost(memberId: string, postId: string): Promise<boolean> {
  const post = await prisma.blogPost.findUnique({ where: { id: postId }, select: { createdById: true } });
  if (!post) return false;
  if (post.createdById === memberId) return true;
  if (await isAdmin(memberId)) return true;
  const author = await prisma.blogAuthor.findUnique({
    where: { postId_memberId: { postId, memberId } },
    select: { id: true },
  });
  return !!author;
}

const transformer = TiptapTransformer.extensions(blogCollabExtensions());

const hocuspocus = new Hocuspocus({
  async onAuthenticate({ token, documentName }: onAuthenticatePayload) {
    if (!token) throw new Error("Not authenticated");
    const memberId = await verifyBearerToken(token);
    if (!memberId) throw new Error("Not authenticated");
    if (!(await canAccessPost(memberId, documentName))) throw new Error("Forbidden");
    return { memberId };
  },

  async onLoadDocument({ documentName, document }: onLoadDocumentPayload) {
    const post = await prisma.blogPost.findUnique({
      where: { id: documentName },
      select: { contentYjs: true, contentJson: true },
    });
    if (!post) return document;
    if (post.contentYjs && post.contentYjs.length > 0) {
      Y.applyUpdate(document, new Uint8Array(post.contentYjs));
    } else if (post.contentJson) {
      // First collab session for this post — seed Yjs state from the
      // existing contentJson so co-editors start from the current draft.
      const seedDoc = transformer.toYdoc(post.contentJson as unknown as PMDoc, YJS_FIELD);
      Y.applyUpdate(document, Y.encodeStateAsUpdate(seedDoc));
    }
    return document;
  },

  async onStoreDocument({ documentName, document }: onStoreDocumentPayload) {
    const update = Y.encodeStateAsUpdate(document);
    const json = transformer.fromYdoc(document, YJS_FIELD) as unknown as PMDoc;
    await prisma.blogPost.update({
      where: { id: documentName },
      data: {
        contentYjs: Buffer.from(update),
        contentJson: json as unknown as Prisma.InputJsonValue,
        readingTimeMin: computeReadingTime(json),
      },
    });
  },
});

export function attachBlogCollab(httpServer: HttpServer): void {
  attachCollab(httpServer, COLLAB_PATH_PREFIX, hocuspocus);
}
