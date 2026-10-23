import "dotenv/config";
import http from "node:http";
import { attachBoardPresence } from "./boardPresence.js";
import { startBoardPatches } from "./boardPatch.js";
import { listenForTaskChanges } from "./presenceBus.js";

/** Standalone presence worker (PRESENCE_MODE=standalone). nginx routes /collab/board here, hashed by ?root=. */
const port = Number(process.env.PRESENCE_PORT ?? 3101);
const server = http.createServer((req, res) => {
  if (req.url === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }).end("ok"); return; }
  res.writeHead(404).end();
});
attachBoardPresence(server);
startBoardPatches(listenForTaskChanges);
server.listen(port, () => console.log(`👥 Presence worker on :${port}`));
