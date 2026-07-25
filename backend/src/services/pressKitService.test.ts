// Pure-logic tests for pressKitService. No DB required.
// Run: cd backend && npx tsx src/services/pressKitService.test.ts
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).

import {
  DEFAULT_PRESS_KIT_CONFIG, normalizePressKitConfig, buildPressKitMarkdown,
} from "./pressKitService.js";
import type { PressKitContext } from "./pressKitService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

// normalizePressKitConfig: fills defaults, clamps unknown audience + sections
{
  const c = normalizePressKitConfig({ audience: "NOPE", includedSections: ["about", "bogus"] });
  check("audience falls back to GENERAL", c.audience === "GENERAL");
  check("drops unknown sections", !c.includedSections.includes("bogus"));
  check("keeps known section", c.includedSections.includes("about"));
  check("accentColor default", c.accentColor === DEFAULT_PRESS_KIT_CONFIG.accentColor);
  check("showContact boolean", typeof c.showContact === "boolean");
}

// buildPressKitMarkdown: includes only configured sections, renders stats table
{
  const ctx: PressKitContext = {
    project: { name: "AstroUSA", type: "HARDWARE", status: "ACTIVE", description: "High-altitude platform",
      startDate: new Date("2026-01-01"), targetDate: new Date("2026-09-01"), programTag: "astrousa",
      githubRepo: "purduesearch/astrousa", driveLink: null },
    stats: { teamSize: 12, tasksDone: 30, tasksTotal: 47, milestonesHit: 6, hoursLogged: 210, durationDays: 200, commentCount: 0 },
    milestones: [{ title: "First flight", description: null, completedAt: new Date("2026-05-01") }],
    contributors: [],
    timeline: [{ title: "First flight", date: new Date("2026-05-01"), kind: "milestone" }],
    team: [{ displayName: "Ana Lee", title: "Lead", role: null, avatarUrl: null, isLead: true }],
    tags: ["Avionics", "Structures"],
    links: [{ label: "GitHub", url: "https://github.com/purduesearch/astrousa" }],
  };
  const prose = { about: "About body.", aboutSearch: "About SEARCH body.", building: "Building body.", sponsorship: "Sponsor body." };

  const md = buildPressKitMarkdown(ctx, normalizePressKitConfig({
    audience: "SPONSORS",
    includedSections: ["masthead", "about", "stats", "team", "sponsorship"],
    contactEmail: "leads@example.com",
  }), prose);

  check("has masthead title", md.includes("# AstroUSA"));
  check("has About heading", md.includes("## About This Project") && md.includes("About body."));
  check("has stats numbers", md.includes("12") && md.includes("210"));
  check("has team member", md.includes("Ana Lee"));
  check("sponsorship shown for SPONSORS", md.includes("Sponsor body."));
  check("excludes timeline (not selected)", !md.includes("## Timeline"));

  // (a) sponsorship section hidden when audience !== "SPONSORS", even if
  // "sponsorship" is included and prose.sponsorship is non-empty.
  const mdPress = buildPressKitMarkdown(ctx, normalizePressKitConfig({
    audience: "PRESS",
    includedSections: ["masthead", "sponsorship"],
  }), prose);
  check("sponsorship hidden for non-SPONSORS audience", !mdPress.includes("## Support This Project"));

  // (b) contact section is gated on both "contact" being included AND a
  // non-empty contactEmail.
  const mdContactShown = buildPressKitMarkdown(ctx, normalizePressKitConfig({
    includedSections: ["masthead", "contact"],
    showContact: true,
    contactEmail: "leads@example.com",
  }), prose);
  check("contact shown when email present", mdContactShown.includes("## Contact"));

  const mdContactHidden = buildPressKitMarkdown(ctx, normalizePressKitConfig({
    includedSections: ["masthead", "contact"],
    showContact: true,
    contactEmail: "",
  }), prose);
  check("contact hidden when email empty", !mdContactHidden.includes("## Contact"));

  // (c) durationDays === null omits the "Days active" row.
  const ctxNoDuration: PressKitContext = { ...ctx, stats: { ...ctx.stats, durationDays: null } };
  const mdNoDuration = buildPressKitMarkdown(ctxNoDuration, normalizePressKitConfig({
    includedSections: ["stats"],
  }), prose);
  check("omits Days active when durationDays is null", !mdNoDuration.includes("Days active"));
}

// (d) normalizePressKitConfig: an includedSections array that is entirely
// unknown values filters down to empty, which falls back to the default set.
{
  const c = normalizePressKitConfig({ includedSections: ["totallyBogus"] });
  check("falls back to default sections when all filtered out",
    JSON.stringify(c.includedSections) === JSON.stringify(DEFAULT_PRESS_KIT_CONFIG.includedSections));
  check("fallback sections are non-empty", c.includedSections.length > 0);
}

// (e) contributors, dated timeline, comment count
{
  const ctx2 = {
    project: { name: "AstroUSA", type: "HARDWARE", status: "ACTIVE", description: null,
      startDate: new Date("2026-01-01"), targetDate: null, programTag: null, githubRepo: null, driveLink: null },
    stats: { teamSize: 3, tasksDone: 5, tasksTotal: 8, milestonesHit: 1, hoursLogged: 40, durationDays: 100, commentCount: 22 },
    milestones: [{ title: "First flight", description: null, completedAt: new Date("2026-05-01") }],
    contributors: [{ displayName: "Ana Lee", tasksDone: 4, hours: 25 }],
    timeline: [{ title: "First flight", date: new Date("2026-05-01"), kind: "milestone" as const }],
    team: [], tags: [], links: [],
  };
  const md2 = buildPressKitMarkdown(ctx2 as any, normalizePressKitConfig({
    includedSections: ["stats", "timeline", "team", "highlights"],
  }), { about: "", aboutSearch: "", building: "", sponsorship: "" });
  check("stats include comment count", md2.includes("22"));
  check("timeline lists dated milestone", md2.includes("First flight") && md2.includes("2026"));
  check("contributors render under team", md2.includes("Ana Lee") && md2.includes("4"));
}

console.log(`\npressKitService: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
