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
    stats: { teamSize: 12, tasksDone: 30, tasksTotal: 47, milestonesHit: 6, hoursLogged: 210, durationDays: 200 },
    milestones: [{ title: "First flight", description: null, completedAt: new Date("2026-05-01") }],
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
}

console.log(`\npressKitService: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
