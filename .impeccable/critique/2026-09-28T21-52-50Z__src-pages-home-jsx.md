---
target: src/pages/Home.jsx
total_score: 18
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\Henry\\Documents\\SEARCH\\purduesearch.github.io\\src\\pages\\Home.jsx"
target_fingerprint: "sha256:d634a13c0906edc63e8ff45cb4e25f0a929c4abd6c85e74615d15f2f1b232220"
target_path: "C:\\Users\\Henry\\Documents\\SEARCH\\purduesearch.github.io\\src\\pages\\Home.jsx"
timestamp: 2026-09-28T21-52-50Z
slug: src-pages-home-jsx
---
Method: dual-agent (A: design review · B: detector + headless puppeteer)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Events calendar has real loading/error/empty states; auto-rotating Programs quote has no pause/progress cue |
| 2 | Match System / Real World | 2 | Nav codenames: "Microgreen Microwaves" -> /research (RASC-AL), "SUITS" -> /software |
| 3 | User Control and Freedom | 2 | Programs carousel auto-advances every 4s with no pause (WCAG 2.2.2); 150vh sticky hero traps first scroll |
| 4 | Consistency and Standards | 2 | "Meet the Team" twice in different styles; Teams dropdown = 5, stats say 6, grid shows 6 |
| 5 | Error Prevention | 3 | Mostly n/a; events copy fallback uses window.prompt |
| 6 | Recognition Rather Than Recall | 2 | Team names are internal codenames; nothing maps a major to a team |
| 7 | Flexibility and Efficiency | n/a | Persuade landing page |
| 8 | Aesthetic and Minimalist Design | 1 | ~10 sections, 3 carousels/marquees, 2 videos, WebGL starfield, tilt cards all compete |
| 9 | Error Recovery | 3 | Events error has "Try again"; no fallback path (Instagram/Slack) |
| 10 | Help and Documentation | n/a | Marketing page; Contact is the help path |
| **Total** | | **18/32** | **Acceptable (56%)** |

## Design Specificity Verdict
LLM: Raw material is specific (scroll-scrubbed Mars hero, Mars-red/cream/navy palette, real events calendar), but the composition is a generic club template: wordmark hero, logo marquee, 3D testimonial carousel, three icon pillars, six-card grid, count-up stats, rotating quote box, Instagram grid. The three positioning claims (analog missions, publishable research, every major) never get a section of their own. ARES has no homepage card. Only one mission photo (/bg-2.webp).
Deterministic: CLI detect over Home.jsx + 9 rendered components: 0 findings. In-page detect.js: 38 hits. Real: skipped-heading x2 (h2 -> h4 in Mission and Subteams), kicker-above-heading ("Who We Are"), marquee (.logo-marquee), overused-font (Lato 84%), line-length (~139ch paragraph), gpt-thin-border-wide-shadow x6, dark-glow x1, cream-palette (brand, intentional), layout-transition x2 (unconfirmed). False positives: tight-leading x7 (title/script/style nodes); most of low-contrast x22 (computed fallback colours behind images/gradients; needs manual check). Mobile: 11px horizontal overflow at 390px (scrollWidth 401), culprit unidentified.

## Priority Issues
- [P1] No join path. Hero CTAs are "Meet the Team" + "Contact Us"; Donate has equal nav weight with Contact; the real onboarding channel (Join Slack) is only in the footer, as an outline button. Fix: primary hero CTA "Join SEARCH" -> Slack/next meeting; mid-page "come to a meeting" band pulled from events API; demote Donate to footer. -> /impeccable clarify, /impeccable layout
- [P1] Collaborations marquee overclaims. SpaceX, Blue Origin, Virgin Galactic, NASA, SETI under "Our Collaborations"; llms.txt lists these as speakers. Marquee is aria-hidden so screen readers get an empty heading. Fix: retitle to verified relationships, or replace with a static field-deployment strip (KSC, Biosphere 2). -> /impeccable clarify
- [P1] Testimonials are stale and unverified. Home.jsx:72-115 labels Nathanael Herman "President" and John Peters "Astronaut Training Lead"; About.jsx:197 lists Peters as current President (Herman was President in an earlier term, About.jsx:410). PRODUCT.md: no confirmed testimonials. Fix: confirm quotes with officers and add term labels ("President, 2024-25"), or replace the slot with mission photography. -> /impeccable distill
- [P1] Page overload and redundancy. Mission pillars, Subteams, Who We Are and Programs say the same thing four times; 10 top-level nav controls; 6 of 8 cognitive-load checks fail; three things move at once within two screens. Fix: collapse into one "Find your team" block; nav to About / Teams / Events / Blog / [Join]; Constellation to footer. -> /impeccable distill
- [P2] "Every major has a door" is claimed, never shown. Subteam copy is written for engineers/coders; Business & Ops uses a microscope icon; no "no experience needed". Fix: majors-to-teams mapping in the Find-your-team block. -> /impeccable clarify

## Persona Red Flags
- Jordan (first-timer): SEARCH not expanded next to the wordmark; SEO title uses a different expansion; codename teams; two "Meet the Team" buttons; nothing answers "how do I join / do I need experience".
- Casey (mobile): hero video preload=auto + scroll-scrubbed (janky on mobile decoders); 150vh sticky hero; 13.7 MB drone video autoplays with no network guard; 8-10px dot controls; 11px horizontal overflow; Join Slack at the very bottom.
- Riley (stress): empty events = full month grid + 5 filters around nothing as screen two; API failure gives only "Try again"; Instagram posts dated 2023-24 with hardcoded likes and dates that contradict content; full emoji captions used as alt text.
- Prospective non-engineering major: everything framed as research/training/code; unverifiable "Purdue's Premier Human Spaceflight Chapter" headline; no writing/design/biology/comms roles named.

## Minor Observations
- <main> wraps only the hero; other sections sit outside the landmark.
- Testimonial cards are clickable divs with no keyboard role; program rotation not announced.
- Count-up animates "2022" from 0; "3+" split across two <strong>.
- .tc-dot defined twice with conflicting colours (search-theme.css:1310, 2020).
- Pillar icons reuse subteam SVGs with different meanings.
- ~70 lines of dead calendar code (CAL_MONTHS, CAL_DAYS, eventDays unused per ESLint); redundant role="region" on <section> (Home.jsx:485).
- Footer: Twitter twice, YouTube only in icons; Connect column mixes socials, Donate, BoilerLink.
- PRODUCT.md says Contact/Discord, but the site's join channel is Slack; reconcile.

## Questions to Consider
- If real analog missions are the differentiator, why is screen two a calendar and not a photo-led Crew 1 moment?
- If every claim needed a photo, figure or link, how many of the ten sections survive?
- What exactly does a student who has decided to join do next, and why doesn't the hero hand them that?
