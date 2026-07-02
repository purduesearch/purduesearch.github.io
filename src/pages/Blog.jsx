import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BlogCard from '../components/BlogCard';
import SEOHead from '../components/SEOHead';
import JsonLd from '../components/JsonLd';
import { breadcrumbs } from '../seo/schema';

const BLOG_API_BASE = process.env.REACT_APP_API_URL || '';

const Blog = () => {
  const [dynamicPosts, setDynamicPosts] = useState([]);

  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  // Fetch AI-expanded blog posts from the outreach backend (best-effort)
  useEffect(() => {
    let cancelled = false;
    fetch(`${BLOG_API_BASE}/api/public/blog`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setDynamicPosts(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
      'url': 'https://purduesearch.github.io/blog',
      'description': 'Latest news and updates from Purdue SEARCH — student-led space analog research at Purdue University.',
      'publisher': {
        '@type': 'Organization',
        'name': 'Purdue SEARCH',
        'url': 'https://purduesearch.github.io/',
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
      <main id="main-content" className="jumbotron jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/Purdue_Sky.webp)' }}>
        <div className="container text-center">
          <h1 className="display-2 mb-4">Blog</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            Latest news and updates from Purdue SEARCH.
          </p>
        </div>
      </main>

      <section id="blog" className="bg-grey">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Latest <b>News</b></h2>
              <p className="section-sub-title">Recent highlights from SEARCH programs, competitions, and research.</p>
            </div>

            {(() => {
              const byYear = {};
              for (const p of dynamicPosts) {
                const y = p.publishedAt ? new Date(p.publishedAt).getFullYear() : 'Undated';
                (byYear[y] ||= []).push(p);
              }
              const years = Object.keys(byYear).sort((a, b) => (b === 'Undated' ? -1 : Number(b) - Number(a)));
              if (years.length === 0) {
                return <p style={{ color: 'var(--color-muted)' }}>No posts yet — check back soon.</p>;
              }
              return years.map((year) => (
                <div key={year} className="mb-5">
                  <h3><b>{year}</b></h3><br />
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
                              excerpt={(p.excerpt ?? '').slice(0, 180)}
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
              <a
                href="https://www.instagram.com/purdue_search/"
                className="btn-slide-outline mr-3"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span><i className="fab fa-instagram mr-1" aria-hidden="true" /> Instagram</span>
              </a>
              <a
                href="https://twitter.com/purduesearch"
                className="btn-slide-outline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span><i className="fab fa-twitter mr-1" aria-hidden="true" /> Twitter</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
