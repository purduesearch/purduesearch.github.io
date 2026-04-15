import { Link, useLocation } from 'react-router-dom';

// Map sub-page pathnames to breadcrumb trail.
// Each entry is an array of [label, path] pairs; null path = current page (no link).
const BREADCRUMBS = {
  '/research/rascal':       [['Research', '/research'], ['NASA RASC-AL', null]],
  '/sa2tp/crew1':           [['SA²TP', '/sa2tp'], ['Crew 1', null]],
  '/sa2tp/rod-interview':   [['SA²TP', '/sa2tp'], ['Rod Interview', null]],
  '/software/suits':        [['Software', '/software'], ['SUITS', null]],
  '/astrousa/overview':     [['ASTRO-USA', '/astrousa'], ['Overview', null]],
  '/astrousa/architecture': [['ASTRO-USA', '/astrousa'], ['Architecture', null]],
  '/astrousa/hydroponics':  [['ASTRO-USA', '/astrousa'], ['Hydroponics', null]],
};

const Breadcrumb = () => {
  const { pathname } = useLocation();
  const crumbs = BREADCRUMBS[pathname];
  if (!crumbs) return null;

  return (
    <nav aria-label="Breadcrumb" className="breadcrumb-nav">
      <ol className="breadcrumb-list">
        <li><Link to="/">Home</Link></li>
        {crumbs.map(([label, path]) => (
          <li key={label}>
            {path
              ? <Link to={path}>{label}</Link>
              : <span aria-current="page">{label}</span>
            }
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
