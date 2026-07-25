# Perf task 2 — Self-host / subset the icon fonts (Font Awesome + LinearIcons)

> Paste this whole file as the opening prompt of a new session.

## Context

`purduesearch.github.io` is a static React 19 (CRA) site on GitHub Pages. Read
`CLAUDE.md` first — note its rule: **Font Awesome classes only, never emoji as
icons.** That rule stays; this task changes only how the icons are *delivered*.

Verified against `main`, `public/index.html` loads two icon fonts from CDNs:

- **Font Awesome 5.15.4** — `https://use.fontawesome.com/releases/v5.15.4/css/all.css`
  (line 95). The stylesheet pulls `fa-solid-900`, `fa-brands-400`, and
  `fa-regular-400` webfonts. Lighthouse shows **~152 kB** of webfont transfer on
  a public page, and the fonts are render-blocking-adjacent (they arrive late and
  icons pop in).
- **LinearIcons** — `https://cdn.linearicons.com/free/1.0.0/icon-font.min.css`
  (line 98). Used in only **two files**: `src/components/Navbar.jsx` (1 usage)
  and `src/pages/Contact.jsx` (4 usages).

Font Awesome usage across `src/` on `main`: **~218 distinct `fa-*` tokens**,
though that count includes sizing/utility modifiers (`fa-3x`, `fa-fw`) and a
bare `fa-`. The real icon set is smaller — enumerate it properly before acting:

```
git grep -ho 'fa-[a-z0-9-]\+' -- src | sort -u
```

Note the set spans both public pages *and* ClubPM.

## Goal

Cut icon-font transfer substantially and remove two third-party CDN dependencies,
with **no visual change to any icon anywhere** (public site or ClubPM).

## Approach

Do these as two independent commits — the LinearIcons one is small and safe, do
it first.

### A. Kill LinearIcons (5 usages, 2 files)

Identify the 5 `lnr-*` icons and swap each for the closest Font Awesome
equivalent already available, matching size/weight visually. Then remove the
LinearIcons `<link>` from `public/index.html`. One CDN origin and one webfont
gone.

### B. Subset / self-host Font Awesome

Pick one, in rough order of preference:

1. **Self-hosted subset** — install `@fortawesome/fontawesome-free` as a dev
   dependency, generate a subset of the woff2 files containing only the glyphs
   actually used (e.g. the `fontawesome-subset` npm package), emit a small
   local CSS with the `@font-face` + only the needed `.fa-*` class rules into
   `public/`, and link that instead of the CDN. Keeps every existing
   `className="fas fa-..."` untouched — no JSX churn.
2. **SVG sprite** — build a sprite of the used icons and swap `<i>` tags for
   `<svg><use/></svg>`. Smallest payload, but touches every icon call site and
   conflicts with CLAUDE.md's "Font Awesome classes only" convention. Only do
   this if option 1 proves unworkable, and update CLAUDE.md if so.
3. **React component tree-shaking** (`@fortawesome/react-fontawesome`) — clean
   and well-supported, but converts hundreds of call sites and moves icon weight
   from CSS into JS. Least attractive here.

Whichever you choose: **verify the emitted subset actually contains every icon
in use**, including ClubPM's, and including any icon referenced dynamically
(e.g. template strings like `` `fas ${item.icon}` `` — grep for those; they
exist in `src/components/AstroFlowDiagram.jsx` and ClubPM code, and a naive
static scan will miss them).

## Constraints

- No visual change to any icon; no copy changes; brand tokens untouched.
- Dynamic icon-class construction must keep working — audit for it explicitly.
- `npm run build` must pass.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Verification (required)

1. Build and serve; on both a public page and `/clubpm/login`, confirm in the
   network panel (or via Lighthouse's `network-requests` audit) that no
   `use.fontawesome.com` or `cdn.linearicons.com` request is made and total font
   bytes dropped from the ~152 kB baseline.
2. Walk pages with dense icon usage and confirm every glyph still renders — no
   empty boxes or fallback squares. At minimum: Home, Contact, AstroUSA (its
   flow diagram builds icon classes dynamically), Software, and one ClubPM view.
3. Re-run Lighthouse mobile on `/` and record the before/after Performance score.

## Note on branch state

Figures are from `main`. If `feat/interactive-upgrade` is merged, the Google
Fonts link is already pruned to Oswald + Lato and the AOS/Owl CDNs are gone, so
the remaining third-party origins will be Font Awesome, LinearIcons, jsDelivr
(Bootstrap CSS), and code.jquery.com. Re-measure before drawing conclusions.
