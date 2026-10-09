import type { App } from "@slack/bolt";
import { registerRouter } from "./router.js";

export function registerMirror(app: App): void {
  registerRouter(app);
}
