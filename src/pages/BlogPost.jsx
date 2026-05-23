import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

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
    return <div style={{ padding: '80px 20px', textAlign: 'center', color: '#888' }}>Loading…</div>;
  }
  if (error || !post) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h1 style={{ color: '#ff7675' }}>Post not found</h1>
        <p style={{ color: '#888' }}>It may have been removed or the URL is wrong.</p>
        <Link to="/blog" style={{ color: '#00e5c3' }}>← Back to blog</Link>
      </div>
    );
  }

  return (
    <article className="pm-blog-post">
      <header className="pm-blog-post-header">
        <Link to="/blog" className="pm-blog-post-back"><i className="fas fa-arrow-left" aria-hidden="true" /> All posts</Link>
        {post.project?.name && (
          <span className="pm-blog-post-project">{post.project.name}</span>
        )}
      </header>

      {post.mediaUrls?.[0] && (
        <img src={post.mediaUrls[0]} alt="" className="pm-blog-post-hero" />
      )}

      <div className="pm-blog-post-meta">
        {post.author && (
          <span className="pm-blog-post-author">
            {post.author.avatarUrl
              ? <img src={post.author.avatarUrl} alt="" />
              : <i className="fas fa-user" aria-hidden="true" />}
            {post.author.displayName}
          </span>
        )}
        {post.publishedAt && (
          <span className="pm-blog-post-date">
            {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        )}
      </div>

      <div className="pm-blog-post-body">
        <ReactMarkdown>{post.blogMarkdown}</ReactMarkdown>
      </div>
    </article>
  );
}
