import React, { useState, useEffect, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { patch } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'blockquote'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'image'],
  ['clean'],
];

/**
 * NewsletterEditor — Quill-based rich-text editor with live HTML preview.
 *
 * Props:
 *   submissionId — non-null after the parent has saved the submission once
 *   initialHtml  — string
 *   onChange     — (html) => void — local state mirror
 *   onAutosave   — (html) => Promise — optional autosave debounce
 */
export default function NewsletterEditor({ submissionId, initialHtml, onChange }) {
  const [html, setHtml] = useState(initialHtml ?? '');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const autosaveRef = useRef(null);

  useEffect(() => { setHtml(initialHtml ?? ''); }, [initialHtml]);

  function handleChange(value) {
    setHtml(value);
    onChange?.(value);
    // Autosave to backend if a submission exists, debounced 1500ms
    if (submissionId) {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
      autosaveRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await patch(`/api/outreach/submissions/${submissionId}/newsletter-html`, { html: value });
        } catch {
          // silent — user can manually save via parent
        } finally {
          setSaving(false);
        }
      }, 1500);
    }
  }

  return (
    <div className="pm-newsletter-editor">
      <div className="pm-newsletter-editor-header">
        <span className="pm-newsletter-editor-label">
          <i className="fas fa-envelope-open-text" aria-hidden="true" style={{ marginRight: 6, color: 'var(--pm-accent-teal)' }} />
          Newsletter Body
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {saving && (
            <span style={{ fontSize: 10, color: 'var(--clubpm-text-secondary)' }}>
              <i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> saving…
            </span>
          )}
          <button
            type="button"
            className="pm-newsletter-preview-toggle"
            onClick={() => setShowPreview(p => !p)}
          >
            <i className={`fas fa-${showPreview ? 'pen' : 'eye'}`} aria-hidden="true" />
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="pm-newsletter-preview" dangerouslySetInnerHTML={{ __html: html || '<p style="color: #888;">Empty newsletter — start writing.</p>' }} />
      ) : (
        <div className="pm-newsletter-quill-wrap">
          <ReactQuill
            theme="snow"
            value={html}
            onChange={handleChange}
            modules={{ toolbar: TOOLBAR }}
            placeholder="Write your newsletter…"
          />
        </div>
      )}
    </div>
  );
}
