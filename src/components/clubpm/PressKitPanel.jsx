import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import BlogEditor from './blog/BlogEditor';
import OrbitLoader from '../OrbitLoader';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import {
  getPressKit, generatePressKit, updatePressKitConfig, publishPressKit,
  getPressKitRevisions, restorePressKitRevision, getPressKitCollabWsUrl,
  updatePressKitContent, deletePressKit,
} from '../../api/clubPmClient';

const AUDIENCES = [
  { id: 'SPONSORS', label: 'Sponsors' }, { id: 'PRESS', label: 'Press' },
  { id: 'RECRUITING', label: 'Recruiting' }, { id: 'GENERAL', label: 'General' },
];
const SECTIONS = [
  ['masthead', 'Masthead'], ['about', 'About project'], ['aboutSearch', 'About SEARCH'],
  ['stats', 'By the numbers'], ['building', "What we're building"], ['timeline', 'Timeline'],
  ['tech', 'Tech & tools'], ['team', 'Team'], ['highlights', 'Highlights'],
  ['links', 'Links'], ['contact', 'Contact'], ['sponsorship', 'Sponsorship (Sponsors only)'],
];

export default function PressKitPanel({ project, canEdit }) {
  const { member } = useClubPmAuth();
  const projectId = project.id;

  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState({
    audience: 'GENERAL',
    includedSections: ['masthead','about','aboutSearch','stats','building','timeline','tech','team','highlights','links','contact'],
    accentColor: '#00e5cc',
    contactEmail: '',
    showContact: true,
  });
  const [revisions, setRevisions] = useState([]);
  const [showRevs, setShowRevs] = useState(false);
  const editorRef = useRef(null);
  const saveTimer = useRef(null);
  // Bumped after generate/restore to force a fresh editor mount (new Yjs doc).
  const [editorNonce, setEditorNonce] = useState(0);

  // Debounced REST fallback save: the collab server persists the body when
  // reachable, but if the WS is down (proxy misconfigured) this keeps edits
  // from being lost. Writes contentJson only; see updatePressKitContent.
  const scheduleContentSave = useCallback((json) => {
    if (!canEdit) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updatePressKitContent(projectId, json).catch(() => {});
    }, 1500);
  }, [projectId, canEdit]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPressKit(projectId)
      .then((k) => { if (!cancelled) { setKit(k); setConfig(k.config); } })
      .catch(() => { if (!cancelled) toast.error('Could not load press kit'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const hasDoc = !!kit?.contentJson || (kit?.generatedAt != null);

  const handleGenerate = useCallback(async () => {
    setBusy(true);
    try {
      const updated = await generatePressKit(projectId, config);
      setKit((prev) => ({ ...prev, ...updated }));
      setConfig(updated.config);
      setEditorNonce((n) => n + 1);
      setShowSettings(false);
      toast.success('Press kit generated');
    } catch (e) { toast.error(e.message ?? 'Generation failed'); }
    finally { setBusy(false); }
  }, [projectId, config]);

  const handleSaveConfig = useCallback(async () => {
    try { const r = await updatePressKitConfig(projectId, config); setConfig(r.config); toast.success('Settings saved'); }
    catch { toast.error('Could not save settings'); }
  }, [projectId, config]);

  const handlePublish = useCallback(async () => {
    setBusy(true);
    try {
      const r = await publishPressKit(projectId); // { status, token, url }
      await navigator.clipboard.writeText(r.url).catch(() => {});
      window.open(r.url, '_blank', 'noopener');
      setKit((prev) => ({ ...prev, status: 'PUBLISHED' }));
      toast.success('Published — public link copied');
    } catch (e) { toast.error(e.message ?? 'Publish failed'); }
    finally { setBusy(false); }
  }, [projectId]);

  const openRevisions = useCallback(async () => {
    try { setRevisions(await getPressKitRevisions(projectId)); setShowRevs(true); }
    catch { toast.error('Could not load revisions'); }
  }, [projectId]);

  const handleRestore = useCallback(async (revId) => {
    if (!window.confirm('Restore this version? The current content is snapshotted first.')) return;
    setBusy(true);
    try {
      const r = await restorePressKitRevision(projectId, revId);
      setKit((prev) => ({ ...prev, contentJson: r.contentJson }));
      setEditorNonce((n) => n + 1);
      setShowRevs(false);
      toast.success('Version restored');
    } catch { toast.error('Restore failed'); }
    finally { setBusy(false); }
  }, [projectId]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this press kit and all its revisions? This cannot be undone.')) return;
    setBusy(true);
    try {
      await deletePressKit(projectId);
      setKit((prev) => ({ ...prev, contentJson: null, generatedAt: null, status: 'DRAFT' }));
      setShowSettings(false);
      toast.success('Press kit deleted');
    } catch { toast.error('Delete failed'); }
    finally { setBusy(false); }
  }, [projectId]);

  if (loading) return <div style={{ padding: 48, display: 'grid', placeItems: 'center' }}><OrbitLoader /></div>;

  const toggleSection = (id) => setConfig((c) => ({
    ...c,
    includedSections: c.includedSections.includes(id)
      ? c.includedSections.filter((s) => s !== id)
      : [...c.includedSections, id],
  }));

  // ── Empty state / generate panel ──
  if (!hasDoc || showSettings) {
    return (
      <div className="presskit-panel">
        <div className="presskit-generate-card">
          <h3 className="presskit-generate-title">{hasDoc ? 'Press Kit Settings' : 'Generate Press Kit'}</h3>
          <p className="presskit-generate-sub">Pick an audience and the sections to include, then generate a first draft you can edit.</p>

          <label className="presskit-field-label">Audience</label>
          <div className="presskit-audience-row">
            {AUDIENCES.map((a) => (
              <button key={a.id} type="button"
                className={`presskit-chip${config.audience === a.id ? ' is-active' : ''}`}
                aria-pressed={config.audience === a.id}
                onClick={() => setConfig((c) => ({ ...c, audience: a.id }))}>{a.label}</button>
            ))}
          </div>

          <label className="presskit-field-label">Sections</label>
          <div className="presskit-sections-grid">
            {SECTIONS.map(([id, label]) => (
              <label key={id} className="presskit-section-toggle">
                <input type="checkbox" checked={config.includedSections.includes(id)} onChange={() => toggleSection(id)} />
                {label}
              </label>
            ))}
          </div>

          <div className="presskit-settings-row">
            <label className="presskit-field-label">Accent
              <input type="color" value={config.accentColor}
                onChange={(e) => setConfig((c) => ({ ...c, accentColor: e.target.value }))} />
            </label>
            <label className="presskit-field-label">Contact email
              <input type="email" value={config.contactEmail} placeholder="leads@…"
                onChange={(e) => setConfig((c) => ({ ...c, contactEmail: e.target.value }))} />
            </label>
          </div>

          <div className="presskit-generate-actions">
            {hasDoc && <button type="button" className="clubpm-btn-secondary" onClick={() => setShowSettings(false)} disabled={busy}>Cancel</button>}
            {hasDoc && <button type="button" className="clubpm-btn-secondary" onClick={handleSaveConfig} disabled={busy}>Save settings</button>}
            <button type="button" className="clubpm-btn-primary" onClick={handleGenerate} disabled={busy || !canEdit}>
              {busy ? 'Generating…' : hasDoc ? 'Regenerate (replaces content)' : 'Generate'}
            </button>
          </div>
          {!canEdit && <p className="presskit-generate-sub" style={{ marginTop: 8 }}>You have view-only access to this project.</p>}
        </div>
      </div>
    );
  }

  // ── Editor state ──
  return (
    <div className="presskit-panel">
      <div className="presskit-toolbar">
        <span className={`cpm-blog-status cpm-blog-status--${(kit.status ?? 'draft').toLowerCase()}`}>{kit.status ?? 'DRAFT'}</span>
        <div className="presskit-toolbar-spacer" />
        <button type="button" className="clubpm-btn-secondary" onClick={openRevisions} disabled={busy}>History</button>
        <button type="button" className="clubpm-btn-secondary" onClick={handleDelete} disabled={busy || !canEdit}
          title="Delete this press kit">Delete</button>
        <button type="button" className="clubpm-btn-secondary" onClick={() => setShowSettings(true)} disabled={busy}>Settings</button>
        <button type="button" className="clubpm-btn-secondary" onClick={handleGenerate} disabled={busy || !canEdit}
          title="Regenerate from current data (snapshots the current version first)">Regenerate</button>
        <button type="button" className="clubpm-btn-primary" onClick={handlePublish} disabled={busy || !canEdit}>Publish &amp; share</button>
      </div>

      <div className="presskit-editor-wrap">
        <BlogEditor
          key={`${kit.id}:${editorNonce}`}
          postId={kit.id}
          collabWsUrl={getPressKitCollabWsUrl()}
          collabUser={{ id: member?.id, name: member?.displayName }}
          editable={canEdit}
          content={kit.contentJson}
          onChange={scheduleContentSave}
          onEditorReady={(ed) => { editorRef.current = ed; }}
        />
      </div>

      {showRevs && (
        <div className="presskit-revs-drawer">
          <div className="presskit-revs-header">
            <span>Version history</span>
            <button type="button" className="cpm-blog-tb-btn" onClick={() => setShowRevs(false)}><i className="fas fa-xmark" /></button>
          </div>
          {revisions.length === 0 && <p className="presskit-generate-sub">No earlier versions yet.</p>}
          {revisions.map((r) => (
            <div key={r.id} className="presskit-rev-row">
              <span>{new Date(r.createdAt).toLocaleString()}</span>
              <span className="presskit-rev-author">{r.author}</span>
              <button type="button" className="clubpm-btn-secondary" onClick={() => handleRestore(r.id)} disabled={busy || !canEdit}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
