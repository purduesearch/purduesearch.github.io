import assert from "node:assert/strict";
import { assertBlockBudget } from "./common.js";
import { buildMyWork, buildProjects, homeTabs } from "./home.js";
import { buildCalendar, buildFiles } from "./homeFilesCalendar.js";
import type { HomeView } from "@slack/types";

let tests = 0;
function test(name: string, run: () => void) { run(); tests++; console.log(`✓ ${name}`); }
const now = new Date("2026-10-09T12:00:00Z");
const frontendUrl = "https://example.com";
const links = Array.from({ length: 250 }, (_, i) => ({ id: `item${i}`, title: `Item ${i}`, url: `https://example.com/items/${i}` }));
const projects = links.map(item => ({ id: item.id, name: item.title, statusCounts: { TODO: 3, BLOCKED: 2 }, nextMilestone: { title: "CDR", dueDate: "2026-10-15" } }));
function check(view: HomeView, active: string) {
  assert.equal(view.type, "home");
  assertBlockBudget(view.blocks, 100);
  assert.equal(view.blocks[0].type, "actions");
  assert.equal(view.blocks[1].type, "context");
  const row = view.blocks[0];
  assert.equal(row.type, "actions");
  if (row.type !== "actions") throw new Error("Missing tabs");
  assert.equal(row.elements.length, 4);
  assert.equal(row.elements.filter(e => e.type === "button" && e.style === "primary").length, 1);
  const selected = row.elements.find(e => e.type === "button" && e.style === "primary");
  assert.ok(selected?.type === "button");
  assert.equal(selected.value, active);
}
test("all four tab buttons identify the active tab", () => {
  for (const active of ["mywork", "projects", "files", "calendar"] as const) {
    const row = homeTabs(active);
    assert.equal(row.elements.length, 4);
    assert.equal(row.elements.filter(e => e.type === "button" && e.style === "primary").length, 1);
    assert.ok(row.elements.every(e => e.type === "button" && e.action_id === `home_tab_${e.value}`));
    assert.equal(new Set(row.elements.map(e => e.type === "button" ? e.action_id : "")).size, 4, "Slack rejects duplicate action_ids within one block");
  }
});
test("maximum My work data fits budget and preserves overflow", () => {
  const tasks = ["2026-10-01", "2026-10-10", "2026-11-01"].flatMap(dueDate => links.map(l => ({ ...l, status: "TODO", dueDate })));
  const view = buildMyWork({ frontendUrl, now, tasks, reviews: links, polls: links, checkedIn: true });
  check(view, "mywork");
  assert.match(JSON.stringify(view), /Lab check-out/);
  assert.match(JSON.stringify(view), /\+230 more/);
});
test("maximum Projects data fits budget", () => {
  const view = buildProjects({ frontendUrl, projects });
  check(view, "projects");
  assert.match(JSON.stringify(view), /Next milestone/);
  assert.match(JSON.stringify(view), /home_report/);
  assert.match(JSON.stringify(view), /\+220 more/);
});
test("maximum Files data fits budget and includes a late selected project", () => {
  const view = buildFiles({ frontendUrl, projects, projectId: "item249", drive: { folderUrl: "https://drive.example.com", files: links }, github: { repositories: links, pullRequests: links, issues: links, recentLinks: links }, vault: { checkouts: links, reviews: links, latestRelease: links[0] } });
  check(view, "files");
  const row = view.blocks[2];
  assert.ok(row.type === "actions");
  const select = row.elements[0];
  assert.ok(select.type === "static_select");
  assert.equal(select.options?.length, 100);
  assert.equal(select.initial_option?.value, "item249");
  assert.ok(select.options?.some(o => o.value === "item249"));
});
test("maximum Calendar data fits budget and encodes RSVP state", () => {
  const events = links.map(l => ({ ...l, startsAt: "2026-10-10", going: true }));
  const view = buildCalendar({ frontendUrl, now, events, polls: links });
  check(view, "calendar");
  assert.match(JSON.stringify(view), /Going ✓ · Cancel/);
  const row = view.blocks[3];
  assert.ok(row.type === "section" && row.accessory?.type === "button");
  assert.deepEqual(JSON.parse(row.accessory.value!), { e: "item0", g: false });
  assert.match(JSON.stringify(view), /poll_open/);
});
test("all empty tabs render useful states", () => {
  const views = [buildMyWork({ frontendUrl, now, tasks: [], reviews: [], polls: [] }), buildProjects({ frontendUrl, projects: [] }), buildFiles({ frontendUrl, projects: [] }), buildCalendar({ frontendUrl, now, events: [], polls: [] })];
  views.forEach((v, i) => check(v, ["mywork", "projects", "files", "calendar"][i]));
  assert.match(JSON.stringify(views[0]), /No CR reviews or unanswered polls/);
  assert.match(JSON.stringify(views[1]), /No projects yet/);
  assert.match(JSON.stringify(views[2]), /No Drive folder linked — link one in project settings/);
  assert.match(JSON.stringify(views[2]), /No GitHub repository linked/);
  assert.match(JSON.stringify(views[2]), /No Vault linked/);
  assert.match(JSON.stringify(views[3]), /No events in the next 14 days/);
  assert.match(JSON.stringify(views[3]), /No open meeting polls/);
});
test("My work groups tasks once and omits finished tasks and answered polls", () => {
  const view = buildMyWork({ frontendUrl, now, tasks: [{ ...links[0], title: "Overdue only", status: "TODO", dueDate: "2026-10-01" }, { ...links[1], title: "This week only", status: "IN_PROGRESS", dueDate: "2026-10-11" }, { ...links[2], title: "No date only", status: "TODO" }, { ...links[3], title: "Finished hidden", status: "DONE" }], reviews: [], polls: [{ ...links[4], title: "Answered hidden", answered: true }] });
  check(view, "mywork");
  const text = JSON.stringify(view);
  for (const title of ["Overdue only", "This week only", "No date only"]) assert.equal(text.split(title).length - 1, 1);
  assert.doesNotMatch(text, /Finished hidden|Answered hidden/);
  assert.match(text, /Lab check-in/);
});
test("Calendar includes only the next fourteen days and sorts events", () => {
  const view = buildCalendar({ frontendUrl, now, events: [{ ...links[0], title: "Past hidden", startsAt: "2026-10-08", going: false }, { ...links[1], title: "Later visible", startsAt: "2026-10-20", going: false }, { ...links[2], title: "Soon visible", startsAt: "2026-10-10", going: false }, { ...links[3], title: "Beyond hidden", startsAt: "2026-10-24", going: false }], polls: [] });
  check(view, "calendar");
  const text = JSON.stringify(view);
  assert.doesNotMatch(text, /Past hidden|Beyond hidden/);
  assert.ok(text.indexOf("Soon visible") < text.indexOf("Later visible"));
  assert.match(text, /"text":"RSVP"/);
});
test("long file titles respect Slack option limits and text escaping", () => {
  const view = buildFiles({ frontendUrl, projects: [{ id: "p", name: "x".repeat(5000) }], drive: { folderUrl: "https://drive.example.com", files: [{ id: "f", title: "<unsafe>&|" + "x".repeat(5000), url: "https://example.com/a|b" }] } });
  check(view, "files");
  const row = view.blocks[2];
  assert.ok(row.type === "actions" && row.elements[0].type === "static_select");
  assert.ok(row.elements[0].options![0].text.text.length <= 75);
  assert.match(JSON.stringify(view), /&lt;unsafe&gt;&amp;&#124;/);
  assert.match(JSON.stringify(view), /a%7Cb/);
});
console.log(`${tests} Home builder tests passed`);
