import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import JsonLd from '../components/JsonLd';
import { articleSchema } from '../seo/schema';
import { initBlogCarousels } from '../lib/blogCarousel';

// AOS is loaded globally; re-init so scroll-reveal works on direct navigation.
if (typeof window !== 'undefined' && window.AOS) window.AOS.init({ once: true });

const BASE_URL = process.env.REACT_APP_API_URL || '';

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/api/public/blog/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status === 404 ? 'Not found' : 'Failed to load'))
      .then(data => { if (!cancelled) setPost(data); })
      .catch(err => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const bodyRef = useRef(null);

  // The body is injected as raw HTML, so React never mounts the carousel —
  // enhance it after each render of a new post.
  useEffect(() => {
    if (bodyRef.current) initBlogCarousels(bodyRef.current);
  }, [post]);

  if (loading) {
    return (
      <div>
        <Navbar />
        <div style={{ padding: '120px 20px', textAlign: 'center', color: 'var(--color-muted)' }}>
          Loading…
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div>
        <Navbar />
        <div style={{ padding: '120px 20px', textAlign: 'center' }}>
          <h1 style={{ color: 'var(--color-accent)' }}>Post not found</h1>
          <p style={{ color: 'var(--color-muted)' }}>It may have been removed or the URL is wrong.</p>
          <Link to="/blog" className="btn-slide-outline" style={{ display: 'inline-block', marginTop: 16 }}>
            <span>← Back to blog</span>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const publishDate = (post.publishedAt || post.createdAt)
    ? new Date(post.publishedAt ?? post.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const authorName = post.authorName ?? post.authors?.[0]?.member?.displayName ?? post.createdBy?.displayName;
  const primaryCategory = post.categories?.[0]?.name;

  return (
    <div>
      <SEOHead
        title={post.ogTitle || post.title}
        description={post.metaDescription || post.excerpt || ''}
        canonical={`/blog/${slug}`}
        ogImage={post.ogImageUrl || post.coverImageUrl || undefined}
      />
      <JsonLd data={articleSchema({
        title: post.title,
        description: post.metaDescription || post.excerpt || '',
        datePublished: post.publishedAt || post.createdAt || undefined,
        author: authorName,
        url: `https://purduesearch.github.io/blog/${slug}`,
        image: post.ogImageUrl || post.coverImageUrl || undefined,
      })} />
      <Navbar />

      {/* Hero banner */}
      <main
        id="main-content"
        className="jumbotron jumbotron-single d-flex align-items-center"
        style={{ backgroundImage: `url(${post.coverImageUrl ?? '/Purdue_Sky.webp'})` }}
      >
        <div className="container text-center">
          {primaryCategory && (
            <p className="header-sub-title" style={{ marginBottom: 8, opacity: 0.85 }}>
              {primaryCategory}
            </p>
          )}
          <h1 className="display-3 mb-3">{post.title}</h1>
          <p className="header-sub-title">
            {authorName && <span>{authorName}</span>}
            {authorName && publishDate && <span style={{ margin: '0 8px' }}>·</span>}
            {publishDate && <span>{publishDate}</span>}
            {post.readingTimeMin && <span style={{ margin: '0 8px' }}>·</span>}
            {post.readingTimeMin && <span>{post.readingTimeMin} min read</span>}
          </p>
        </div>
      </main>

      <section className="bg-white">
        <div className="pm-blog-article">
          <div
            ref={bodyRef}
            className="pm-blog-post-body"
            data-fontpair={post.theme?.fontPair || 'syne-dmsans'}
            data-width={post.theme?.width || 'wide'}
            style={post.theme?.accent ? { '--post-accent': post.theme.accent } : undefined}
            dangerouslySetInnerHTML={{ __html: post.renderedHtml || '' }}
          />

          <div className="pm-blog-article-foot">
            {post.tags?.length > 0 && (
              <div style={{ marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {post.tags.map(t => (
                  <span key={t.slug} className="cpm-tag" style={{ fontSize: 12 }}>#{t.name}</span>
                ))}
              </div>
            )}

            <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <Link to="/blog" className="btn-slide-outline">
                <span>← All posts</span>
              </Link>
              {primaryCategory && (
                <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  Filed under: {primaryCategory}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
