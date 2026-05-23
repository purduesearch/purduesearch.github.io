import React, { useState, useEffect, useCallback } from 'react';
import { get, post, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

const KIND_OPTIONS = ['IMAGE', 'VIDEO', 'GRAPHIC', 'LOGO', 'DOC'];

const KIND_ICONS = {
  IMAGE:   'fas fa-image',
  VIDEO:   'fas fa-video',
  GRAPHIC: 'fas fa-paint-brush',
  LOGO:    'fas fa-star',
  DOC:     'fas fa-file-alt',
};

// ── AddAssetForm ──────────────────────────────────────────────

function AddAssetForm({ onAdded, onCancel }) {
  const [name, setName]   = useState('');
  const [kind, setKind]   = useState('IMAGE');
  const [url, setUrl]     = useState('');
  const [tags, setTags]   = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      toast.error('Name and URL are required.');
      return;
    }
    setSaving(true);
    try {
      const asset = await post('/api/outreach/assets', {
        name: name.trim(),
        kind,
        url: url.trim(),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      onAdded?.(asset);
      toast.success('Asset added to library.');
    } catch (err) {
      toast.error(err.message ?? 'Failed to add asset.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pm-asset-add-form" onSubmit={handleSubmit}>
      <div className="pm-asset-add-form-title">Add Asset</div>
      <div className="cpm-form-group">
        <label className="cpm-form-label">Name *</label>
        <input className="cpm-form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Callout Flyer 2026" required />
      </div>
      <div className="pm-asset-add-row">
        <div className="cpm-form-group" style={{ flex: '0 0 130px' }}>
          <label className="cpm-form-label">Kind</label>
          <select className="cpm-form-select" value={kind} onChange={e => setKind(e.target.value)}>
            {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="cpm-form-group" style={{ flex: 1 }}>
          <label className="cpm-form-label">Tags (comma-separated)</label>
          <input className="cpm-form-input" value={tags} onChange={e => setTags(e.target.value)} placeholder="callout, 2026, instagram" />
        </div>
      </div>
      <div className="cpm-form-group">
        <label className="cpm-form-label">URL *</label>
        <input type="url" className="cpm-form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" required />
      </div>
      <div className="pm-asset-add-actions">
        <button type="button" className="cpm-btn cpm-btn--secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="cpm-btn cpm-btn--primary" disabled={saving}>
          {saving ? <span className="pm-bulk-spinner" /> : <i className="fas fa-plus" aria-hidden="true" />}
          {' '}Add Asset
        </button>
      </div>
    </form>
  );
}

// ── AssetCard ─────────────────────────────────────────────────

function AssetCard({ asset, onSelect, onDelete, selectable }) {
  const isImage = asset.kind === 'IMAGE' || asset.kind === 'GRAPHIC' || asset.kind === 'LOGO';
  const icon = KIND_ICONS[asset.kind] ?? 'fas fa-file';

  return (
    <div
      className={`pm-asset-card${selectable ? ' pm-asset-card--selectable' : ''}`}
      onClick={selectable ? () => onSelect?.(asset) : undefined}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={selectable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(asset); } : undefined}
    >
      <div className="pm-asset-card-thumb">
        {isImage && asset.url ? (
          <img src={asset.url} alt={asset.altText ?? asset.name} className="pm-asset-card-img" loading="lazy" />
        ) : (
          <div className="pm-asset-card-icon">
            <i className={icon} aria-hidden="true" />
          </div>
        )}
        <span className="pm-asset-card-kind">{asset.kind}</span>
      </div>
      <div className="pm-asset-card-body">
        <div className="pm-asset-card-name" title={asset.name}>{asset.name}</div>
        {asset.tags?.length > 0 && (
          <div className="pm-asset-card-tags">
            {asset.tags.slice(0, 3).map(t => (
              <span key={t} className="pm-asset-card-tag">{t}</span>
            ))}
          </div>
        )}
        <div className="pm-asset-card-footer">
          {selectable ? (
            <button
              className="cpm-btn cpm-btn--primary pm-asset-select-btn"
              onClick={(e) => { e.stopPropagation(); onSelect?.(asset); }}
            >
              <i className="fas fa-check" aria-hidden="true" /> Select
            </button>
          ) : (
            <>
              <a
                href={asset.url}
                target="_blank"
                rel="noopener noreferrer"
                className="pm-asset-card-link"
                onClick={e => e.stopPropagation()}
                title="Open asset"
              >
                <i className="fas fa-external-link-alt" aria-hidden="true" />
              </a>
              <button
                className="pm-asset-card-delete"
                onClick={(e) => { e.stopPropagation(); onDelete?.(asset.id); }}
                title="Delete"
                aria-label="Delete asset"
              >
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AssetPicker (exported) ────────────────────────────────────

export default function AssetPicker({
  isOpen,
  onClose,
  onSelect,    // (asset) => void — called when user picks an asset; null if in library mode
  title = 'Asset Library',
}) {
  const [assets, setAssets]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [searchQ, setSearchQ]     = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const loadAssets = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQ.trim()) params.set('q', searchQ.trim());
    if (kindFilter)     params.set('kind', kindFilter);
    get(`/api/outreach/assets?${params}`)
      .then(a => setAssets(Array.isArray(a) ? a : []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [searchQ, kindFilter]);

  useEffect(() => {
    if (isOpen) loadAssets();
  }, [isOpen, loadAssets]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this asset from the library?')) return;
    try {
      await del(`/api/outreach/assets/${id}`);
      setAssets(prev => prev.filter(a => a.id !== id));
      toast.success('Asset deleted.');
    } catch (err) {
      toast.error(err.message ?? 'Delete failed.');
    }
  };

  const handleAdded = (asset) => {
    setAssets(prev => [asset, ...prev]);
    setShowAddForm(false);
  };

  const selectable = typeof onSelect === 'function';

  return (
    <div className="pm-copy-modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="pm-asset-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pm-asset-modal-header">
          <h2 className="pm-asset-modal-title">
            <i className="fas fa-photo-video" aria-hidden="true" /> {title}
          </h2>
          <div className="pm-asset-modal-header-actions">
            {!showAddForm && (
              <button
                className="cpm-btn cpm-btn--secondary pm-asset-add-btn"
                onClick={() => setShowAddForm(true)}
              >
                <i className="fas fa-plus" aria-hidden="true" /> Add Asset
              </button>
            )}
            <button className="pm-copy-close-btn" onClick={onClose} aria-label="Close">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="pm-asset-add-form-wrap">
            <AddAssetForm onAdded={handleAdded} onCancel={() => setShowAddForm(false)} />
          </div>
        )}

        {/* Filters */}
        <div className="pm-asset-filters">
          <input
            type="search"
            className="cpm-form-input pm-asset-search"
            placeholder="Search by name…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') loadAssets(); }}
          />
          <select className="cpm-form-select pm-asset-kind-filter" value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
            <option value="">All types</option>
            {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button className="cpm-btn cpm-btn--secondary pm-asset-search-btn" onClick={loadAssets}>
            <i className="fas fa-search" aria-hidden="true" />
          </button>
        </div>

        {/* Grid */}
        <div className="pm-asset-grid-wrap">
          {loading ? (
            <div className="pm-outreach-loading"><div className="pm-outreach-spinner" /></div>
          ) : assets.length === 0 ? (
            <div className="pm-outreach-empty">
              <i className="fas fa-photo-video" aria-hidden="true" />
              <p>No assets yet. Add your first one above.</p>
            </div>
          ) : (
            <div className="pm-asset-grid">
              {assets.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  selectable={selectable}
                  onSelect={onSelect}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
