// Project assistant: richer context prompt + skill block. No DB, no network.
// Run: cd backend && npx tsx src/services/projectAssistantSkills.test.ts

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectContext } from "./projectContextService.js";
import { projectContextPrompt } from "../utils/aiPrompts.js";
import { renderMemberSkills, renderProjectContext } from "../utils/projectContextRender.js";
import { renderSkillMatches } from "./skillQueryCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

const ctx: ProjectContext = {
  project: { id: "p1", name: "Rover", description: "Lunar rover", type: "ENGINEERING", targetDate: "2026-12-01" },
  velocity: { windowDays: 28, tasksCompleted: 8, pointsCompleted: 21, tasksPerWeek: 2, pointsPerWeek: 5.3 },
  unassignedOpen: { tasks: 1, highPriority: 1, storyPoints: 3, estimatedHours: 4 },
  tasks: [
    { id: "t1", title: "Enclosure thermal analysis", description: "Check the electronics bay at 60C", status: "TODO", priority: "HIGH", assignees: [], dueDate: "2026-10-01", milestoneTitle: null,
      blockedByOpenDependencies: false, blockedByTitles: [], activeCategoryBlockers: [], subtaskCounts: { total: 0, done: 0 }, storyPoints: 3, estimatedHours: 4, loggedHours: 0, parentTitle: null, daysSinceUpdate: 3 },
  ],
  milestones: [], activeBlockers: [], recentActivity: [], truncated: false,
  members: [
    { id: "m1", displayName: "Alice", projectRole: "Contributor", isLead: false, openTaskCount: 2, openHighPriorityCount: 1, openOverdueCount: 0, openStoryPoints: 5, openEstimatedHours: 6, openUnestimatedCount: 0, completedLast14d: 3, loggedHoursLast14d: 9,
      topSkills: [{ name: "Thermal Analysis", level: 4, confidence: "HIGH", provenance: "AI_INFERRED", lastDemonstrated: "2026-09-10" }, { name: "CAD", level: 3, confidence: "MEDIUM", provenance: "MANAGER_VERIFIED", lastDemonstrated: null }] },
    { id: "m2", displayName: "Bob", projectRole: "Contributor", isLead: false, openTaskCount: 0, openHighPriorityCount: 0, openOverdueCount: 0, openStoryPoints: 0, openEstimatedHours: 0, openUnestimatedCount: 0, completedLast14d: 0, loggedHoursLast14d: 0 },
  ],
};
const TODAY = "2026-10-12";

// ── member skill rendering ──
check("skills line keeps level and confidence separate", renderMemberSkills(ctx.members[0].topSkills!).includes("Thermal Analysis L4 (high conf, last 2026-09)"));
check("provenance labelled", renderMemberSkills(ctx.members[0].topSkills!).includes("lead-verified"));
check("skills off by default (other prompts unchanged)", !renderProjectContext(ctx, TODAY).includes("skills (advisory)"));
check("skills on when asked", renderProjectContext(ctx, TODAY, { skills: true }).includes("Alice (Contributor): 2 open") && renderProjectContext(ctx, TODAY, { skills: true }).includes("skills (advisory): Thermal Analysis L4"));
check("member without skills has no skills clause", !renderProjectContext(ctx, TODAY, { skills: true }).split("\n").find((l) => l.includes("Bob"))!.includes("skills"));

// ── prompt ──
{
  const p = projectContextPrompt("who could take over thermal analysis on the enclosure?", TODAY, ctx);
  check("prompt includes estimates and per-member load", p.includes("3pts") && p.includes("est 4h") && p.includes("2 open"));
  check("prompt includes exact computed signals", p.includes("Computed signals (exact") && p.includes("Overdue open tasks (1)") && p.includes("11d late"));
  check("prompt includes velocity", p.includes("Velocity, last 28 days"));
  check("prompt includes advisory member skills", p.includes("skills (advisory)"));
  check("prompt tells the model skills are advisory and not a ranking", /advisory estimates/.test(p) && /never rank people overall/.test(p));
  check("question quotes cannot break out of the prompt", !projectContextPrompt('say "hi" now', TODAY, ctx).includes('"say "hi" now"'));
  check("untruthy fallback instruction kept", p.includes("If the answer isn't in the data, say so"));
}
{
  const withBlock = projectContextPrompt("who knows CAD?", TODAY, ctx, "Skill search results (advisory): - Alice ...");
  check("skill block appended when given", withBlock.includes("Skill search results"));
  check("no block -> no skill search text", !projectContextPrompt("what is late?", TODAY, ctx).includes("Skill search results"));
  const noSkills = projectContextPrompt("what is late?", TODAY, ctx, undefined, false);
  check("member skills can be excluded (Slack path)", !noSkills.includes("skills (advisory)") && !noSkills.includes("Thermal Analysis L4"));
}

// ── skill block ──
{
  const block = renderSkillMatches([
    { displayName: "Alice", onProject: true, skills: [{ name: "Thermal Analysis", provenance: "AI_INFERRED", level: 4, confidenceBand: "HIGH", lastDemonstrated: "2026-09-10T00:00:00Z", trend: "STABLE" }], evidence: [{ date: "2026-09-10", source: "task", project: "Rover", summary: "Ran the enclosure thermal sim.", contribution: "AUTHORED", complexity: 4 }] },
    { displayName: "Cara", onProject: false, skills: [], evidence: [] },
  ], { skills: ["Thermal Analysis"], minLevel: 3, activeWithinDays: 180 });
  check("block states filters", block.includes("skills: Thermal Analysis") && block.includes("level >= 3") && block.includes("last 180 days"));
  check("block marks who is on the project", block.includes("Alice (on this project)") && block.includes("Cara (not on this project)"));
  check("block keeps level, confidence, provenance apart", block.includes("L4 [ai inferred, high confidence, last 2026-09, stable]"));
  check("block describes evidence in words, without ids", block.includes("Ran the enclosure thermal sim.") && !/\be\d+\b/.test(block.replace("2026", "")));
  check("empty result says so plainly", renderSkillMatches([], { skills: [], minLevel: null, activeWithinDays: null }).includes("no one has recorded evidence"));
  check("semantic-only filters described", renderSkillMatches([{ displayName: "A", onProject: true, skills: [], evidence: [] }], { skills: [], minLevel: null, activeWithinDays: null }).includes("meaning-based match"));
}

// ── wiring (source scans) ──
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ask = readFileSync(join(root, "services/projectAskService.ts"), "utf8");
const routes = readFileSync(join(root, "api/projects.ts"), "utf8");
const search = readFileSync(join(root, "services/skillSearchService.ts"), "utf8");
check("web route uses the detailed ask and adds skillMatches only when present", /askProjectDetailed\(projectId, question, req\.memberId/.test(routes) && /result\.skillMatches \? \{ skillMatches/.test(routes));
check("legacy askProject (Slack) switches skills off", /skills: false/.test(ask));
check("skill retrieval can only run for an authenticated member who passed the project access check", /useSkills && memberId && isSkillIntent/.test(ask) && ask.indexOf("return null;") < ask.indexOf("askSkills("));
check("retrieval failure never breaks the answer", /catch \(err\)[\s\S]*skill retrieval skipped/.test(ask));
check("non-admin retrieval is limited to the project", /FORBIDDEN/.test(search) && /scope\.projectOnly \? \{ projectId: input\.projectId \}/.test(search));
check("non-admin evidence is limited to the project", /memberIds: scope\.memberIds|projectOnly/.test(search) && (search.match(/scope\.projectOnly \? \{ projectId: input\.projectId \}/g) ?? []).length >= 2);

console.log(`projectAssistantSkills: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
