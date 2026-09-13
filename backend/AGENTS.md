# AGENTS.md — ClubPM Backend (`backend/`)

Scope: the Node.js/Express/Prisma/Slack Bolt service. Applies together with the root
`AGENTS.md`. More detail lives closer to the code you're touching:

- `backend/src/api/AGENTS.md` — REST route reference
- `backend/src/services/AGENTS.md` — service-layer reference
- `backend/src/slack/AGENTS.md` — cron jobs + Slack portal invariants
- `backend/prisma/AGENTS.md` — schema models/enums reference

---

## ClubPM Backend Architecture

**Entry:** `backend/src/app.ts` — Express setup, PostgreSQL-backed sessions, Helmet, route ordering, static uploads, the Slack Bolt receiver, and the collaborative-editing WebSocket attachment.

## Commands and Environment

Run these from `backend/`:

```bash
npm run dev          # live service; requires .env and reachable dependencies
npm run build        # emit dist/
npm run typecheck    # tsc --noEmit; no credentials or network required
npm test             # every standalone src/**/*.test.ts file
npx tsx src/services/publicEventService.test.ts  # fast single test
```

Database/seed commands and the live server require `backend/.env`; integration and diagnostic
paths can require PostgreSQL or third-party network access. The standalone test suite uses local,
injected, or source-inspection boundaries and must not use production credentials or external
network services. Of the two checked-in examples, the repository-root `.env.example` is the
canonical style and broader template for `backend/.env`; the local `backend/.env.example` is a
shorter legacy-style copy. Neither currently lists every optional environment knob.
