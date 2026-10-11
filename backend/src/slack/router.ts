import type { App, SlashCommand } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { runLegacyPm, type RespondFn } from "./commands.js";
import { buildHelpCard } from "../utils/blockKit.js";
import { handleTaskCommand, handleFindCommand } from "./handlers/quickAdd.js";
import { handlePlanCommand } from "./handlers/plan.js";
import { handleAskCommand } from "./handlers/mentionIntents.js";
import { handleVaultCommand } from "./handlers/vault.js";
import { handleEventsCommand } from "./handlers/calendar.js";

export type CmdCtx = {
  args: string[];
  text: string;
  command: SlashCommand;
  respond: RespondFn;
  client: WebClient;
  ack?: never;
};
export type CmdHandler = (ctx: CmdCtx) => Promise<void>;
export const SUBCOMMANDS: Record<string, CmdHandler> = {};
// `task done` keeps opening the done picker; any other text is a quick-add sentence.
SUBCOMMANDS.task = ctx => ctx.args.length === 2 && ctx.args[1].toLowerCase() === "done"
  ? runLegacyPm(ctx.args, ctx.command, ctx.respond, ctx.client)
  : handleTaskCommand(ctx);
SUBCOMMANDS.find = handleFindCommand;
SUBCOMMANDS.plan = handlePlanCommand;
SUBCOMMANDS.ask = handleAskCommand;
SUBCOMMANDS.vault = handleVaultCommand;
SUBCOMMANDS.events = handleEventsCommand;

async function sendHelp(ctx: CmdCtx): Promise<void> {
  await ctx.respond({ response_type: "ephemeral", text: "Constellation command reference", blocks: buildHelpCard() });
}

export function registerRouter(app: App): void {
  // /pm is the compatibility alias, so it gets the same subcommands as /c.
  for (const alias of ["/c", "/constellation", "/pm"]) {
    app.command(alias, async ({ command, ack, respond, client }) => {
      await ack();
      const text = command.text.trim();
      const args = text.split(/\s+/).filter(Boolean);
      const sub = args[0]?.toLowerCase() ?? "";
      const ctx: CmdCtx = { args, text, command, respond, client };
      try {
        const handler = Object.prototype.hasOwnProperty.call(SUBCOMMANDS, sub) ? SUBCOMMANDS[sub] : undefined;
        if (handler) await handler(ctx);
        else if (sub === "help" || !sub) await sendHelp(ctx);
        else await runLegacyPm(args, command, respond, client);
      } catch (error) {
        console.error(`${alias} error:`, error);
        await respond({ response_type: "ephemeral", text: `Error: ${error instanceof Error ? error.message : "An unexpected error occurred"}` });
      }
    });
  }
}
