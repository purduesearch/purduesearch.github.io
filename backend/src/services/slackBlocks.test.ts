// Run: cd backend && npx tsx src/services/slackBlocks.test.ts
import { renderBotPayload } from "./slackBlocks.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const ctx = { memberNames: { U1: "Ann" }, channelNames: {}, emojiUrls: {} };
const r = (blocks: unknown[], attachments: unknown[] = []) => renderBotPayload({ blocks, attachments }, ctx) as any[];

check("null payload → []", renderBotPayload(null, ctx).length === 0);
check("header", r([{ type: "header", text: { type: "plain_text", text: "Standup" } }])[0].text === "Standup");
{
  const [s] = r([{ type: "section", text: { type: "mrkdwn", text: "*hi* <@U1>" } }]);
  check("section mrkdwn parses bold", s.tokens[0].type === "bold");
  check("section mrkdwn resolves mention", s.tokens.some((t: any) => t.type === "mention" && t.label === "Ann"));
}
{
  const [s] = r([{ type: "section", fields: [{ type: "mrkdwn", text: "*Due*" }, { type: "plain_text", text: "Fri" }] }]);
  check("section fields", s.fields.length === 2 && s.fields[1][0].value === "Fri");
}
check("divider", r([{ type: "divider" }])[0].type === "divider");
{
  const [c] = r([{ type: "context", elements: [{ type: "image", image_url: "x" }, { type: "mrkdwn", text: "via bot" }] }]);
  check("context skips images, keeps text", c.type === "context" && c.tokens.length > 0);
}
{
  const [a] = r([{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Approve" } }, { type: "static_select", placeholder: { type: "plain_text", text: "Pick" } }] }]);
  check("actions become inert labels", a.type === "actions" && a.labels.join("|") === "Approve|Pick");
}
{
  const out = r([{ type: "section", text: { type: "mrkdwn", text: "x" }, accessory: { type: "button", text: { type: "plain_text", text: "Open" } } }]);
  check("section accessory button becomes a label row", out[1]?.type === "actions" && out[1].labels[0] === "Open");
}
check("image keeps only alt text", r([{ type: "image", image_url: "https://t", alt_text: "chart" }])[0].alt === "chart");
{
  const [s] = r([{ type: "rich_text", elements: [{ type: "rich_text_section", elements: [
    { type: "text", text: "bold", style: { bold: true } },
    { type: "link", url: "https://ok.example", text: "ok" },
    { type: "link", url: "javascript:alert(1)", text: "evil" },
    { type: "user", user_id: "U1" },
  ] }] }]);
  check("rich_text bold", s.tokens[0].type === "bold");
  check("rich_text safe link kept", s.tokens.some((t: any) => t.type === "link" && t.href === "https://ok.example"));
  check("rich_text javascript: link neutralized", !s.tokens.some((t: any) => t.type === "link" && String(t.href).startsWith("javascript")));
  check("rich_text user mention", s.tokens.some((t: any) => t.type === "mention" && t.label === "Ann"));
}
check("unknown block skipped", r([{ type: "video" }]).length === 0);
{
  const out = r([], [{ pretext: "Heads up", title: "Build failed", text: "main is red", fields: [{ title: "Repo", value: "site" }] }]);
  check("legacy attachment → section + header + section", out.length === 3 && out[1].type === "header");
  check("legacy attachment fields", out[2].fields.length === 1);
}

console.log(`\nslackBlocks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
