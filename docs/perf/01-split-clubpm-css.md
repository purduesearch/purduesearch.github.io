# Perf task 1 — Split ClubPM styles out of the public CSS bundle

> Paste this whole file as the opening prompt of a new session.

## Context

`purduesearch.github.io` is a static React 19 (CRA) site on GitHub Pages. Read
`CLAUDE.md` first. One stylesheet, `public/search-theme.css`, is linked from
`public/index.html` and therefore downloaded by **every** visitor, including
people who only ever see the public marketing pages.

Verified against `main`:

- `public/search-theme.css` is **22,040 lines / 590 kB raw (~97 kB gzip)**.
- The first ClubPM-prefixed selector appears at **line 4275**; ClubPM rules run
  from there to roughly the end of the file — **3,066 lines** carry a
  `.clubpm-`, `.pm-`, or `.cpm-` selector, and the ClubPM region as a whole is
  ~17,700 lines.
- A handful of *public* sections are interleaved near the bottom (e.g. line
  22023 `/* === Blog wrap/float images === */`). **Do not assume everything
  after line 4275 is ClubPM** — classify section by section.
- Lighthouse on the public Home page reports **~104 KiB of unused CSS**, almost
  entirely this ClubPM block. This is the single biggest remaining perf win.

## Goal

Public pages should download only public CSS. ClubPM routes (`/clubpm/*`) must
look and behave exactly as they do today.

## Approach

1. **Classify before cutting.** Walk `/* === ... */` section headers and build a
   list: public vs ClubPM vs shared (design tokens, resets, typography,
   utilities used by both). Write the classification to a scratch file and sanity
   check it — a rule used by both must stay in the shared file.
2. **Split into `public/search-theme.css` (public + shared) and
   `public/clubpm-theme.css` (ClubPM only).** Keep the `:root` brand tokens and
   the `.clubpm-app` token block wherever their consumers need them; ClubPM's
   `--pm-*` tokens can move to the ClubPM file since they're scoped to
   `.clubpm-app`.
3. **Load the ClubPM sheet only on ClubPM routes.** Simplest robust option:
   import it from a ClubPM-only module so webpack code-splits it into the lazy
   ClubPM chunk (`import './clubpm-theme.css'` inside `AppShell.jsx` or a
   dedicated `clubpm/theme.js`). CRA extracts CSS imported from a lazy chunk
   into its own file that loads on demand. **Verify this actually happens** in
   the build output rather than assuming — if CRA inlines it into the main CSS,
   fall back to injecting a `<link>` at runtime from the ClubPM shell.
4. Preserve cascade order. `search-theme.css` currently loads **after**
   `style.min.css` and overrides it; ClubPM CSS must still win over both on
   ClubPM routes.

## Constraints

- Brand tokens (`public/search-theme.css` lines 17–28 on `main`) stay
  byte-identical: `--color-bg-primary: #f5efe6`, `--color-accent: #b83225`, etc.
- Zero visual change on either side. This is a file-organization change only.
- No copy/content changes.
- `npm run build` must pass.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Verification (required — measure, don't assume)

1. `npm run build`, then record the gzip size of the emitted CSS files:
   `for f in build/static/css/*.css; do echo "$f $(gzip -c "$f" | wc -c)"; done`
2. Serve the build (`npx serve -s build -l 5050`) and run Lighthouse on `/`:
   `npx lighthouse http://localhost:5050/ --only-categories=performance --form-factor=mobile --screenEmulation.mobile --chrome-flags="--headless=new" --quiet --output=json --output-path=after.json`
   Confirm `unused-css-rules` savings dropped substantially from the ~104 KiB baseline.
3. Confirm no ClubPM CSS file is requested on a public page load, and that it
   *is* requested on `/clubpm/login`.
4. Visually compare a public page and a ClubPM page before/after (screenshots
   or a careful DOM/computed-style spot check on a few components).

## Note on branch state

These figures come from `main`. If the branch `feat/interactive-upgrade` has
been merged, `search-theme.css` is ~380 lines longer (appended motion/a11y
blocks, all public — they belong in the public file) and the public bundle will
already be smaller for other reasons. Re-measure rather than trusting the
numbers above.
