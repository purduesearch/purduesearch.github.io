# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

This record covers two surfaces with different audiences.

**Public site (`purduesearch.org`).** The primary visitor is a Purdue student deciding whether to join SEARCH. They arrive from tabling, Instagram, Discord, or word of mouth and want to know: what does this club actually do, is there a place for my major, and how do I get involved. The real join step is the club Slack invite. When page needs conflict, this visitor wins. Secondary visitors (sponsors and partners judging credibility, reviewers and press reading program depth) are served by the program pages but do not override the prospective member.

**Constellation (`/clubpm/*`, members-only).** Everyday members and project leads/admins carry equal weight.
- Members check their tasks, chat, lab schedule, calendar, and quests, often briefly and on a phone (a compact phone shell exists for this).
- Leads and admins plan projects, assign and triage work, approve rewards, manage lab spaces, and run Vault CAD change requests and releases.

## Product Purpose

Purdue SEARCH (Space and Earth Analogs Research Chapter) is a student organization at Purdue University, founded Summer 2022. Members run interdisciplinary research and training programs modeled on real NASA analog astronaut missions.

- The public site exists to turn curious students into members and to present the club's programs credibly. Success: a prospective member understands what SEARCH does, finds a place for themselves, and joins the club Slack.
- Constellation exists to run the club's real work: projects, tasks, milestones, Slack-portal chat, lab scheduling and check-in, CAD/PDM (Vault), training courses, outreach, blogging, and an XP/doubloon engagement layer. Success: members and leads coordinate in one place instead of scattering across tools.

## Positioning

What sets SEARCH apart from other Purdue space clubs, and what a prospective member should feel:
- **Analog missions.** Real analog astronaut training (SA²TP, Crew 1 completed Summer 2023) and field deployments such as Kennedy Space Center and Biosphere 2.
- **Publishable research.** Real research output: ARES (wearable CO₂ sensing headset), the NASA RASC-AL 2023 entry, and the NASA SUITS AR software (JARVIS).
- **Interdisciplinary.** Open to every major: engineering, life sciences, software, business, and outreach.

The club's in-house tooling (Constellation) is not a public selling point.

## Operating Context

- Programs with public pages: SA²TP, ASTRO-USA habitat (overview, architecture, hydroponics), ARES (hub, The Science, The Headset), Research (RASC-AL), Software (SUITS/JARVIS), Outreach, Business & Operations, Blog, About, Contact.
- Homepage carries a public events calendar fed from Constellation events that are explicitly marked public.
- Constellation integrates with the club Slack workspace (two-way portal), Google Drive, GitHub (Vault storage, PR review), and Gemini-backed AI features.
- Constellation is taught through training courses in `docs/courses/` that point at live UI anchors, so its navigation, routes, and tab labels are also teaching material.

## Capabilities and Constraints

- Static React SPA on GitHub Pages at `purduesearch.org`; backend at `api.purduesearch.org`. See `AGENTS.md` files for technical rules.
- Three stylesheets split by audience: `search-theme.css` (public, every visitor downloads it, keep lean), `clubpm-theme.css` (Constellation only), `ares-theme.css` (ARES only, every selector scoped under `.ares-page`).
- Icons are Font Awesome only; no emoji as icons.
- `/clubpm/login` doubles as the Google OAuth application home page; its scope-justification and Limited Use sections must stay.
- Constellation UI changes must keep `tourAnchors.js`, `docs/courses/ANCHORS.md`, and course step files in sync.
- Terminology: "Constellation" is the member-facing name of the app; "ClubPM" is the code/route name.

## Brand Commitments

- **SEARCH name and logo.** "Purdue SEARCH — Space and Earth Analogs Research Chapter" and the logo at `public/icons/purdue_search_logo.png` are kept.
- **Constellation identity.** Constellation keeps its own name and its dark teal/amber look as a separate brand from the public site.
- **ARES publication rules are binding.** The clearance table and figure-credit rules in `docs/superpowers/specs/2026-08-22-ares-public-subteam-page-design.md` (§1, §7) govern every ARES page. Nothing uncleared reaches the public site, and published Dutta et al. figures keep their visible credit strings.
- Official Purdue university brand guidelines were **not** confirmed as binding.

## Evidence on Hand

- Program history and facts: `public/llms.txt` (founding, programs, past speakers from NASA JPL, Blue Origin, SETI Institute, Virgin Galactic; field deployments).
- Program photography and figures under `public/<program>/`, including ARES photography and CFD figures in `public/ares/`.
- SA²TP logos: `public/sa2tp/SA2TP_Logo.webp`, `public/sa2tp/2023/logo.webp`.
- No member testimonials, membership counts, or sponsor logos are confirmed. Do not fabricate them.

## Product Principles

1. **Show the real work.** Missions, hardware, and research credibility come from actual photos, figures, and outcomes, never invented claims.
2. **Every major has a door.** Public pages should let a non-engineer find their place as easily as an engineer.
3. **Joining is always one step away.** On the public site, the path to Join Slack stays obvious.
4. **Constellation serves quick checks and deep work equally.** A member on a phone between classes and a lead planning a release both deserve a first-class path.
5. **Accuracy over polish.** Cleared, credited, correct content outranks visual convenience (ARES rules, OAuth disclosures, course anchors).

## Accessibility & Inclusion

No formal standard was confirmed. Existing practice to preserve: `prefers-reduced-motion` handling, `:focus-visible` styling, 16px inputs and 44px close targets in the compact Constellation shell.
