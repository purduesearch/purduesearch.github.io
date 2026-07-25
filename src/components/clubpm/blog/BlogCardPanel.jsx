import React from 'react';
import BlogCard from '../../BlogCard';

// Groups the fields that assemble the card on /blog behind a live preview.
// There are no card-specific database fields: this panel edits the post's own
// cover image, title, excerpt, byline and category. The preview uses the real
// BlogCard component so what you see is what the index renders.

const CLAMP_HINT = 180;

export default function BlogCardPanel({
  title, coverImageUrl, excerpt, authorName, categoryName, publishedAt, linkUrl, slug,
}) {
  const over = (excerpt ?? '').length > CLAMP_HINT;
  const date = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="cpm-blog-cardpanel">
      <div className="cpm-blog-meta-divider">Blog card</div>

      <div className="cpm-blog-cardpanel-preview">
        <BlogCard
          image={coverImageUrl || '/Purdue_Sky.webp'}
          imageAlt={title}
          tag={categoryName || 'Update'}
          title={title || 'Untitled post'}
          href={linkUrl || `/blog/${slug || 'post-slug'}`}
          date={date}
          excerpt={excerpt || ''}
          author={authorName || 'SEARCH Team'}
        />
      </div>

      {!coverImageUrl && (
        <p className="cpm-blog-cardpanel-warn">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
          No cover image set — the blog index will show the default campus photo.
          Set one under <strong>Cover image</strong> below.
        </p>
      )}
      {over && (
        <p className="cpm-blog-cardpanel-hint">
          This excerpt is {(excerpt ?? '').length} characters. The card shows about {CLAMP_HINT}
          {' '}before it clamps — the rest is still used for search and social previews.
        </p>
      )}
      <p className="cpm-blog-cardpanel-hint">
        The card is built from the fields below: cover image, post title, excerpt, byline,
        first category, and link URL.
      </p>
    </div>
  );
}
