import React, { useState, useEffect } from 'react';
import { get, post, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 1) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const emailIdx = header.findIndex(h => h === 'email' || h === 'email_address' || h === 'e-mail');
  const nameIdx  = header.findIndex(h => h === 'name' || h === 'full_name' || h === 'display_name');
  if (emailIdx === -1) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const email = cells[emailIdx];
    if (!email || !email.includes('@')) continue;
    rows.push({
      email,
      name: nameIdx >= 0 ? (cells[nameIdx] || undefined) : undefined,
    });
  }
  return rows;
}

export default function SubscriberManager({ isOpen, onClose }) {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [importing, setImporting]     = useState(false);
  const [csvPreview, setCsvPreview]   = useState(null);

  const load = () => {
    setLoading(true);
    get('/api/outreach/subscribers')
      .then(data => setSubscribers(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load subscribers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (isOpen) load(); }, [isOpen]);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCsv(ev.target.result ?? '');
      setCsvPreview(rows);
    };
    reader.readAsText(file);
  }

  async function importCsv() {
    if (!csvPreview || csvPreview.length === 0) return;
    setImporting(true);
    try {
      const result = await post('/api/outreach/subscribers', { subscribers: csvPreview });
      toast.success(`Imported ${result.created} (${result.skipped} skipped)`);
      setCsvPreview(null);
      load();
    } catch (err) {
      toast.error(err.message ?? 'Failed to import');
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this subscriber?')) return;
    try {
      await del(`/api/outreach/subscribers/${id}`);
      setSubscribers(prev => prev.filter(s => s.id !== id));
    } catch {
      toast.error('Failed to delete');
    }
  }

  if (!isOpen) return null;

  const confirmed = subscribers.filter(s => s.confirmedAt && !s.unsubscribedAt);
  const unsubscribed = subscribers.filter(s => s.unsubscribedAt);

  return (
    <div className="pm-template-modal-backdrop" onClick={onClose}>
      <div className="pm-template-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="pm-template-modal-title">
          <i className="fas fa-users" aria-hidden="true" /> Newsletter Subscribers
        </div>

        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--clubpm-text-secondary)' }}>
          <span><strong style={{ color: 'var(--pm-accent-teal)' }}>{confirmed.length}</strong> active</span>
          <span><strong style={{ color: '#ff7675' }}>{unsubscribed.length}</strong> unsubscribed</span>
          <span><strong>{subscribers.length}</strong> total</span>
        </div>

        {/* CSV import */}
        <div className="pm-crm-import-dropzone" style={{ padding: 16 }}>
          <label style={{ cursor: 'pointer', display: 'block' }}>
            <i className="fas fa-file-csv" aria-hidden="true" style={{ fontSize: 22, color: 'var(--pm-accent-teal)' }} />
            <div style={{ marginTop: 8, fontSize: 12 }}>Click to import a CSV (columns: <code>email</code>, optional <code>name</code>)</div>
            <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
        </div>

        {csvPreview && (
          <div className="pm-crm-import-preview">
            <table>
              <thead><tr><th>Email</th><th>Name</th></tr></thead>
              <tbody>
                {csvPreview.slice(0, 10).map((r, i) => (
                  <tr key={i}><td>{r.email}</td><td>{r.name ?? ''}</td></tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 8 }}>
              <button className="pm-template-action-btn" onClick={() => setCsvPreview(null)}>Cancel</button>
              <button className="pm-template-action-btn primary" onClick={importCsv} disabled={importing}>
                {importing ? 'Importing…' : `Import ${csvPreview.length} subscribers`}
              </button>
            </div>
          </div>
        )}

        {/* Subscriber list */}
        <div style={{ maxHeight: 280, overflowY: 'auto', borderTop: '1px solid var(--clubpm-border)', paddingTop: 8 }}>
          {loading && <div className="pm-template-empty">Loading…</div>}
          {!loading && subscribers.length === 0 && <div className="pm-template-empty">No subscribers yet.</div>}
          {subscribers.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, padding: '6px 4px', alignItems: 'center', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--clubpm-text-primary)' }}>{s.email}</div>
                {s.name && <div style={{ fontSize: 10, color: 'var(--clubpm-text-secondary)' }}>{s.name}</div>}
              </div>
              {s.unsubscribedAt
                ? <span style={{ fontSize: 10, color: '#ff7675' }}>unsubscribed</span>
                : s.confirmedAt
                  ? <span style={{ fontSize: 10, color: 'var(--pm-accent-teal)' }}>active</span>
                  : <span style={{ fontSize: 10, color: '#fdcb6e' }}>pending</span>}
              <button className="pm-insights-icon-btn danger" onClick={() => handleDelete(s.id)} title="Remove">
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <div className="pm-template-modal-footer">
          <button className="pm-template-action-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
