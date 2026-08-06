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
import { createEncoder, toUint8Array, writeVarString, writeVarUint } from "lib0/encoding";
import { createDecoder, readVarString, readVarUint } from "lib0/decoding";
import { attachCollab } from "./collabUpgrade.js";

const MESSAGE_TYPE_AUTH = 2;
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
