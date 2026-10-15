import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import DriveFolderBrowser, { driveItemUrl } from './DriveFolderBrowser';
import AttachmentSourceBrowser from './AttachmentSourceBrowser';
import GitHubTaskSection from './github/GitHubTaskSection';
import MobileSheet from './MobileSheet';
import { useCompactLayout } from '../../clubpm/layout/compactLayout';

const SOURCES = [
  ['drive', 'Google Drive', 'fab fa-google-drive'], ['vault', 'CAD vault', 'fas fa-cube'],
  ['issues', 'Issues', 'fas fa-circle-dot'], ['branches', 'Branches', 'fas fa-code-branch'],
  ['repos', 'Repositories', 'fab fa-github'], ['files', 'GitHub files', 'fas fa-file-code'],
  ['paste', 'Paste a link', 'fas fa-link'],
];

export default function AttachmentPickerModal({ projectId, task, project, onAdd, onClose }) {
  const compact = useCompactLayout();
  const reduced = useReducedMotion();
  const [source, setSource] = useState(projectId ? 'drive' : 'paste');
  const [selected, setSelected] = useState({});
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const panel = useRef(null);

  useEffect(() => {
    if (compact) return;
    const opener = document.activeElement;
    panel.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [compact]);

  function toggle(item) {
    setSelected(prev => {
      const next = { ...prev };
      if (next[item.url]) delete next[item.url]; else next[item.url] = item;
      return next;
    });
  }
  const validUrl = (() => { try { return ['https:', 'http:'].includes(new URL(url.trim()).protocol); } catch { return false; } })();
  const count = Object.keys(selected).length;
  async function submit(event) {
    event?.preventDefault();
    event?.stopPropagation();
    const items = source === 'paste' ? (validUrl ? [{ url: url.trim(), label: label.trim() || url.trim() }] : []) : Object.values(selected).map(({ url, label }) => ({ url, label }));
    if (!items.length || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    try { await onAdd(items.length === 1 ? items[0] : items); onClose(); }
    catch (err) { setError(err.message || 'Could not attach these items. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function keys(event) {
    // GitHub previews and creation forms portal outside this dialog and own their keys.
    if (!event.currentTarget.contains(event.target)) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); if (!inFlight.current) onClose(); }
    if (event.key !== 'Tab' || compact) return;
    const nodes = [...panel.current.querySelectorAll('button:not(:disabled), input, select, a[href]')];
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
  }
  const contents = <>
    <div className="pm-task-attachment-intro"><span className="pm-task-eyebrow">EVERYTHING IN ONE PLACE</span><p>Bring the context your task needs.</p></div>
    <div className="pm-task-attachment-sources" role="group" aria-label="Attachment source">
      {[...SOURCES, ...(task?.id ? [['github-actions', 'GitHub actions', 'fab fa-github']] : [])].map(([id, name, icon]) => <button key={id} type="button" aria-pressed={source === id} disabled={busy || (!projectId && id !== 'paste')} className={source === id ? 'is-active' : ''}
        onClick={() => { setSource(id); setError(''); }}><i className={icon} aria-hidden="true" />{name}</button>)}
    </div>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={source} className="pm-task-attachment-content" initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.14 }}>
        {source === 'github-actions' ? <GitHubTaskSection task={task} project={project} />
          : source === 'paste' ? <form aria-label="Attachment link" onSubmit={submit} className="cpm-attach-paste">
          <label htmlFor="pm-attachment-url">URL</label><input id="pm-attachment-url" type="url" required className="cpm-attach-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
          <label htmlFor="pm-attachment-label">Label <small>(optional)</small></label><input id="pm-attachment-label" className="cpm-attach-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Give this link a helpful name" />
        </form> : source === 'drive' ? <DriveFolderBrowser key={projectId} projectId={projectId}
          selected={Object.fromEntries(Object.values(selected).filter(f => f.driveId).map(f => [f.driveId, f]))}
          onToggle={file => toggle({ url: driveItemUrl(file), label: file.name, driveId: file.id })} />
          : <AttachmentSourceBrowser key={`${projectId}-${source}`} projectId={projectId} source={source} selected={selected} onToggle={toggle} />}
      </motion.div>
    </AnimatePresence>
    {error && <p className="pm-task-attachment-error" role="alert">{error}</p>}
    <div className="cpm-attach-footer">
      <span className="pm-task-attachment-count" role="status">{count ? `${count} selected` : 'Choose files or paste a link'}</span>
      <button type="button" className="cpm-attach-cancel" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className="clubpm-btn-primary" disabled={busy || (source === 'paste' ? !validUrl : !count)} onClick={submit}>{busy ? 'Attaching…' : source === 'paste' ? 'Attach link' : count ? `Attach ${count}` : 'Attach selected'}</button>
    </div>
  </>;
  if (compact) return <MobileSheet title="Add attachments" variant="fullscreen" onClose={() => !inFlight.current && onClose()} className="pm-task-attachment-sheet">{contents}</MobileSheet>;
  return createPortal(<div className="cpm-attach-overlay pm-task-attachment-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()} onKeyDown={keys}>
    <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add attachments" className="cpm-attach-modal pm-task-attachment-modal"
      initial={reduced ? false : { opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 30 }}>
      <div className="cpm-attach-header"><strong><i className="fas fa-paperclip" aria-hidden="true" /> Add attachments</strong><button type="button" className="cpm-attach-close" aria-label="Close" disabled={busy} onClick={onClose}><i className="fas fa-times" aria-hidden="true" /></button></div>
      {contents}
    </motion.div>
  </div>, document.body);
}
