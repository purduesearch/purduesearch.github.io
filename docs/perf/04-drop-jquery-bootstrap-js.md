# Perf task 4 — Replace the Bootstrap collapse navbar with React state, drop jQuery + Bootstrap JS

> Paste this whole file as the opening prompt of a new session.

## Context

`purduesearch.github.io` is a static React 19 (CRA) site on GitHub Pages. Read
`CLAUDE.md` first.

`public/index.html` loads two render-adjacent scripts from CDNs (~50 kB gzip
combined, plus two extra origins to connect to):

- `https://code.jquery.com/jquery-3.6.0.min.js` (line 112 on `main`)
- `https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js` (line 114)

They exist for exactly **one** consumer. Verified on `main`: the only non-vendor
file using jQuery or Bootstrap JS behaviour is `src/components/Navbar.jsx` —

- line 19: `const [menuOpen, setMenuOpen] = useState(false);` (React state already exists)
- lines 33–39: syncs that state *from* Bootstrap by listening to
  `show.bs.collapse` / `hide.bs.collapse` on `#navbar-nav-header` via `window.$`
- lines 43–44: `window.$('#navbar-nav-header').collapse('hide')` to close the menu
- line 86: the toggler button uses `data-toggle="collapse"`
- line 89: `aria-expanded={menuOpen}`

Re-verify before you start (the codebase may have moved):

```
rg -n 'window\.\$|\$\(|data-toggle|data-dismiss|\.bs\.' src --glob '!vendor/**'
```

`src/vendor/**` contains unused vendored copies of jQuery plugins — nothing
imports them; ignore those hits.

**Bootstrap *CSS* stays.** The grid (`container`/`row`/`col-*`) is used across
every page. Only the JS bundle and jQuery go.

## Goal

The mobile navbar toggle becomes pure React, and both `<script>` tags are
removed from `public/index.html` — with identical behaviour and animation.

## Approach

1. Read `src/components/Navbar.jsx` end to end first. Note that `menuOpen`
   already drives the transparent/solid navbar styling (line 67) and the
   hamburger/close icon swap (line 92) — that logic stays; only the *source* of
   the state changes from Bootstrap events to a direct click handler.
2. Replace `data-toggle="collapse"` with `onClick={() => setMenuOpen(o => !o)}`
   and render the collapse container's classes from state:
   `className={\`collapse navbar-collapse\${menuOpen ? ' show' : ''}\`}`.
   Bootstrap 4's `.collapse`/`.show` CSS rules are height-based and were animated
   by the JS plugin; with the plugin gone `.show` toggles instantly. If the
   instant snap looks wrong next to the rest of the site, animate it yourself —
   a small CSS `max-height`/`opacity` transition appended to the **bottom** of
   `public/search-theme.css`, or Framer Motion (already a dependency) if you want
   height auto. Match the previous ~350ms feel.
3. Replace the `collapse('hide')` calls (route change / link click) with
   `setMenuOpen(false)`.
4. Delete the two `<script>` tags from `public/index.html`, plus the now-unneeded
   `dns-prefetch`/`preconnect` hints for `code.jquery.com` (and for jsDelivr only
   if Bootstrap CSS is no longer served from there — it still is, so **keep the
   jsDelivr preconnect**).
5. Keep every ARIA attribute correct: `aria-expanded`, `aria-controls`,
   `aria-label` on the toggler. Menu must be operable by keyboard, and Escape
   closing it is a nice addition.

## Constraints

- No copy/content changes; brand tokens untouched; new CSS appended at the
  bottom of `public/search-theme.css` only.
- Do not touch ClubPM (`src/pages/ClubPM/`, `src/components/clubpm/`,
  `src/clubpm/`), `backend/`, `frontend/`, or `src/vendor/`.
- Bootstrap **CSS** link stays.
- `npm run build` must pass.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Verification (required)

1. Confirm nothing else depended on the removed scripts: re-run the grep above
   and check `public/` for any inline script using `$`.
2. Manually exercise the navbar at a narrow viewport (<992px, Bootstrap's `lg`
   breakpoint): open, close, navigate via a link (menu should close), resize
   from narrow to wide while open, keyboard-tab through it.
3. Confirm the desktop navbar and its scroll-triggered transparent→solid state
   still work (that path reads the same `menuOpen`/`isScrolled` state).
4. Build, serve, and confirm via Lighthouse's `network-requests` audit that
   neither jQuery nor the Bootstrap bundle is fetched. Record the before/after
   Performance score and Total Blocking Time on `/`.

## Note on branch state

Facts are from `main`. If `feat/interactive-upgrade` is merged, the Owl Carousel
CDN files are already gone (that branch verified Owl had zero non-vendor usage)
and jQuery/Bootstrap JS carry in-file comments naming `Navbar.jsx` as the reason
they were kept — this task is what removes that reason.
