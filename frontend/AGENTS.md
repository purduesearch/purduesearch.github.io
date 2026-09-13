# AGENTS.md — Standalone Vite Frontend (`frontend/`)

Scope: the separate Club PM Vite application under `frontend/`. This file applies with the
repository root guidance, but the stack rules here override the root React app's plain-JS and
plain-CSS conventions.

## Stack and Conventions

- React 19, TypeScript/TSX, React Router 7, Vite 6, and Tailwind CSS 4.
- Components use PascalCase `.tsx`; shared data shapes live in `src/types.ts`.
- TypeScript is strict and enables unused-symbol, fallthrough, and unchecked side-effect-import
  checks. Keep the app clean under `npm run typecheck`.
- Tailwind is configured through `@tailwindcss/vite` in `vite.config.ts` and
  `@import "tailwindcss"` in `src/index.css`; there is no separate Tailwind config file.
- Prefer existing Tailwind utility patterns and the tokens/utilities in `src/index.css`. Inline
  styles are already used for dynamic values and effects; do not import the root app's public
  theme styles into this app.
- API calls go through `src/api/client.ts`, use relative `/api` or `/auth` paths, and include
  credentials. The Vite development proxy is the source of truth for local targets.
- Routes are declared in `src/App.tsx`. This app is a separate build and is not deployed by the
  root GitHub Pages build.

## Commands

Run from `frontend/`:

```bash
npm run dev        # Vite development server on port 5173
npm run build      # TypeScript build, then Vite bundle to dist/
npm run typecheck  # TypeScript validation without emit
npm run preview    # preview the built bundle
```

There is no ESLint configuration or ESLint dependency in this package, so it intentionally has no
lint script. Do not add a heavy lint toolchain just to mirror the root application.
