import { render } from '@testing-library/react';
import SEOHead from './SEOHead';
import { SITE_URL } from '../seo/siteUrl';

// React 19 hoists <title>/<meta>/<link> rendered anywhere in the tree into
// <head>, so these assertions read document.head rather than the container.
const renderHead = (props = {}) =>
  render(
    <SEOHead
      title="About"
      description="About Purdue SEARCH."
      canonical="/about"
      {...props}
    />
  );

// No manual <head> cleanup here: React owns the nodes it hoists and removes
// them when Testing Library unmounts between tests. Deleting them by hand makes
// that unmount throw on a null parent.
describe('SEOHead', () => {
  // Regression guard. These were written as lowercase `hreflang`, which React
  // treats as an unknown DOM property and silently drops -- it only warns in
  // development, so the tags shipped to production as bare
  // <link rel="alternate"> with no hreflang, making them useless to crawlers.
  // Asserting on the rendered attribute (not the JSX) is what catches that.
  test('emits hreflang alternate links with the attribute intact', () => {
    renderHead();

    const en = document.head.querySelector('link[rel="alternate"][hreflang="en"]');
    const xDefault = document.head.querySelector(
      'link[rel="alternate"][hreflang="x-default"]'
    );

    expect(en).not.toBeNull();
    expect(xDefault).not.toBeNull();
    expect(en.getAttribute('href')).toBe(`${SITE_URL}/about`);
    expect(xDefault.getAttribute('href')).toBe(`${SITE_URL}/about`);
  });

  test('every alternate link carries an hreflang', () => {
    renderHead();

    const alternates = [...document.head.querySelectorAll('link[rel="alternate"]')];

    expect(alternates.length).toBeGreaterThan(0);
    alternates.forEach((link) => {
      expect(link.getAttribute('hreflang')).toBeTruthy();
    });
  });
});
