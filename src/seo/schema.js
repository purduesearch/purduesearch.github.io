const BASE = 'https://purduesearch.github.io';

export const breadcrumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(({ name, path }, i) => ({
    '@type': 'ListItem', position: i + 1, name, item: `${BASE}${path}`,
  })),
});

export const websiteSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Purdue SEARCH',
  url: `${BASE}/`,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${BASE}/search?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
});

export const articleSchema = ({ title, description, datePublished, author, url, image }) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: title,
  description,
  datePublished,
  author: { '@type': 'Person', name: author || 'Purdue SEARCH' },
  publisher: { '@type': 'Organization', name: 'Purdue SEARCH', logo: { '@type': 'ImageObject', url: `${BASE}/icons/purdue_search_logo.png` } },
  mainEntityOfPage: url,
  ...(image ? { image } : {}),
});
