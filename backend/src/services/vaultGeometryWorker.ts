// Worker-thread entry for one geometry diff. Spawned by vaultGeometryService
// with resourceLimits and a wall-clock timeout, so a hostile or enormous model
// can exhaust only this thread, never the API process.

import { parentPort, workerData } from "node:worker_threads";
import { runGeometryDiffFiles, type GeometryRunInput } from "./vaultGeometryRun.js";

runGeometryDiffFiles(workerData as GeometryRunInput)
  .then((outcome) => parentPort?.postMessage({ ok: true, outcome }))
  .catch((err: unknown) => parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) }));
