// Dashboard themes — registry of cssSlug → display name.
// Adding a new theme:
//   1. Append `.theme-<slug> { --pm-accent: ...; --pm-accent-soft: ...; }` to public/search-theme.css
//   2. Insert a Cosmetic row (category=DASHBOARD_THEME, cssSlug=<slug>)
//   3. Add an entry below (purely for the "fallback display label" lookup; not required)
//
// The frontend reads cssSlug off the equipped DASHBOARD_THEME cosmetic and applies
// `theme-<slug>` to document.documentElement (see AppShell.jsx).

const THEMES = {
  emerald:       "Emerald",
  aurora:        "Aurora",
  terracotta:    "Terracotta",
  "cosmic-dusk": "Cosmic Dusk",
  auroral:       "Auroral",
};

export default THEMES;
