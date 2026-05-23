import React, { useState, useEffect, useMemo } from 'react';
import { get, post, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────

function substitute(text, vals) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k) => vals[k] || `{{${k}}}`);
}

const COMMON_CRONS = [
  { label: 'Every Monday 9 AM',  value: '0 9 * * 1' },
  { label: 'Every Friday 4 PM',  value: '0 16 * * 5' },
  { label: '1st of month, 8 AM', value: '0 8 1 * *' },
  { label: 'Every weekday 10 AM', value: '0 10 * * 1-5' },
];

// ── Template list view ────────────────────────────────────────

function TemplateList({ templates, onPick, onConfigureRecurrence, onDelete, loading }) {
  if (loading) {
    return <div className="pm-template-empty">Loading templates…</div>;
  }
  if (templates.length === 0) {
    return (
      <div className="pm-template-empty">
        No templates yet. Create one by toggling "Save as reusable template" on any new submission.
      </div>
    );
  }
  return (
    <div className="pm-template-list">
      {templates.map(t => {
        const recurrence = t.recurrences?.[0];
        return (
          <div key={t.id} className="pm-template-card">
            <div className="pm-template-card-header">
              <div>
                <div className="pm-template-card-title">{t.title}</div>
                <div className="pm-template-card-meta">
                  {t.type.replace('_', ' ')}
                  {(t.placeholders ?? []).length > 0 && (
                    <span className="pm-template-card-vars"> · {t.placeholders.length} variable{t.placeholders.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
              {recurrence?.active && (
                <span className="pm-template-card-recurring" title={`Cron: ${recurrence.cronExpression}`}>
                  <i className="fas fa-sync-alt" aria-hidden="true" /> recurring
                </span>
              )}
            </div>
            {t.content && (
              <div className="pm-template-card-preview">{t.content.slice(0, 120)}{t.content.length > 120 ? '…' : ''}</div>
            )}
            <div className="pm-template-card-actions">
              <button className="pm-template-action-btn primary" onClick={() => onPick(t)}>
                <i className="fas fa-magic" aria-hidden="true" /> Use
              </button>
              <button className="pm-template-action-btn" onClick={() => onConfigureRecurrence(t)}>
                <i className="fas fa-sync-alt" aria-hidden="true" /> {recurrence ? 'Edit recurrence' : 'Make recurring'}
              </button>
              <button className="pm-template-action-btn danger" onClick={() => onDelete(t)} title="Delete template">
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Instantiate dialog ────────────────────────────────────────

function InstantiateDialog({ template, onClose, onCreated }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const placeholders = template.placeholders ?? [];

  const previewTitle   = useMemo(() => substitute(template.title,    values), [template.title,    values]);
  const previewContent = useMemo(() => substitute(template.content,  values), [template.content,  values]);

  async function handleCreate() {
    setSaving(true);
    try {
      const created = await post(`/api/outreach/templates/${template.id}/instantiate`, { values });
      toast.success('Draft created from template');
      onCreated(created);
    } catch (err) {
      toast.error(err.message ?? 'Failed to instantiate');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pm-template-modal-backdrop" onClick={onClose}>
      <div className="pm-template-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-template-modal-title">
          <i className="fas fa-magic" aria-hidden="true" /> Fill template: <strong>{template.title}</strong>
        </div>
        {placeholders.length === 0 ? (
          <div className="pm-template-empty" style={{ padding: '8px 0' }}>
            This template has no placeholders. It will be instantiated as-is.
          </div>
        ) : (
          <div className="pm-template-vars">
            {placeholders.map(ph => (
              <div key={ph.key} className="pm-template-var-row">
                <label className="pm-template-var-label">
                  <code>{`{{${ph.key}}}`}</code>
                  {ph.description && <span className="pm-template-var-desc"> — {ph.description}</span>}
                </label>
                <input
                  type="text"
                  className="pm-template-var-input"
                  value={values[ph.key] ?? ''}
                  onChange={e => setValues(prev => ({ ...prev, [ph.key]: e.target.value }))}
                  placeholder={`value for ${ph.key}`}
                />
              </div>
            ))}
          </div>
        )}
        <div className="pm-template-preview">
          <div className="pm-template-preview-label">Preview</div>
          <div className="pm-template-preview-title">{previewTitle}</div>
          {previewContent && <div className="pm-template-preview-body">{previewContent}</div>}
        </div>
        <div className="pm-template-modal-footer">
          <button className="pm-template-action-btn" onClick={onClose}>Cancel</button>
          <button className="pm-template-action-btn primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recurrence dialog ─────────────────────────────────────────

function RecurrenceDialog({ template, onClose, onSaved }) {
  const existing = template.recurrences?.[0];
  const [cronExpression, setCron]   = useState(existing?.cronExpression ?? '0 9 * * 1');
  const [active, setActive]         = useState(existing?.active ?? true);
  const [defaultValues, setDefaults] = useState(existing?.defaultValues ?? {});
  const [saving, setSaving]         = useState(false);
  const placeholders = template.placeholders ?? [];

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await post(`/api/outreach/templates/${template.id}/recurrence`, {
        cronExpression,
        active,
        defaultValues,
      });
      toast.success('Recurrence saved');
      onSaved(saved);
    } catch (err) {
      toast.error(err.message ?? 'Failed to save recurrence');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return onClose();
    if (!window.confirm('Stop recurring instantiation for this template?')) return;
    setSaving(true);
    try {
      await del(`/api/outreach/templates/${template.id}/recurrence`);
      toast.success('Recurrence removed');
      onSaved(null);
    } catch (err) {
      toast.error(err.message ?? 'Failed to delete recurrence');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pm-template-modal-backdrop" onClick={onClose}>
      <div className="pm-template-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-template-modal-title">
          <i className="fas fa-sync-alt" aria-hidden="true" /> Recurrence for <strong>{template.title}</strong>
        </div>

        <div className="pm-template-var-row">
          <label className="pm-template-var-label">Cron expression</label>
          <input
            type="text"
            className="pm-template-var-input"
            value={cronExpression}
            onChange={e => setCron(e.target.value)}
            placeholder="0 9 * * 1"
          />
          <div className="pm-template-cron-presets">
            {COMMON_CRONS.map(p => (
              <button
                key={p.value}
                type="button"
                className="pm-template-cron-preset"
                onClick={() => setCron(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pm-template-var-row">
          <label className="pm-template-var-label">
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              style={{ marginRight: 6, accentColor: 'var(--pm-accent-teal)' }}
            />
            Active
          </label>
        </div>

        {placeholders.length > 0 && (
          <>
            <div className="pm-template-preview-label">Default placeholder values</div>
            <div className="pm-template-vars">
              {placeholders.map(ph => (
                <div key={ph.key} className="pm-template-var-row">
                  <label className="pm-template-var-label"><code>{`{{${ph.key}}}`}</code></label>
                  <input
                    type="text"
                    className="pm-template-var-input"
                    value={defaultValues[ph.key] ?? ''}
                    onChange={e => setDefaults(prev => ({ ...prev, [ph.key]: e.target.value }))}
                    placeholder={`default for ${ph.key}`}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="pm-template-modal-footer">
          {existing && (
            <button className="pm-template-action-btn danger" onClick={handleDelete} disabled={saving}>
              <i className="fas fa-trash" aria-hidden="true" /> Remove
            </button>
          )}
          <button className="pm-template-action-btn" onClick={onClose}>Cancel</button>
          <button className="pm-template-action-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TemplatePicker root ───────────────────────────────────────

export default function TemplatePicker({ isOpen, onClose, onTemplateInstantiated }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [instantiating, setInstantiating] = useState(null);
  const [configuring, setConfiguring] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    get('/api/outreach/templates')
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  async function handleDelete(template) {
    if (!window.confirm(`Delete template "${template.title}"? This also removes any recurrences.`)) return;
    try {
      await del(`/api/outreach/submissions/${template.id}`);
      setTemplates(prev => prev.filter(t => t.id !== template.id));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="pm-template-picker-backdrop" onClick={onClose}>
      <div className="pm-template-picker" onClick={e => e.stopPropagation()}>
        <div className="pm-template-picker-header">
          <div className="pm-template-picker-title">
            <i className="fas fa-clone" aria-hidden="true" />
            Template Library
          </div>
          <button className="pm-template-picker-close" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>
        <TemplateList
          templates={templates}
          loading={loading}
          onPick={t => setInstantiating(t)}
          onConfigureRecurrence={t => setConfiguring(t)}
          onDelete={handleDelete}
        />
      </div>

      {instantiating && (
        <InstantiateDialog
          template={instantiating}
          onClose={() => setInstantiating(null)}
          onCreated={(created) => {
            setInstantiating(null);
            onClose();
            onTemplateInstantiated?.(created);
          }}
        />
      )}

      {configuring && (
        <RecurrenceDialog
          template={configuring}
          onClose={() => setConfiguring(null)}
          onSaved={(saved) => {
            // Update local templates list with new recurrence
            setTemplates(prev => prev.map(t => {
              if (t.id !== configuring.id) return t;
              return { ...t, recurrences: saved ? [saved] : [] };
            }));
            setConfiguring(null);
          }}
        />
      )}
    </div>
  );
}
