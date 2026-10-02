# Handoff: VISOR Field Notebook page

## Overview
A "field notebook" style page documenting VISOR's 2026–27 software cycle: cover, team leads, research log, test & evaluation record, past NASA SUITS work, sponsor requirements, and a "With Thanks" sponsor acknowledgement section. Torn-paper page treatment, mars-red accents, monospace/condensed-sans type system.

## About the design file
`Software Redesign Directions.dc.html` in this folder is a **design reference built in plain HTML/inline CSS** — it is not production code to copy verbatim. The task is to recreate this design as a real React page inside `purduesearch.github.io`, using the app's existing patterns (React Router, lazy-loaded pages, the shared `Navbar`/`Footer`, `PageWrapper`, `SEOHead`).

## Fidelity
**High-fidelity** for layout, type, color, spacing, and the paper/page-turn treatment — recreate pixel-close. **Low-fidelity / placeholder** for data: team roster (2 leads shown), sponsor list (only Purdue CS confirmed, plus 2 open "add sponsor" slots), and all "photo placeholder" panels — these need real content/assets before shipping, not fabricated ones.

## Where this plugs into the real site
The repo already has the pattern to follow exactly — `src/pages/Software/Suits.jsx`, routed as a sub-page of Software:

```js
// src/App.js — near the other Software lazy imports (~line 29-40)
const Suits = lazy(() => import('./pages/Software/Suits'));
// add:
const FieldNotebook = lazy(() => import('./pages/Software/FieldNotebook'));

// in <Routes> (~line 169-170), right after the Suits route:
<Route path="/software/suits" element={<PageWrapper><Suits /></PageWrapper>} />
<Route path="/software/field-notebook" element={<PageWrapper><FieldNotebook /></PageWrapper>} />
```

New file: `src/pages/Software/FieldNotebook.jsx`. Copy the top of `Suits.jsx` verbatim for the imports/shell — **this is the "header section that must stay"**:

```jsx
import React, { useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import SEOHead from '../../components/SEOHead';
import JsonLd from '../../components/JsonLd';
import { breadcrumbs } from '../../seo/schema';

const FieldNotebook = () => {
  useEffect(() => { if (window.AOS) window.AOS.init({ once: true }); }, []);
  return (
    <div>
      <SEOHead title="…" description="…" canonical="/software/field-notebook" />
      <JsonLd data={breadcrumbs([
        { name: 'Home', path: '/' },
        { name: 'Software', path: '/software' },
        { name: 'Field Notebook', path: '/software/field-notebook' },
      ])} />
      <Navbar />
      <Breadcrumb />
      {/* ...notebook content goes here... */}
      <Footer />
    </div>
  );
};
export default FieldNotebook;
```

`Navbar` (`src/components/Navbar.jsx`) is the real site header — nav links, scroll-solid behavior, mobile menu, auth state. **Do not touch it or reimplement it**; the field notebook design's own "VISOR — Field Notebook / PG. 0X" strip is page content that sits *below* the real `Navbar`, not a replacement header.

Optionally link to the new page from `src/pages/Software.jsx`, the same way it links to `/software/suits` (see the `<Link to="/software/suits" className="btn-slide">` calls).

## Converting the markup
The design file uses inline `style="a:b;c:d"` strings throughout (design-tool convention). In JSX these become `style={{ a: 'b', c: 'd' }}` objects — camelCase the property names, keep the values as strings/numbers. There are no dynamic template values in this design; every page's content is static, so this is a mechanical find/replace pass, page by page.

The paper page-turn/scroll behavior (`componentDidMount` in the DC's logic class — see the `<script data-dc-script>` block at the bottom of the file) reads scroll position and rotates/curls each `[data-page]` block. Port this as a `useEffect` + `useRef` per page, or simplify to a lighter CSS-only page-stack if the scroll-driven 3D effect isn't worth the complexity for a first cut — confirm with design before dropping it.

## Assets
All photos are gray diagonal-stripe placeholders with a monospace caption (e.g. "photo placeholder — Houston field test") — swap in real photos at the same aspect ratios. The sponsor "logo placeholder" tiles need the actual Purdue CS logo (check `public/` for an existing Purdue wordmark/logo asset already used elsewhere on the site before adding a new one).

## Files
- `Software Redesign Directions.dc.html` — the full design, all 5 pages.
