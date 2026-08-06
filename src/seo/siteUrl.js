// Canonical origin for the public site. Everything that builds an absolute
// public URL — canonical tags, Open Graph, JSON-LD — reads it from here so a
// domain change is a one-line edit rather than a find-and-replace.
//
// Must stay in sync with public/CNAME (what GitHub Pages serves the site as)
// and with the hostnames baked into the non-JS assets that can't import this:
// public/sitemap.xml, public/robots.txt, public/llms.txt, public/index.html,
// public/legal/*.html, public/constellation/index.html (redirect stub).
export const SITE_URL = 'https://purduesearch.org';

export default SITE_URL;
