import type { App } from "@slack/bolt";
import { registerRouter } from "./router.js";
import { registerTaskCardActions } from "./handlers/taskCardActions.js";
import { registerTaskModal } from "./handlers/taskModal.js";

export function registerMirror(app: App): void {
  registerRouter(app);
  registerTaskCardActions(app);
  registerTaskModal(app);
}
