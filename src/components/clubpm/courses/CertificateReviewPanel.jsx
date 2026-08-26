import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  listPendingCertificates,
  reviewCertificate,
  certificateFileUrl,
} from '../../../api/clubPmClient';

// The pending-certificate queue, for admins. Deliberately NOT course-scoped:
// a reviewer works a queue of submissions, not one course at a time, so this
// lists every PENDING certificate across every course, oldest first.

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function ReviewRow({ cert, onDone }) {
  const [note, setNote]           = useState('');
  const [completedOn, setDate]    = useState(cert.completedOn?.slice(0, 10) ?? '');
  const [busy, setBusy]           = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const original = cert.completedOn?.slice(0, 10) ?? '';
  const corrected = completedOn !== original;

  const decide = async (decision) => {
    if (decision === 'REJECTED' && !note.trim()) {
      toast.error('Say why — the member sees this note');
      return;
    }
    setBusy(true);
    try {
      await reviewCertificate(cert.id, {
        decision,
        note: note.trim() || null,
        // Only send a corrected date when the admin actually changed it.
        completedOn: corrected ? completedOn : undefined,
      });
      toast.success(decision === 'APPROVED' ? 'Approved' : 'Sent back');
      onDone();
    } catch (err) {
      toast.error(err?.message || 'Could not record that decision');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="cpm-cert-review-row">
      <div className="cpm-cert-review-meta">
        <strong>{cert.member?.displayName ?? 'Unknown member'}</strong>
        <span>{cert.training?.name}</span>
        <span className="cpm-cert-review-sub">
          Submitted {fmtDate(cert.createdAt)}
          {cert.expiresOn ? ` · would expire ${fmtDate(cert.expiresOn)}` : ' · never expires'}
        </span>
      </div>

      {/* An <object> renders both PDFs and images without branching on mime
          type. The link beneath is the fallback when a browser blocks the
          cross-origin session cookie the proxy route relies on. */}
      <object
        className="cpm-cert-review-frame"
        data={certificateFileUrl(cert.id)}
        type={cert.fileMimeType || 'application/pdf'}
        aria-label={`${cert.member?.displayName ?? 'Member'}'s ${cert.training?.name ?? ''} certificate`}
      >
        <a href={certificateFileUrl(cert.id)} target="_blank" rel="noopener noreferrer">
          Open {cert.fileName}
        </a>
      </object>

      <div className="cpm-cert-review-actions">
        <label className="cpm-form-label" htmlFor={`cert-date-${cert.id}`}>
          Completion date {corrected && '(corrected)'}
        </label>
        <input
          id={`cert-date-${cert.id}`}
          className="cpm-form-input"
          type="date"
          value={completedOn}
          onChange={(e) => setDate(e.target.value)}
        />

        {rejecting && (
          <textarea
            className="cpm-form-input"
            rows={2}
            value={note}
            autoFocus
            placeholder="What's wrong with it? The member sees this."
            onChange={(e) => setNote(e.target.value)}
          />
        )}

        <div className="cpm-cert-review-buttons">
          <button
            className="clubpm-btn-primary"
            type="button"
            disabled={busy}
            onClick={() => decide('APPROVED')}
          >
            <i className="fas fa-circle-check" aria-hidden="true" /> Approve
          </button>
          {rejecting ? (
            <>
              <button
                className="clubpm-btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => decide('REJECTED')}
              >
                <i className="fas fa-paper-plane" aria-hidden="true" /> Send back
              </button>
              <button
                className="clubpm-btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => { setRejecting(false); setNote(''); }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="clubpm-btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              <i className="fas fa-circle-xmark" aria-hidden="true" /> Reject…
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function CertificateReviewPanel() {
  const [certs, setCerts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPendingCertificates();
      setCerts(data?.certificates ?? []);
      setError('');
    } catch (err) {
      setError(err?.message || 'Could not load the review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="cpm-training-empty">Loading the review queue…</p>;
  if (error)   return <p className="cpm-training-empty">{error}</p>;

  if (!certs.length) {
    return (
      <p className="cpm-training-empty">
        <i className="fas fa-circle-check" aria-hidden="true" /> Nothing waiting for review.
      </p>
    );
  }

  return (
    <div className="cpm-cert-review">
      <p className="cpm-training-note">
        {certs.length} certificate{certs.length === 1 ? '' : 's'} awaiting review, oldest first.
      </p>
      <ul className="cpm-cert-review-list">
        {certs.map((c) => <ReviewRow key={c.id} cert={c} onDone={load} />)}
      </ul>
    </div>
  );
}
