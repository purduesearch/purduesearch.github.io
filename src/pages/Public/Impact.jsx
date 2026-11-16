// Public impact page. Renders exactly what GET /api/public/impact returns: aggregate totals (hidden below
// 3 contributors), tool counts (hidden below 3 members) and opt-in member cards. Nothing here ranks people.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import { apiBaseUrl } from '../../api/clubPmClient';

async function loadImpact() {
  const response = await fetch(`${apiBaseUrl}/api/public/impact`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const fmt = n => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 1 }));

export default function Impact() {
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let live = true;
    loadImpact()
      .then(data => { if (live) setState({ status: 'ok', data }); })
      .catch(() => { if (live) setState({ status: 'error', data: null }); });
    return () => { live = false; };
  }, []);

  const { status, data } = state;
  const totals = (data?.totals ?? []).filter(t => t.total !== null && t.total !== undefined);
  const hiddenCount = (data?.totals?.length ?? 0) - totals.length;
  const tools = data?.tools ?? [];
  const featured = data?.featured ?? [];
  const nothing = status === 'ok' && !totals.length && !tools.length && !featured.length;

  return (
    <>
      <SEOHead
        title="Our impact"
        description="What Purdue SEARCH members have built, taught and shipped, counted from real project records."
        canonical="/impact"
      />
      <Navbar />
      <main id="main-content" className="impact-page">
        <header className="impact-hero">
          <p className="impact-eyebrow">Impact</p>
          <h1>What our members have done</h1>
          <p className="impact-lede">
            Every number below is counted from Constellation project records, not estimated. A figure appears only
            when at least three members contributed to it, so no one can be picked out.
          </p>
        </header>

        {status === 'loading' && <p className="impact-note" role="status">Loading…</p>}
        {status === 'error' && (
          <p className="impact-note" role="alert">The impact numbers could not be loaded right now. Please try again later.</p>
        )}
        {nothing && (
          <p className="impact-note">Impact numbers will appear here once enough members have work on record.</p>
        )}

        {totals.length > 0 && (
          <section className="impact-section" aria-labelledby="impact-totals">
            <h2 id="impact-totals">By the numbers</h2>
            <ul className="impact-stats">
              {totals.map(t => (
                <li key={t.id} className="impact-stat">
                  <span className="impact-stat-value">{fmt(t.total)}</span>
                  <span className="impact-stat-unit">{t.total === 1 ? t.unitSingular : t.unitPlural}</span>
                  <span className="impact-stat-label">{t.label}</span>
                </li>
              ))}
            </ul>
            {hiddenCount > 0 && (
              <p className="impact-note">Some measures are not shown yet because fewer than {data.floor ?? 3} members have contributed.</p>
            )}
          </section>
        )}

        {tools.length > 0 && (
          <section className="impact-section" aria-labelledby="impact-tools">
            <h2 id="impact-tools">Tools our members work in</h2>
            <p className="impact-note">Members with demonstrated, shared skill in widely used industry technologies.</p>
            <ul className="impact-tools">
              {tools.map(t => (
                <li key={t.name} className="impact-tool">
                  <i className="fas fa-screwdriver-wrench" aria-hidden="true" />
                  <span className="impact-tool-name">{t.name}</span>
                  <span className="impact-tool-count">{t.members} members</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {featured.length > 0 && (
          <section className="impact-section" aria-labelledby="impact-people">
            <h2 id="impact-people">Members who chose to be featured</h2>
            <ul className="impact-cards">
              {featured.map(c => (
                <li key={c.name} className="impact-card">
                  <h3>{c.name}</h3>
                  {(c.major || c.gradTerm) && (
                    <p className="impact-card-meta">{[c.major, c.gradTerm && `Graduating ${c.gradTerm}`].filter(Boolean).join(' · ')}</p>
                  )}
                  {c.targets.length > 0 && (
                    <p className="impact-card-roles">
                      <i className="fas fa-bullseye" aria-hidden="true" /> {c.targets.map(t => t.title).join(', ')}
                    </p>
                  )}
                  {c.bullets.length > 0 && <ul className="impact-card-bullets">{c.bullets.map(b => <li key={b}>{b}</li>)}</ul>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="impact-cta" aria-label="Get involved">
          <h2>Be part of it</h2>
          <div className="impact-cta-actions">
            <Link to="/contact" className="btn-slide">Join SEARCH</Link>
            <Link to="/sponsors" className="btn-slide-outline">Sponsor or hire</Link>
          </div>
        </section>

        {data?.attribution && <p className="impact-attribution">{data.attribution}</p>}
      </main>
      <Footer />
    </>
  );
}
