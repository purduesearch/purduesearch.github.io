import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BlogCard from '../components/BlogCard';
import SEOHead from '../components/SEOHead';
import JsonLd from '../components/JsonLd';
import { breadcrumbs } from '../seo/schema';
import ExternalLink from '../components/ExternalLink';
import { SITE_URL } from '../seo/siteUrl';

const BLOG_API_BASE = process.env.REACT_APP_API_URL || '';

const Blog = () => {
  const [dynamicPosts, setDynamicPosts] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  // Fetch AI-expanded blog posts from the outreach backend (best-effort)
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetch(`${BLOG_API_BASE}/api/public/blog`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        if (cancelled) return;
        setDynamicPosts(Array.isArray(data) ? data : []);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/Purdue_Sky.webp';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      'name': 'Purdue SEARCH Blog',
      'url': `${SITE_URL}/blog`,
      'description': 'Latest news and updates from Purdue SEARCH — student-led space analog research at Purdue University.',
      'publisher': {
        '@type': 'Organization',
        'name': 'Purdue SEARCH',
        'url': `${SITE_URL}/`,
      },
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <SEOHead
        title="Blog &amp; News"
        description="Latest news and updates from Purdue SEARCH — student-led space analog research at Purdue University."
        canonical="/blog"
      />
      <JsonLd data={breadcrumbs([
        { name: 'Home', path: '/' },
        { name: 'Blog', path: '/blog' },
      ])} />
      <Navbar />
      <header className="jumbotron jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/Purdue_Sky.webp)' }}>
        <div className="container text-center">
          <h1 className="display-2 mb-4">Blog</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            Latest news and updates from Purdue SEARCH.
          </p>
        </div>
      </header>

      <main id="main-content">
      <section id="blog" className="bg-grey">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Latest <b>News</b></h2>
              <p className="section-sub-title">Recent highlights from SEARCH programs, competitions, and research.</p>
            </div>

            {status === 'loading' && (
              <div className="row" aria-busy="true" aria-label="Loading posts">
                {[0, 1, 2].map(i => (
                  <div key={i} className="col-md-4 mb-4">
                    <div className="home-events-skeleton blog-skeleton" />
                  </div>
                ))}
              </div>
            )}
            {status === 'error' && (
              <div role="alert">
                <p style={{ color: 'var(--color-muted)' }}>Couldn't load posts.</p>
                <button type="button" className="btn-slide-outline" onClick={() => setAttempt(n => n + 1)}>
                  <span>Try again</span>
                </button>
              </div>
            )}
            {status === 'ready' && (() => {
              const byYear = {};
              for (const p of dynamicPosts) {
                const y = p.publishedAt ? new Date(p.publishedAt).getFullYear() : 'Undated';
                (byYear[y] ||= []).push(p);
              }
              const years = Object.keys(byYear).sort((a, b) => {
                if (a === 'Undated') return 1;
                if (b === 'Undated') return -1;
                return Number(b) - Number(a);
              });
              if (years.length === 0) {
                return <p style={{ color: 'var(--color-muted)' }}>No posts yet — check back soon.</p>;
              }
              return years.map((year) => (
                <div key={year} className="mb-5">
                  <h3 className="mb-3"><b>{year}</b></h3>
                  <div className="row">
                    <div className="col-md-12 blog-holder">
                      <div className="row">
                        {byYear[year].map((p, i) => (
                          <div key={p.id} className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay={i * 60}>
                            <BlogCard
                              image={p.coverImageUrl ?? '/Purdue_Sky.webp'}
                              imageAlt={p.title}
                              tag={p.categories?.[0]?.name ?? p.tags?.[0]?.name ?? 'Update'}
                              title={p.title}
                              href={p.linkUrl || `/blog/${p.slug}`}
                              date={p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                              excerpt={p.excerpt ?? ''}
                              author={p.authorName ?? p.createdBy?.displayName ?? 'SEARCH Team'}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ));
            })()}

            {/* Follow us */}
            <div className="text-center mt-5 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p style={{ color: 'var(--color-muted)', marginBottom: '1rem' }}>
                Follow us for real-time updates
              </p>
              <ExternalLink
                href="https://www.instagram.com/purdue_search/"
                                className="btn-slide-outline mr-3"
              >
                <span><i className="fab fa-instagram mr-1" aria-hidden="true" /> Instagram</span>
              </ExternalLink>
              <ExternalLink
                href="https://twitter.com/purduesearch"
                                className="btn-slide-outline"
              >
                <span><i className="fab fa-twitter mr-1" aria-hidden="true" /> Twitter</span>
              </ExternalLink>
            </div>
          </div>
        </div>
      </section>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
