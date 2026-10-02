import { Link } from 'react-router-dom';
import ExternalLink from './ExternalLink';

/**
 * Reusable blog/news card.
 * Maps to the existing .blog-item DOM structure in search-theme.css.
 * All props are optional — render only what is provided.
 * The title is the card's only link; its ::after stretches over the whole card.
 */
const BlogCard = ({ image, imageAlt, tag, title, href, date, excerpt, author }) => {
  const isExternal = typeof href === 'string' && /^https?:\/\//.test(href);
  const target = href || '#';
  const titleContent = <h3 className="blog-title-text">{title}</h3>;
  return (
  <div className="blog-item blog-item--linked">
    {image && (
      <div className="blog-img">
        <img loading="lazy" src={image} alt={imageAlt || title || ''} />
      </div>
    )}
    <div className="blog-text">
      {tag && <p className="blog-tag"><small>{tag}</small></p>}
      {title && (
        <div className="blog-title">
          {isExternal
            ? <ExternalLink href={target} className="blog-card-link">{titleContent}</ExternalLink>
            : <Link to={target} className="blog-card-link">{titleContent}</Link>}
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
