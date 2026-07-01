/**
 * Reusable blog/news card.
 * Maps to the existing .blog-item DOM structure in search-theme.css.
 * All props are optional — render only what is provided.
 */
const BlogCard = ({ image, imageAlt, tag, title, href, date, excerpt, author }) => {
  const isExternal = typeof href === 'string' && /^https?:\/\//.test(href);
  const linkProps = isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
  <div className="blog-item">
    {image && (
      <div className="blog-img">
        <a href={href || '#'} {...linkProps}>
          <img loading="lazy" src={image} alt={imageAlt || title || ''} />
        </a>
      </div>
    )}
    <div className="blog-text">
      {tag && (
        <div className="blog-tag">
          <a href={href || '#'} {...linkProps}><h6><small>{tag}</small></h6></a>
        </div>
      )}
      {title && (
        <div className="blog-title">
          <a href={href || '#'} {...linkProps}><h4>{title}</h4></a>
        </div>
      )}
      {date && (
        <div className="blog-meta">
          <p className="blog-date">{date}</p>
        </div>
      )}
      {excerpt && (
        <div className="blog-desc">
          <p>{excerpt}</p>
        </div>
      )}
      {author && (
        <div className="blog-author">
          <p>by {author}</p>
        </div>
      )}
    </div>
  </div>
  );
};

export default BlogCard;
