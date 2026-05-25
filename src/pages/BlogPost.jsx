import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';

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

  return (
    <div>
      <SEOHead
        title={post.title}
        description={(post.blogMarkdown ?? '').replace(/[#*_`]/g, '').slice(0, 160)}
        canonical={`/blog/${slug}`}
      />
      <Navbar />

      {/* Hero banner */}
      <div
        id="main-content"
        className="jumbotron jumbotron-single d-flex align-items-center"
        style={{ backgroundImage: `url(${post.mediaUrls?.[0] ?? '/Purdue_Sky.webp'})` }}
      >
        <div className="container text-center">
          {post.project?.name && (
            <p className="header-sub-title" style={{ marginBottom: 8, opacity: 0.85 }}>
              {post.project.name}
            </p>
          )}
          <h1 className="display-3 mb-3">{post.title}</h1>
          <p className="header-sub-title">
            {post.author?.displayName && <span>{post.author.displayName}</span>}
            {post.author?.displayName && publishDate && <span style={{ margin: '0 8px' }}>·</span>}
            {publishDate && <span>{publishDate}</span>}
          </p>
        </div>
      </div>

      <section className="bg-white">
        <div className="container">
          <div className="section-content" style={{ maxWidth: 760, margin: '0 auto' }}>
            <div className="pm-blog-post-body">
              <ReactMarkdown>{post.blogMarkdown}</ReactMarkdown>
            </div>

            <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <Link to="/blog" className="btn-slide-outline">
                <span>← All posts</span>
              </Link>
              {post.project?.name && (
                <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  Filed under: {post.project.name}
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
