import React, { useEffect, useState } from 'react';
import { get, getVault, listProjectRepos } from '../../api/clubPmClient';
import { vaultAttachment } from './taskAttachmentUtils';

export default function AttachmentSourceBrowser({ projectId, source, selected, onToggle }) {
  const [repos, setRepos] = useState([]);
  const [repoId, setRepoId] = useState('');
  const [items, setItems] = useState([]);
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const repo = repos.find(r => r.id === repoId);

  useEffect(() => {
    let alive = true;
    if (source === 'vault') return;
    setLoading(true); setError('');
    listProjectRepos(projectId).then(data => {
      if (!alive) return;
      setRepos(data.repos || []); setRepoId(data.repos?.[0]?.id || '');
      if (!data.repos?.length || source === 'repos') setLoading(false);
    }).catch(err => { if (alive) { setError(err.message || 'Could not load repositories.'); setLoading(false); } });
    return () => { alive = false; };
  }, [projectId, source, retry]);

  useEffect(() => {
    if (source !== 'vault' && (!repoId || source === 'repos')) return;
    let alive = true;
    setLoading(true); setError(''); setItems([]);
    const request = source === 'vault' ? getVault(projectId)
      : get(`/api/github/repos/${encodeURIComponent(repoId)}/${source === 'files' ? `contents?path=${encodeURIComponent(path)}` : source === 'issues' ? 'issues?state=all' : 'branches'}`);
    request.then(data => {
      if (!alive) return;
      setItems(source === 'vault' ? data.items || [] : source === 'files' ? data.entries || [] : data[source] || []);
    }).catch(err => { if (alive) setError(err.message || 'Could not load items.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, source, repoId, path, retry]);

  const rows = (source === 'repos' ? repos.map(r => ({ url: `https://github.com/${r.slug}`, label: r.slug })) : items.map(item => {
    if (source === 'vault') return vaultAttachment(projectId, item);
    if (source === 'issues') return { url: item.html_url || item.htmlUrl || `https://github.com/${repo?.slug}/issues/${item.number}`, label: `#${item.number} ${item.title}` };
    if (source === 'branches') return { url: `https://github.com/${repo?.slug}/tree/${encodeURIComponent(item.name)}`, label: item.name };
    return { url: item.html_url || item.htmlUrl || `https://github.com/${repo?.slug}/blob/${encodeURIComponent(repo?.defaultBranch || 'HEAD')}/${item.path.split('/').map(encodeURIComponent).join('/')}`, label: item.name, directory: item.type === 'dir', path: item.path };
  })).filter(item => item.label.toLowerCase().includes(query.toLowerCase()));

  return <div className="pm-task-connected-browser">
    {source !== 'vault' && source !== 'repos' && repos.length > 0 && <label className="pm-task-repo-label">Repository<select aria-label="Repository" className="cpm-attach-input" value={repoId} onChange={e => { setRepoId(e.target.value); setPath(''); }}>
      {repos.map(r => <option key={r.id} value={r.id}>{r.slug}</option>)}
    </select></label>}
    <input aria-label="Filter attachments" type="search" className="cpm-attach-input" placeholder="Filter by name…" value={query} onChange={e => setQuery(e.target.value)} />
    {source === 'files' && path && <button type="button" className="cpm-attach-cancel" onClick={() => { setPath(path.split('/').slice(0, -1).join('/')); setQuery(''); }}><i className="fas fa-arrow-left" aria-hidden="true" /> {path}</button>}
    {loading ? <p role="status">Loading {source}…</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="cpm-attach-cancel" onClick={() => setRetry(n => n + 1)}>Try again</button></div>
      : rows.length === 0 ? <div className="pm-task-attachment-empty"><i className="fas fa-folder-open" aria-hidden="true" /><p>{query ? 'No matching items.' : 'No items available here yet.'}</p><small>You can also paste a link to attach an item.</small></div>
      : <div className="pm-task-attachment-results">{rows.map(item => <button key={item.url} type="button" className={`pm-task-attachment-row ${selected[item.url] ? 'is-selected' : ''}`} aria-pressed={item.directory ? undefined : !!selected[item.url]}
        onClick={() => item.directory ? (setPath(item.path), setQuery('')) : onToggle({ url: item.url, label: item.label })}>
        <i className={`fas ${item.directory ? 'fa-folder' : source === 'vault' ? 'fa-cube' : source === 'branches' ? 'fa-code-branch' : source === 'issues' ? 'fa-circle-dot' : 'fa-file-code'}`} aria-hidden="true" /><span>{item.label}</span>
        <i className={`fas ${item.directory ? 'fa-chevron-right' : selected[item.url] ? 'fa-check-circle' : 'fa-plus'}`} aria-hidden="true" />
      </button>)}</div>}
  </div>;
}
