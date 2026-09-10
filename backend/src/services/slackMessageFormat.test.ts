// Pure-logic unit tests for slackMessageFormat. No DB, no Slack.
// Run: cd backend && npx tsx src/services/slackMessageFormat.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).

import { formatSlackText, type SlackToken } from "./slackMessageFormat.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const ctx = {
  memberNames: { U123: "Henry Ewald" },
  channelNames: { C999: "proj-ares" },
  emojiUrls: { rocket_club: "https://emoji.example/rocket.png" },
};

console.log("formatSlackText");
{
  const t = formatSlackText("hello world", ctx);
  check("plain text is one token", t.length === 1 && t[0].type === "text");
  check("plain text value", (t[0] as any).value === "hello world");
}
{
  const t = formatSlackText("hey <@U123> look", ctx);
  check("mention splits into 3", t.length === 3);
  check("mention resolves to display name",
    t[1].type === "mention" && (t[1] as any).label === "Henry Ewald");
}
{
  const t = formatSlackText("hey <@U404> look", ctx);
  check("unknown mention falls back to the id",
    t[1].type === "mention" && (t[1] as any).label === "U404");
}
{
  const t = formatSlackText("see <https://x.dev|the docs>", ctx);
  check("link href", t[1].type === "link" && (t[1] as any).href === "https://x.dev");
  check("link label", (t[1] as any).label === "the docs");
}
{
  const t = formatSlackText("bare <https://x.dev>", ctx);
  check("bare link labels with the url", t[1].type === "link" && (t[1] as any).label === "https://x.dev");
}
{
  const t = formatSlackText("in <#C999|proj-ares> please", ctx);
  check("channel ref", t[1].type === "channel" && (t[1] as any).label === "proj-ares");
}
{
  const t = formatSlackText("run `npm test` now", ctx);
  check("inline code", t[1].type === "code" && (t[1] as any).value === "npm test");
}
{
  const t = formatSlackText("a ```const x = 1;``` b", ctx);
  check("code block", t[1].type === "codeblock" && (t[1] as any).value === "const x = 1;");
}
{
  // An unmatched backtick must not swallow the rest of the message.
  const t = formatSlackText("a `b `c` d", ctx);
  const joined = t.map(x => x.type).join(",");
  check("unmatched backtick degrades to text", joined.includes("code") && t.length >= 3);
  const last = t[t.length - 1];
  check("text after an unmatched backtick survives",
    last.type === "text" && String((last as any).value).includes("d"));
}
{
  // Angle parsing must happen BEFORE entity unescaping, or &lt; becomes a
  // fake tag and the message is mangled.
  const t = formatSlackText("5 &lt; 10 &amp;&amp; ok", ctx);
  check("entities unescape after angle parsing",
    t.length === 1 && (t[0] as any).value === "5 < 10 && ok");
}
{
  const t = formatSlackText(":rocket_club:", ctx);
  check("emoji-only message is one token", t.length === 1 && t[0].type === "emoji");
  check("custom emoji resolves a url",
    (t[0] as any).url === "https://emoji.example/rocket.png");
}
{
  const t = formatSlackText(":unknown_emoji:", ctx);
  check("unknown emoji has no url", t[0].type === "emoji" && (t[0] as any).url === undefined);
}
{
  const t = formatSlackText("a < b > c", ctx);
  check("malformed angles stay text", t.every((x: SlackToken) => x.type === "text"));
}
{
  check("empty string yields no tokens", formatSlackText("", ctx).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
