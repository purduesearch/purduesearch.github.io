const BASE_URL = 'https://purduesearch.github.io';
const DEFAULT_IMAGE = '/icons/purdue_search_logo.png';

/**
 * Per-page SEO head tags. React 19 natively hoists <title>, <meta>, and
 * <link> elements rendered anywhere in the component tree into <head>,
 * so no react-helmet dependency is needed.
 *
 * @param {string}  title       - Page-specific title. Pass the full title
 *                                string for the home page (no suffix appended).
 * @param {string}  description - Meta description (≤160 chars recommended).
 * @param {string}  canonical   - Path only, e.g. "/about". Required.
 * @param {string}  [ogImage]   - Absolute URL or root-relative path to OG image.
 * @param {boolean} [noindex]   - Set true for search/404/utility pages.
 * @param {boolean} [fullTitle] - Set true when `title` is already the full
 *                                document title (skips " | Purdue SEARCH" suffix).
 */
export default function SEOHead({
  title,
  description,
  canonical,
  ogImage = DEFAULT_IMAGE,
  noindex = false,
  fullTitle = false,
}) {
  const docTitle  = fullTitle ? title : `${title} | Purdue SEARCH`;
  const fullUrl   = `${BASE_URL}${canonical}`;
  const fullImage = ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`;

  return (
    <>
      <title>{docTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph */}
      <meta property="og:type"        content="website" />
      <meta property="og:url"         content={fullUrl} />
      <meta property="og:title"       content={docTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image"       content={fullImage} />

      {/* Twitter Card */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:site"        content="@purduesearch" />
      <meta name="twitter:title"       content={docTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image"       content={fullImage} />

      {/* hreflang — English-only site */}
      <link rel="alternate" hreflang="en"        href={fullUrl} />
      <link rel="alternate" hreflang="x-default" href={fullUrl} />

      {noindex && <meta name="robots" content="noindex, follow" />}
    </>
  );
}
