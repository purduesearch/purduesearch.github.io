import { useState, useEffect, useCallback } from 'react';
import { get, post } from '../../api/clubPmClient';
import OrbitLoader from '../../components/OrbitLoader';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';

// ── Helpers ───────────────────────────────────────────────────

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Club-wide stat card ───────────────────────────────────────

function ClubStatCard({ value, label, icon, accentColor }) {
  return (
    <div className="pm-meeting-stat-card">
      <div className="pm-meeting-stat-icon" style={{ color: accentColor || 'var(--clubpm-accent-primary)' }}>
        <i className={`fas ${icon}`} aria-hidden="true" />
      </div>
      <div className="pm-meeting-stat-value" style={{ color: accentColor || 'var(--clubpm-text-primary)' }}>
        {value ?? '—'}
      </div>
      <div className="pm-meeting-stat-label">{label}</div>
    </div>
  );
}

// ── Per-project accordion card ────────────────────────────────

function ProjectSummaryCard({ summary }) {
  const [expanded, setExpanded] = useState(false);

  const {
    projectName,
    tasksCompleted = 0,
    tasksCreated   = 0,
    tasksBlocked   = 0,
    tasksOverdue   = 0,
    milestonesCompleted = [],
    keyChanges          = [],
  } = summary;

  return (
    <div className={`pm-meeting-project-card${expanded ? ' pm-meeting-project-card--open' : ''}`}>
      <button
        className="pm-meeting-project-card-header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className="pm-meeting-project-card-name">{projectName}</span>
        <span className="pm-meeting-project-stats-inline">
          <span className="pm-meeting-pill pm-meeting-pill--done" title="Completed">
            <i className="fas fa-check-circle" aria-hidden="true" /> {tasksCompleted}
          </span>
          <span className="pm-meeting-pill pm-meeting-pill--new" title="Created">
            <i className="fas fa-plus-circle" aria-hidden="true" /> {tasksCreated}
          </span>
          {tasksBlocked > 0 && (
            <span className="pm-meeting-pill pm-meeting-pill--blocked" title="Blocked">
              <i className="fas fa-ban" aria-hidden="true" /> {tasksBlocked}
            </span>
          )}
          {tasksOverdue > 0 && (
            <span className="pm-meeting-pill pm-meeting-pill--overdue" title="Overdue">
              <i className="fas fa-exclamation-circle" aria-hidden="true" /> {tasksOverdue}
            </span>
          )}
        </span>
        <i
          className={`fas fa-chevron-${expanded ? 'up' : 'down'} pm-meeting-project-chevron`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="pm-meeting-project-card-body">
          {milestonesCompleted.length > 0 && (
            <div className="pm-meeting-project-section">
              <div className="pm-meeting-project-section-title">Milestones Completed</div>
              <ul className="pm-meeting-project-list">
                {milestonesCompleted.map((m, i) => (
                  <li key={i} className="pm-meeting-project-list-item">
                    <span className="pm-meeting-list-prefix" aria-hidden="true">&#x2705;</span>
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {keyChanges.length > 0 && (
            <div className="pm-meeting-project-section">
              <div className="pm-meeting-project-section-title">Key Changes</div>
              <ul className="pm-meeting-project-list">
                {keyChanges.map((c, i) => (
                  <li key={i} className="pm-meeting-project-list-item">
                    <span className="pm-meeting-list-prefix" aria-hidden="true">&#x1F4DD;</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {milestonesCompleted.length === 0 && keyChanges.length === 0 && (
            <p className="pm-meeting-project-empty">No milestones or key changes this week.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Newsletter Compose Panel ──────────────────────────────────

function ComposeNewsletterPanel({ editorContent }) {
  const [open,          setOpen]          = useState(false);
  const [extraContent,  setExtraContent]  = useState('');
  const [parsedDoc,     setParsedDoc]     = useState(null);
  const [parsing,       setParsing]       = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [sending,       setSending]       = useState(false);
  const [newsletter,    setNewsletter]    = useState(null); // { submission, subject, html }
  const [previewMode,   setPreviewMode]   = useState('preview'); // 'preview' | 'html'
  const [statusMsg,     setStatusMsg]     = useState('');
  const [error,         setError]         = useState('');

  async function handleParseDoc() {
    if (!extraContent.trim()) return;
    setParsing(true); setError('');
    try {
      const result = await post('/api/outreach/newsletters/parse-document', { text: extraContent });
      setParsedDoc(result);
    } catch (e) {
      setError(e.message ?? 'Parse failed');
    } finally {
      setParsing(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true); setError(''); setNewsletter(null);
    try {
      const result = await post('/api/outreach/newsletters/generate', {
        meetingTemplate: editorContent,
        extraContent:    extraContent.trim() || undefined,
      });
      setNewsletter(result);
    } catch (e) {
      setError(e.message ?? 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!newsletter?.submission?.id) return;
    setSending(true); setError(''); setStatusMsg('');
    try {
      await post(`/api/outreach/submissions/${newsletter.submission.id}/newsletter/send`, {});
      setStatusMsg('Newsletter sent to all subscribers.');
    } catch (e) {
      setError(e.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="pm-newsletter-panel">
      <button
        className={`pm-newsletter-panel-toggle${open ? ' pm-newsletter-panel-toggle--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <i className="fas fa-envelope-open-text" aria-hidden="true" />
        Compose Newsletter
        <i className={`fas fa-chevron-${open ? 'up' : 'down'} pm-newsletter-chevron`} aria-hidden="true" />
      </button>

      {open && (
        <div className="pm-newsletter-panel-body">
          <p className="pm-newsletter-hint">
            The current agenda template will be used as the base. Optionally paste extra content (project updates, announcements) and Parse it before generating.
          </p>

          <label className="pm-newsletter-label" htmlFor="pm-newsletter-extra">
            Extra content / paste a doc
          </label>
          <textarea
            id="pm-newsletter-extra"
            className="pm-newsletter-textarea"
            rows={5}
            placeholder="Paste meeting minutes, project updates, or any extra context…"
            value={extraContent}
            onChange={e => setExtraContent(e.target.value)}
          />

          {parsedDoc && (
            <div className="pm-newsletter-parsed">
              <div className="pm-newsletter-parsed-title">Parsed highlights</div>
              {parsedDoc.highlights?.map((h, i) => (
                <div key={i} className="pm-newsletter-highlight">
                  <i className="fas fa-star" aria-hidden="true" /> {h}
                </div>
              ))}
              {parsedDoc.sections?.map((sec, i) => (
                <div key={i} className="pm-newsletter-section">
                  <div className="pm-newsletter-section-head">{sec.heading}</div>
                  <ul className="pm-newsletter-section-list">
                    {sec.bullets?.map((b, j) => <li key={j}>{b}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="pm-newsletter-actions">
            <button
              className="pm-newsletter-parse-btn"
              onClick={handleParseDoc}
              disabled={parsing || !extraContent.trim()}
            >
              <i className={`fas ${parsing ? 'fa-spinner fa-spin' : 'fa-file-alt'}`} aria-hidden="true" />
              {parsing ? 'Parsing…' : 'Parse Pasted Doc'}
            </button>
            <button
              className="pm-newsletter-generate-btn"
              onClick={handleGenerate}
              disabled={generating || !editorContent.trim()}
            >
              <i className={`fas ${generating ? 'fa-spinner fa-spin' : 'fa-magic'}`} aria-hidden="true" />
              {generating ? 'Generating…' : 'Generate Newsletter'}
            </button>
          </div>

          {error && <p className="pm-newsletter-error"><i className="fas fa-exclamation-triangle" /> {error}</p>}

          {newsletter && (
            <div className="pm-newsletter-preview-section">
              <div className="pm-newsletter-preview-header">
                <div>
                  <span className="pm-newsletter-subject-label">Subject: </span>
                  <span className="pm-newsletter-subject">{newsletter.subject}</span>
                </div>
                <div className="pm-newsletter-preview-tabs">
                  <button
                    className={`pm-newsletter-tab${previewMode === 'preview' ? ' pm-newsletter-tab--active' : ''}`}
                    onClick={() => setPreviewMode('preview')}
                  >Preview</button>
                  <button
                    className={`pm-newsletter-tab${previewMode === 'html' ? ' pm-newsletter-tab--active' : ''}`}
                    onClick={() => setPreviewMode('html')}
                  >HTML</button>
                </div>
              </div>

              {previewMode === 'preview' ? (
                <iframe
                  className="pm-newsletter-iframe"
                  srcDoc={newsletter.html}
                  title="Newsletter preview"
                  sandbox="allow-same-origin"
                />
              ) : (
                <textarea
                  className="pm-newsletter-html-textarea"
                  value={newsletter.html}
                  onChange={e => setNewsletter(n => ({ ...n, html: e.target.value }))}
                  rows={18}
                  spellCheck={false}
                />
              )}

              {statusMsg ? (
                <p className="pm-newsletter-success"><i className="fas fa-check-circle" /> {statusMsg}</p>
              ) : (
                <button
                  className="pm-newsletter-send-btn"
                  onClick={handleSend}
                  disabled={sending}
                >
                  <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
                  {sending ? 'Sending…' : 'Send to Subscribers'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function MeetingNotesView() {
  useClubPmAuth(); // ensures auth context is available

  const [template,      setTemplate]      = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [editorContent, setEditorContent] = useState('');
  const [weekEndDate,   setWeekEndDate]   = useState(todayISODate);
  const [copied,        setCopied]        = useState(false);

  const fetchTemplate = useCallback(() => {
    setLoading(true);
    setError(null);
    get(`/api/reporting/meeting-template?weekEnd=${weekEndDate}`)
      .then(data => {
        setTemplate(data);
        setEditorContent(data.agendaTemplate ?? '');
      })
      .catch(err => {
        setError(err.message ?? 'Failed to load meeting template');
      })
      .finally(() => setLoading(false));
  }, [weekEndDate]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editorContent).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clubStats = template?.clubStats ?? {};
  const projectSummaries = template?.projectSummaries ?? [];

  return (
    <div className="pm-meeting-notes-page">
      {/* Page header */}
      <div className="pm-meeting-notes-topbar">
        <div className="pm-meeting-notes-title-group">
          <i className="fas fa-clipboard-list pm-meeting-notes-title-icon" aria-hidden="true" />
          <h1 className="pm-page-title pm-meeting-notes-heading">Meeting Notes Generator</h1>
        </div>
        <div className="pm-meeting-notes-date-control">
          <label className="pm-meeting-date-label" htmlFor="pm-week-end-input">
            Week ending:
          </label>
          <input
            id="pm-week-end-input"
            type="date"
            className="pm-meeting-date-input"
            value={weekEndDate}
            onChange={e => setWeekEndDate(e.target.value)}
          />
        </div>
      </div>

      {/* Two-column body */}
      <div className="pm-meeting-notes-layout">

        {/* ── Left column: auto-generated summaries ── */}
        <div className="pm-meeting-notes-left">

          {loading && (
            <div className="pm-meeting-notes-loading">
              <OrbitLoader size={56} />
              <span className="pm-meeting-notes-loading-text">Generating summary…</span>
            </div>
          )}

          {error && !loading && (
            <div className="pm-meeting-notes-error">
              <i className="fas fa-exclamation-triangle" aria-hidden="true" />
              <span>{error}</span>
              <button className="pm-meeting-retry-btn" onClick={fetchTemplate}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && template && (
            <>
              {/* Meeting header */}
              <div className="pm-meeting-summary-header">
                <div className="pm-meeting-summary-title">Leadership Meeting</div>
                {template.weekRange && (
                  <div className="pm-meeting-summary-range">
                    {new Date(template.weekRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date(template.weekRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>

              {/* Club-wide stats */}
              <div className="pm-meeting-stats-grid">
                <ClubStatCard
                  value={clubStats.tasksCompleted}
                  label="Tasks Completed"
                  icon="fa-check-double"
                  accentColor="var(--clubpm-accent-primary)"
                />
                <ClubStatCard
                  value={clubStats.tasksCreated}
                  label="New Tasks"
                  icon="fa-plus-circle"
                  accentColor="var(--clubpm-accent-secondary)"
                />
                <ClubStatCard
                  value={clubStats.activeMembers}
                  label="Active Members"
                  icon="fa-users"
                  accentColor="var(--pm-accent-amber)"
                />
                <ClubStatCard
                  value={
                    clubStats.velocityDelta != null
                      ? (clubStats.velocityDelta > 0
                          ? `+${clubStats.velocityDelta}`
                          : String(clubStats.velocityDelta))
                      : null
                  }
                  label="Velocity Delta"
                  icon="fa-tachometer-alt"
                  accentColor={
                    clubStats.velocityDelta > 0
                      ? 'var(--clubpm-accent-primary)'
                      : clubStats.velocityDelta < 0
                      ? 'var(--pm-accent-coral)'
                      : 'var(--pm-text-muted)'
                  }
                />
              </div>

              {/* Per-project accordion cards */}
              {projectSummaries.length > 0 ? (
                <div className="pm-meeting-projects-list">
                  <div className="pm-meeting-section-label">Project Summaries</div>
                  {projectSummaries.map((s, i) => (
                    <ProjectSummaryCard key={s.projectId ?? i} summary={s} />
                  ))}
                </div>
              ) : (
                <div className="pm-meeting-empty-projects">
                  <i className="fas fa-folder-open" aria-hidden="true" />
                  <span>No project summaries available for this period.</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right column: editable agenda template ── */}
        <div className="pm-meeting-notes-right">
          <div className="pm-meeting-editor-header">
            <label className="pm-meeting-editor-label" htmlFor="pm-agenda-editor">
              Agenda Template
            </label>
            <div className="pm-meeting-editor-actions">
              <button
                className={`pm-meeting-copy-btn${copied ? ' pm-meeting-copy-btn--copied' : ''}`}
                onClick={handleCopy}
                disabled={!editorContent}
                title="Copy to clipboard"
              >
                <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} aria-hidden="true" />
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button
                className="pm-meeting-regenerate-btn"
                onClick={fetchTemplate}
                disabled={loading}
                title="Regenerate template"
              >
                <i className="fas fa-sync-alt" aria-hidden="true" />
                Regenerate
              </button>
            </div>
          </div>

          <textarea
            id="pm-agenda-editor"
            className="pm-meeting-editor-textarea"
            value={editorContent}
            onChange={e => setEditorContent(e.target.value)}
            placeholder={loading ? 'Generating template…' : 'Agenda template will appear here…'}
            spellCheck={false}
          />

          <ComposeNewsletterPanel editorContent={editorContent} />
        </div>
      </div>
    </div>
  );
}
