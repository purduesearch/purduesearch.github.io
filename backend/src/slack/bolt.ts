import { App, LogLevel } from "@slack/bolt";
import { registerCommands } from "./commands.js";
import { registerActions } from "./actions.js";
import { registerEvents } from "./events.js";
import { registerModals } from "./modals.js";

// ── Bolt App Init ────────────────────────────────────────────

export const boltApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Socket Mode for local development (no public URL needed)
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel:
    process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO,
});

// Register all handlers
registerCommands(boltApp);
registerActions(boltApp);
registerEvents(boltApp);
registerModals(boltApp);

// ── Start Bolt ───────────────────────────────────────────────

export async function startBolt(): Promise<void> {
  await boltApp.start();
}
