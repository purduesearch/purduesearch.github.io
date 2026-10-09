import type { App } from "@slack/bolt";
import { registerRouter } from "./router.js";
import { registerTaskCardActions } from "./handlers/taskCardActions.js";
import { registerTaskModal } from "./handlers/taskModal.js";
import { registerQuickAdd } from "./handlers/quickAdd.js";
import { registerMentions } from "./handlers/mentions.js";
import { registerPlan } from "./handlers/plan.js";
import { registerMentionIntents } from "./handlers/mentionIntents.js";
import { registerShortcuts } from "./handlers/shortcuts.js";
import { registerVault } from "./handlers/vault.js";
import { registerCalendar } from "./handlers/calendar.js";
import { registerVaultCheckin } from "./handlers/vaultCheckin.js";
import { registerPolls } from "./handlers/polls.js";
import { registerUnfurls } from "./handlers/unfurls.js";

export function registerMirror(app: App): void {
  registerRouter(app);
  registerTaskCardActions(app);
  registerTaskModal(app);
  registerQuickAdd(app);
  registerMentions(app);
  registerPlan(app);
  registerMentionIntents(app);
  registerShortcuts(app);
  registerVault(app);
  registerCalendar(app);
  registerVaultCheckin(app);
  registerPolls(app);
  registerUnfurls(app);
}
