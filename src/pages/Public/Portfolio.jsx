// Employer-facing skills portfolio at /portfolio/:slug. Built by the server from an
// allow-list (backend skillViewCore.buildPublicPortfolio): only skills the member
// made public, only lead-verified or medium/high-confidence ones, and only work
// from projects they allow. This page renders exactly what it is given.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import { getPublicPortfolio } from "../../api/clubPmClient";
import { BAND_LABELS, LEVEL_LABELS, TREND_META, formatDay, formatMonth, sourceIcon } from "../../components/clubpm/skills/skillsShared";

const SOURCE_WORDS = { github: "GitHub", cad: "CAD", task: "Task", review: "Review", manual: "Described" };

function Skill({ skill }) {
  const trend = TREND_META[skill.trend] ?? TREND_META.STABLE;
  const band = BAND_LABELS[skill.confidence] ?? "";
  return (
    <li className="portfolio-skill">
      <div className="portfolio-skill-head">
        <span className="portfolio-skill-name">{skill.name}</span>
        <span className="portfolio-pips" role="img" aria-label={`Level ${skill.level} of 5, ${LEVEL_LABELS[skill.level]}`}>
          {[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= skill.level ? "on" : ""} />)}
        </span>
        <span className="portfolio-skill-level">{LEVEL_LABELS[skill.level]}</span>
        {skill.verifiedByLead && <span className="portfolio-badge portfolio-badge--verified">Verified by a team lead</span>}
        {skill.peerEndorsed && <span className="portfolio-badge">Endorsed by a teammate</span>}
      </div>
      <div className="portfolio-skill-meta">
        {band}
        {skill.lastDemonstrated ? ` · last used ${formatMonth(skill.lastDemonstrated)}` : ""}
        {" · "}<i className={trend.icon} aria-hidden="true" /> {trend.label}
      </div>
      {skill.evidence.length > 0 && (
        <details className="portfolio-evidence">
          <summary>{skill.evidence.length} piece{skill.evidence.length === 1 ? "" : "s"} of work</summary>
          <ul>
            {skill.evidence.map((e, i) => (
              <li key={`${e.date}-${i}`}>
                <i className={sourceIcon(e.source)} aria-hidden="true" />
                <div>
                  <div>{e.summary}</div>
                  <div className="portfolio-skill-meta">
                    {SOURCE_WORDS[e.source] ?? e.source} · {formatDay(e.date)}{e.project ? ` · ${e.project}` : ""}
                    {e.link && /^https?:\/\//.test(e.link) ? <> · <a href={e.link} target="_blank" rel="noreferrer noopener">view</a></> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export default function Portfolio() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    let live = true;
    setState({ status: "loading", data: null });
    getPublicPortfolio(slug)
      .then(data => { if (live) setState(data ? { status: "ok", data } : { status: "missing", data: null }); })
      .catch(() => { if (live) setState({ status: "error", data: null }); });
    return () => { live = false; };
  }, [slug]);

  const { status, data } = state;
  return (
    <main className="portfolio-page">
      <SEOHead title={data ? `${data.name}: skills portfolio` : "Skills portfolio"} description="A team member's skills, with the project work behind each one." canonical={`/portfolio/${slug}`} noindex />
      {status === "loading" && <p className="portfolio-note">Loading…</p>}
      {status === "error" && <p className="portfolio-note">This portfolio could not be loaded right now. Please try again later.</p>}
      {status === "missing" && (
        <div className="portfolio-empty">
          <h1>Portfolio not found</h1>
          <p>This address is not in use, or the owner has turned their portfolio off.</p>
          <Link to="/">Purdue SEARCH home</Link>
        </div>
      )}
      {status === "ok" && (
        <>
          <header className="portfolio-header">
            {data.avatarUrl && <img src={data.avatarUrl} alt="" width="72" height="72" className="portfolio-avatar" referrerPolicy="no-referrer" />}
            <div>
              <h1>{data.name}</h1>
              {data.title && <div className="portfolio-title">{data.title}</div>}
              {data.headline && <div className="portfolio-headline">{data.headline}</div>}
            </div>
          </header>
          {data.bio && <p className="portfolio-bio">{data.bio}</p>}
          <p className="portfolio-note">{data.generatedNote}</p>

          {data.groups.length === 0 ? (
            <p className="portfolio-note">No skills are shared on this portfolio yet.</p>
          ) : data.groups.map(g => (
            <section key={g.name} className="portfolio-group">
              <h2>{g.name}</h2>
              <ul>{g.skills.map(s => <Skill key={s.name} skill={s} />)}</ul>
            </section>
          ))}

          <footer className="portfolio-footer">
            Skills are estimated from this person&apos;s work on <Link to="/">Purdue SEARCH</Link> projects. Levels run from 1 (aware) to 5 (expert); confidence shows how much recent, varied work supports the estimate.
          </footer>
        </>
      )}
    </main>
  );
}
