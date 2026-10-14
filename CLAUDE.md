# CLAUDE.md — Claude Code Overlay

@AGENTS.md
@src/AGENTS.md
@backend/AGENTS.md
@backend/src/api/AGENTS.md
@backend/src/services/AGENTS.md
@backend/src/slack/AGENTS.md
@backend/prisma/AGENTS.md
@frontend/AGENTS.md

The imported `AGENTS.md` files are the shared source of truth. This file contains only
Claude Code-specific operating guidance.

## CSS Fixes

When editing `public/clubpm-theme.css`, bump `?v=` in `src/clubpm/loadClubPmTheme.js`, sync the preload URL in `public/index.html`, and update the loader test. The stylesheet is cached without content hashing: verify its loaded URL and computed styles before declaring a visual fix complete. Avoid `.clubpm-app` on temporary animation portals; copy theme variables so page backgrounds and layout cannot leak into effects. See the root `AGENTS.md` CSS cache note.

## Plan Conventions

Claude Code plans live at `%USERPROFILE%\.claude\plans\` with random-animal-noun slugs.

Each plan phase should need no more than 50 tool calls. Split a phase when it:

- touches more than four files;
- combines a Prisma migration with frontend changes; or
- creates more than two new components.

After each phase, run `npm run build` from the repository root and `npm run typecheck` from
`backend/`. Fix errors before continuing.

## Model Selection

Default to Sonnet (`claude-sonnet-5`). Use Opus only for:

- backend security or performance audits;
- refactors spanning both frontend and backend across at least five files; or
- initial architecture design for a brand-new system.
