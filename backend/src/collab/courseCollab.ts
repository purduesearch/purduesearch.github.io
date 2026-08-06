import type { Server as HttpServer } from "node:http";
import { Hocuspocus, type onAuthenticatePayload, type onLoadDocumentPayload, type onStoreDocumentPayload } from "@hocuspocus/server";
import * as Y from "yjs";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { prisma } from "../db/prisma.js";
import type { PMDoc } from "../services/blogRender.js";
import type { Prisma } from "@prisma/client";
import { blogCollabExtensions } from "./blogSchema.js";
import { attachCollab } from "./collabUpgrade.js";
import { authenticateCollab } from "./collabAuth.js";

// The path the Hocuspocus WS endpoint is mounted at. The Yjs document name
// (== CourseSection.id) is carried by the Yjs/Hocuspocus wire protocol itself
// (the client's provider `name` option), not the URL path, so any request
// under this prefix is routed to Hocuspocus.
const COLLAB_PATH_PREFIX = "/collab/course";

// Field name the client's `Collaboration` TipTap extension binds to; must
// match on both sides for the Yjs<->TipTap-JSON transform to line up.
const YJS_FIELD = "default";

const transformer = TiptapTransformer.extensions(blogCollabExtensions());

const hocuspocus = new Hocuspocus({
  async onAuthenticate({ token, documentName, connectionConfig }: onAuthenticatePayload) {
    return authenticateCollab(token, { courseSectionId: documentName }, connectionConfig);
  },

  async onLoadDocument({ documentName, document }: onLoadDocumentPayload) {
    const section = await prisma.courseSection.findUnique({
      where: { id: documentName },
      select: { contentYjs: true, contentJson: true },
    });
    if (!section) return document;
    if (section.contentYjs && section.contentYjs.length > 0) {
      Y.applyUpdate(document, new Uint8Array(section.contentYjs));
    } else if (section.contentJson) {
      // First collab session for this section — seed Yjs state from the
      // existing contentJson so co-editors start from the current draft.
      const seedDoc = transformer.toYdoc(section.contentJson as unknown as PMDoc, YJS_FIELD);
      Y.applyUpdate(document, Y.encodeStateAsUpdate(seedDoc));
    }
    return document;
  },

  async onStoreDocument({ documentName, document }: onStoreDocumentPayload) {
    const update = Y.encodeStateAsUpdate(document);
    const json = transformer.fromYdoc(document, YJS_FIELD) as unknown as PMDoc;
    await prisma.courseSection.update({
      where: { id: documentName },
      data: {
        contentYjs: Buffer.from(update),
        contentJson: json as unknown as Prisma.InputJsonValue,
      },
    });
  },
});

/**
 * Replace the LIVE collaborative document's body for a course section with a
 * new TipTap doc (after AI (re)generation or a template apply).
 *
 * Writing `contentJson` to the DB alone is invisible while an editor is
 * connected: the in-memory Yjs doc is authoritative and `onLoadDocument` only
 * runs on first load, so nulling `contentYjs` never re-seeds a doc that's still
 * held open. This pushes the new content straight into the live doc instead.
 * `openDirectConnection` loads the doc if it isn't already in memory, so this
 * works whether or not anyone is currently editing; every connected editor gets
 * the update in real time and `onStoreDocument` persists the new `contentYjs`.
 */
export async function replaceCourseSectionContent(sectionId: string, doc: PMDoc): Promise<void> {
  const update = Y.encodeStateAsUpdate(transformer.toYdoc(doc, YJS_FIELD));
  const connection = await hocuspocus.openDirectConnection(sectionId);
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

export function attachCourseCollab(httpServer: HttpServer): void {
  attachCollab(httpServer, COLLAB_PATH_PREFIX, hocuspocus);
}
