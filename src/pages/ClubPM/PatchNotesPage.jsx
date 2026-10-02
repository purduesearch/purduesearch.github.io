import { useEffect, useRef } from 'react';
import {
  compareVersions, markPatchNotesSeen, readSeenVersion, usePatchNotes,
} from '../../clubpm/patchNotes';

// /clubpm/patch-notes — "What's new". Releases are generated from git history
// once a day (docs/PATCH-NOTES.md); this page only renders them.

const SECTION_ICONS = { feat: 'fa-star', perf: 'fa-gauge-high', fix: 'fa-wrench' };

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function PatchNotesPage() {
  const notes = usePatchNotes();
  // Captured before marking seen, so releases new to this member stay flagged
  // for the rest of the visit.
  const seenBefore = useRef(readSeenVersion());

  useEffect(() => {
    if (notes?.current) markPatchNotesSeen(notes.current);
  }, [notes]);

  return (
    <div className="clubpm-app pm-patch-notes-page">
      <div className="pm-outreach-page-header">
        <div>
          <h1 className="pm-outreach-page-title">
            <i className="fas fa-wand-magic-sparkles pm-patch-notes-title-icon" aria-hidden="true" />
            What&rsquo;s new
          </h1>
          <p className="pm-outreach-page-sub">
            {notes?.current ? `Constellation v${notes.current} · ` : ''}
            Updated each morning from the day&rsquo;s changes.
          </p>
        </div>
      </div>

      {notes === undefined && <div className="cpm-spinner" role="status" aria-label="Loading patch notes" />}

      {notes && notes.releases.length === 0 && (
        <p className="pm-patch-notes-empty">No releases yet. The first one appears the morning after this feature ships.</p>
      )}

      {notes?.releases.map(release => {
        const isNew = !!seenBefore.current && compareVersions(release.version, seenBefore.current) > 0;
        return (
          <section key={release.version} className="cpm-card pm-patch-release" aria-labelledby={`release-${release.version}`}>
            <header className="pm-patch-release-head">
              <h2 id={`release-${release.version}`} className="pm-patch-release-version">v{release.version}</h2>
              {isNew && <span className="cpm-tag pm-patch-release-new">New to you</span>}
              <time className="pm-patch-release-date" dateTime={release.date}>{formatDate(release.date)}</time>
            </header>

            {release.baseline ? (
              <p className="pm-patch-notes-empty">Patch notes start here.</p>
            ) : release.sections.map(section => (
              <div key={section.type} className={`pm-patch-section pm-patch-section--${section.type}`}>
                <h3 className="pm-patch-section-title">
                  <i className={`fas ${SECTION_ICONS[section.type] ?? 'fa-circle'}`} aria-hidden="true" />
                  {section.title}
                </h3>
                <ul className="pm-patch-items">
                  {section.items.map(item => (
                    <li key={item.sha + item.text}>
                      {item.scope && <span className="pm-patch-scope">{item.scope}</span>}
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
