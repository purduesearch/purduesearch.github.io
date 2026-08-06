// End-to-end guard for the Hocuspocus WebSocket wiring shared by
// /collab/blog, /collab/presskit and /collab/course.
//
// @hocuspocus/server v4 does NOT attach any listeners to the socket you hand
// to `handleConnection()` — it returns a ClientConnection whose `handleMessage`
// / `handleClose` the integrator must call. Miss that and the socket upgrades
// to 101 but the server never reads a frame: the client's Auth message is
// never answered, the 30s ConnectionTimeout fires, and the provider reconnects
// forever. That is invisible to `tsc` and to any HTTP-level probe, so it needs
// a real socket to catch.
//
// Run: cd backend && npx tsx src/collab/collabUpgrade.test.ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { createEncoder, toUint8Array, writeVarString, writeVarUint, writeVarUint8Array } from "lib0/encoding";
import { createDecoder, readVarString, readVarUint } from "lib0/decoding";
import { attachCollab } from "./collabUpgrade.js";

const MESSAGE_TYPE_SYNC = 0;
const MESSAGE_TYPE_AUTH = 2;
// y-protocols/sync: the sub-type carrying a raw document update.
const SYNC_UPDATE = 2;
const AUTH_TOKEN = 0;
const AUTH_PERMISSION_DENIED = 1;
const AUTH_AUTHENTICATED = 2;

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ✓ ${n}`); }
  else { failed++; console.error(`  ✗ ${n}`); }
};

// Mirrors @hocuspocus/provider's AuthenticationMessage wire format:
//   varString(documentName) varUint(Auth) varUint(Token) varString(token) varString(version)
function authMessage(documentName: string, token: string): Uint8Array {
  const encoder = createEncoder();
  writeVarString(encoder, documentName);
  writeVarUint(encoder, MESSAGE_TYPE_AUTH);
  writeVarUint(encoder, AUTH_TOKEN);
  writeVarString(encoder, token);
  writeVarString(encoder, "4.3.0");
  return toUint8Array(encoder);
}

// Reads back an Auth reply, returning the AuthMessageType, or null for any
// other message kind.
function readAuthReply(data: Uint8Array): number | null {
  const decoder = createDecoder(data);
  readVarString(decoder);                        // documentName
  if (readVarUint(decoder) !== MESSAGE_TYPE_AUTH) return null;
  return readVarUint(decoder);
}

/**
 * Boots a throwaway Hocuspocus + http server on an ephemeral port, connects a
 * real ws client, sends one Auth message and resolves with the server's reply.
 * Resolves `"timeout"` if nothing comes back — the exact symptom of the
 * unpumped-socket bug.
 */
async function handshake(token: string): Promise<"authenticated" | "denied" | "timeout"> {
  const hocuspocus = new Hocuspocus({
    // Keep the test off the network and off Prisma: the only thing under test
    // is whether frames reach the server at all.
    async onAuthenticate({ token: received }) {
      if (received !== "valid-token") throw new Error("Not authenticated");
      return { memberId: "test-member" };
    },
    async onLoadDocument({ document }) {
      return document;
    },
    quiet: true,
  });

  const httpServer = createServer();
  attachCollab(httpServer, "/collab/test", hocuspocus);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;

  try {
    return await new Promise<"authenticated" | "denied" | "timeout">((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/collab/test`);
      const done = (result: "authenticated" | "denied" | "timeout") => {
        clearTimeout(timer);
        ws.close();
        resolve(result);
      };
      // Generous vs. a working handshake (single-digit ms), far below the 30s
      // ConnectionTimeout that the broken wiring waits for.
      const timer = setTimeout(() => done("timeout"), 3000);

      ws.binaryType = "arraybuffer";
      ws.on("open", () => ws.send(authMessage("test-doc", token)));
      ws.on("message", (data: ArrayBuffer | Buffer) => {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
        const reply = readAuthReply(bytes);
        if (reply === AUTH_AUTHENTICATED) done("authenticated");
        else if (reply === AUTH_PERMISSION_DENIED) done("denied");
        // Anything else (sync/awareness traffic) — keep waiting for the Auth reply.
      });
      ws.on("error", () => done("timeout"));
    });
  } finally {
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

// Mirrors @hocuspocus/provider's UpdateMessage:
//   varString(documentName) varUint(Sync) varUint(SyncUpdate) varUint8Array(update)
function updateMessage(documentName: string, update: Uint8Array): Uint8Array {
  const encoder = createEncoder();
  writeVarString(encoder, documentName);
  writeVarUint(encoder, MESSAGE_TYPE_SYNC);
  writeVarUint(encoder, SYNC_UPDATE);
  writeVarUint8Array(encoder, update);
  return toUint8Array(encoder);
}

/**
 * Drives a real provider-shaped session against `hocuspocus`: authenticate,
 * push one Yjs update produced by `mutate`, then read the server's own copy of
 * the document back. Returns the server-side text of the "seed" field.
 */
async function connectAndPush(
  hocuspocus: Hocuspocus,
  port: number,
  docName: string,
  mutate: (text: Y.Text) => void,
): Promise<string> {
  const local = new Y.Doc();
  mutate(local.getText("seed"));
  const update = Y.encodeStateAsUpdate(local);

  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/collab/test`);
    const done = () => { clearTimeout(timer); ws.close(); resolve(); };
    const timer = setTimeout(done, 3000);

    ws.binaryType = "arraybuffer";
    ws.on("open", () => ws.send(authMessage(docName, "valid-token")));
    ws.on("message", (data: ArrayBuffer | Buffer) => {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
      if (readAuthReply(bytes) !== AUTH_AUTHENTICATED) return;
      ws.send(updateMessage(docName, update));
      // Give the server a beat to apply the frame before we read its copy.
      setTimeout(done, 300);
    });
    ws.on("error", () => done());
  });

  return hocuspocus.documents.get(docName)?.getText("seed").toString() ?? "";
}

/**
 * A readOnly connection must not be able to change the document. This is the
 * guarantee VIEW/COMMENT access depends on; if Hocuspocus ever stopped
 * honouring connectionConfig.readOnly, every commenter would silently become
 * an editor.
 */
async function readOnlyCannotWrite(): Promise<boolean> {
  const hocuspocus = new Hocuspocus({
    async onAuthenticate({ connectionConfig }) {
      connectionConfig.readOnly = true;
      return { memberId: "viewer" };
    },
    async onLoadDocument({ document }) {
      document.getText("seed").insert(0, "original");
      return document;
    },
    quiet: true,
  });

  const httpServer = createServer();
  attachCollab(httpServer, "/collab/test", hocuspocus);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  const { port } = httpServer.address() as AddressInfo;

  try {
    const text = await connectAndPush(hocuspocus, port, "test-doc", (t) => t.insert(0, "HACKED"));
    // Sanity: the document really was loaded, so an empty string cannot pass
    // this check by accident.
    return text.includes("original") && !text.includes("HACKED");
  } finally {
    httpServer.closeAllConnections();
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
}

console.log("collab WebSocket upgrade wiring");

const good = await handshake("valid-token");
check(
  "a valid token gets an Authenticated reply (server reads client frames)",
  good === "authenticated",
);
if (good === "timeout") {
  console.error("    server never answered — handleConnection's ClientConnection is not being fed");
}

const bad = await handshake("wrong-token");
check(
  "an invalid token gets a PermissionDenied reply (auth actually runs)",
  bad === "denied",
);

check("a readOnly connection cannot modify the document", await readOnlyCannotWrite());

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
