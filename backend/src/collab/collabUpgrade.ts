import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, type RawData } from "ws";
import type { Hocuspocus } from "@hocuspocus/server";

/**
 * Normalizes what `ws` hands to a "message" listener into a Uint8Array whose
 * bounds Hocuspocus can decode. A Node Buffer is a view into a shared pool, so
 * its byteOffset/byteLength must be carried over — `new Uint8Array(buf.buffer)`
 * would hand the decoder the whole pool and garbage after the frame.
 */
function toUint8Array(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data)) {
    // Fragmented message: ws delivers the pieces as Buffer[].
    const joined = Buffer.concat(data);
    return new Uint8Array(joined.buffer, joined.byteOffset, joined.byteLength);
  }
  return new Uint8Array(data as ArrayBuffer);
}

/**
 * Routes WebSocket upgrades under `pathPrefix` into a Hocuspocus instance.
 *
 * Shared by /collab/blog, /collab/presskit and /collab/course so this wiring
 * exists in exactly one place — collabUpgrade.test.ts covers it end to end.
 *
 * IMPORTANT: `@hocuspocus/server` v4 attaches NO listeners to the socket you
 * pass it. It only ever writes to the socket, and returns a ClientConnection
 * whose `handleMessage` / `handleClose` the integration must call — the same
 * contract Hocuspocus' own `Server` fulfils via its crossws open/message/close
 * hooks. Drop the returned object (as pre-v4 embedding code could) and the
 * socket still upgrades to 101, but no frame is ever read: the client's Auth
 * message goes unanswered until the 30s ConnectionTimeout closes the socket,
 * and the provider reconnects forever.
 */
export function attachCollab(
  httpServer: HttpServer,
  pathPrefix: string,
  hocuspocus: Hocuspocus,
): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = request.url ?? "";
    if (!url.startsWith(pathPrefix)) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      // Hocuspocus only reads `request.url` (see getParameters()) to pull
      // query params — a raw Node IncomingMessage is fine at runtime even
      // though its types expect a WHATWG Request.
      const connection = hocuspocus.handleConnection(ws, request as unknown as Request);

      ws.on("message", (data: RawData) => connection.handleMessage(toUint8Array(data)));

      ws.on("close", (code: number, reason: Buffer) => {
        connection.handleClose({ code, reason: reason.toString() });
      });

      // A `ws` socket is an EventEmitter: an unhandled "error" event would be
      // rethrown and take the whole backend process down.
      ws.on("error", (err: Error) => {
        console.error(`[collab] socket error on ${pathPrefix}:`, err.message);
        connection.handleClose({ code: 1011, reason: "Socket error" });
      });
    });
  });
}
