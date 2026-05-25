import React, { useState, useEffect } from 'react';
import { get, post, patch, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// ── VoiceForm ─────────────────────────────────────────────────

function VoiceForm({ initial, onSave, onCancel }) {
  const [name, setName]         = useState(initial?.name ?? '');
  const [description, setDesc]  = useState(initial?.description ?? '');
  const [examples, setExamples] = useState((initial?.examples ?? []).join('\n'));
  const [isDefault, setDefault] = useState(initial?.isDefault ?? false);
  const [saving, setSaving]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      toast.error('Name and description are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        examples: examples.split('\n').map(s => s.trim()).filter(Boolean),
        isDefault,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pm-bv-form" onSubmit={handleSubmit}>
      <div className="cpm-form-group">
        <label className="cpm-form-label">Voice Name *</label>
        <input
          className="cpm-form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Casual & Energetic"
          maxLength={60}
          required
        />
      </div>
      <div className="cpm-form-group">
        <label className="cpm-form-label">Description *</label>
        <input
          className="cpm-form-input"
          value={description}
          onChange={e => setDesc(e.target.value)}
          placeholder="Brief description of the tone and style"
          required
        />
      </div>
      <div className="cpm-form-group">
        <label className="cpm-form-label">
          Example Sentences <span className="pm-bv-label-hint">(one per line — AI learns from these)</span>
        </label>
        <textarea
          className="cpm-form-textarea pm-bv-examples-textarea"
          value={examples}
          onChange={e => setExamples(e.target.value)}
          placeholder={"We're building rockets in the cornfields — and crushing it.\nPurdue students doing actual space stuff. No cap."}
          rows={5}
        />
      </div>
      <div className="pm-bv-default-row">
        <label className="pm-composer-template-label">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={e => setDefault(e.target.checked)}
            className="pm-composer-template-input"
          />
          Set as default voice
        </label>
      </div>
      <div className="pm-bv-form-actions">
        <button type="button" className="cpm-btn cpm-btn--secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="cpm-btn cpm-btn--primary" disabled={saving}>
          {saving ? <span className="pm-bulk-spinner" /> : <i className="fas fa-save" aria-hidden="true" />}
          {' '}{initial ? 'Update Voice' : 'Create Voice'}
        </button>
      </div>
    </form>
  );
}

// ── VoiceCard ─────────────────────────────────────────────────

function VoiceCard({ voice, onEdit, onDelete }) {
  return (
    <div className={`pm-bv-card${voice.isDefault ? ' pm-bv-card--default' : ''}`}>
      <div className="pm-bv-card-header">
        <div className="pm-bv-card-name">
          <i className="fas fa-microphone" aria-hidden="true" />
          {voice.name}
          {voice.isDefault && <span className="pm-bv-default-badge">Default</span>}
        </div>
        <div className="pm-bv-card-actions">
          <button
            className="pm-bv-card-btn"
            onClick={() => onEdit(voice)}
            title="Edit"
          >
            <i className="fas fa-pen" aria-hidden="true" />
          </button>
          <button
            className="pm-bv-card-btn pm-bv-card-btn--danger"
            onClick={() => onDelete(voice.id)}
            title="Delete"
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="pm-bv-card-description">{voice.description}</p>
      {voice.examples?.length > 0 && (
        <div className="pm-bv-examples">
          {voice.examples.slice(0, 2).map((ex, i) => (
            <blockquote key={i} className="pm-bv-example">{ex}</blockquote>
          ))}
          {voice.examples.length > 2 && (
            <span className="pm-bv-more">+{voice.examples.length - 2} more examples</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── BrandVoiceAdmin (exported) ────────────────────────────────

export default function BrandVoiceAdmin({ isAdmin }) {
  const [voices, setVoices]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);

  useEffect(() => {
    get('/api/outreach/brand-voices')
      .then(v => setVoices(Array.isArray(v) ? v : []))
      .catch(() => setVoices([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (data) => {
    const voice = await post('/api/outreach/brand-voices', data);
    setVoices(prev => {
      const filtered = data.isDefault ? prev.map(v => ({ ...v, isDefault: false })) : prev;
      return [...filtered, voice];
    });
    setShowForm(false);
    toast.success(`Voice "${voice.name}" created.`);
  };

  const handleUpdate = async (data) => {
    const voice = await patch(`/api/outreach/brand-voices/${editing.id}`, data);
    setVoices(prev => {
      const updated = prev.map(v => v.id === voice.id ? voice : (data.isDefault ? { ...v, isDefault: false } : v));
      return updated;
    });
    setEditing(null);
    toast.success(`Voice "${voice.name}" updated.`);
  };

  const handleDelete = async (id) => {
    const voice = voices.find(v => v.id === id);
    if (!window.confirm(`Delete brand voice "${voice?.name}"?`)) return;
    try {
      await del(`/api/outreach/brand-voices/${id}`);
      setVoices(prev => prev.filter(v => v.id !== id));
      toast.success('Voice deleted.');
    } catch (err) {
      toast.error(err.message ?? 'Delete failed.');
    }
  };

  if (loading) {
    return <div className="pm-outreach-loading"><div className="pm-outreach-spinner" /></div>;
  }

  return (
    <div className="pm-bv-admin">
      <div className="pm-bv-admin-header">
        <div>
          <h3 className="pm-bv-admin-title">
            <i className="fas fa-microphone-alt" aria-hidden="true" /> Brand Voices
          </h3>
          <p className="pm-bv-admin-subtitle">
            Define the tones Gemini uses when rewriting content. Provide example sentences so the AI can match your style.
          </p>
        </div>
        {isAdmin && !showForm && !editing && (
          <button className="cpm-btn cpm-btn--primary" onClick={() => setShowForm(true)}>
            <i className="fas fa-plus" aria-hidden="true" /> New Voice
          </button>
        )}
      </div>

      {(showForm || editing) && isAdmin && (
        <div className="pm-bv-form-wrap">
          <VoiceForm
            initial={editing}
            onSave={editing ? handleUpdate : handleCreate}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </div>
      )}

      {voices.length === 0 && !showForm ? (
        <div className="pm-outreach-empty">
          <i className="fas fa-microphone-slash" aria-hidden="true" />
          <p>No brand voices yet.{isAdmin ? ' Create your first one above.' : ''}</p>
        </div>
      ) : (
        <div className="pm-bv-list">
          {voices.map(v => (
            <VoiceCard
              key={v.id}
              voice={v}
              onEdit={isAdmin ? (voice) => { setEditing(voice); setShowForm(false); } : () => {}}
              onDelete={isAdmin ? handleDelete : () => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
