import type { App } from "@slack/bolt";
import { registerRouter } from "./router.js";
import { registerTaskCardActions } from "./handlers/taskCardActions.js";
import { registerTaskModal } from "./handlers/taskModal.js";
import { registerQuickAdd } from "./handlers/quickAdd.js";
import { registerMentions } from "./handlers/mentions.js";

export function registerMirror(app: App): void {
  registerRouter(app);
  registerTaskCardActions(app);
  registerTaskModal(app);
  registerQuickAdd(app);
  registerMentions(app);
}
