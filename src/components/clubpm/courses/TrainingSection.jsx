import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  submitCertificate,
  listMyCertificates,
  certificateFileUrl,
  trainingExampleUrl,
} from '../../../api/clubPmClient';

// The four statuses, their icons, and their colours. Font Awesome only — never
// emoji. `PENDING_REVIEW` exists because a section completes on upload while the
// certificate waits for an admin, so there is a real state between red and green.
export const CERT_STATUS = {
  UP_TO_DATE:     { cls: 'is-current',  icon: 'fas fa-circle-check',         label: 'Up to date' },
  PENDING_REVIEW: { cls: 'is-pending',  icon: 'fas fa-hourglass-half',       label: 'Awaiting review' },
  EXPIRED:        { cls: 'is-expired',  icon: 'fas fa-triangle-exclamation', label: 'Expired' },
  NOT_COMPLETED:  { cls: 'is-missing',  icon: 'fas fa-circle-xmark',         label: 'Not completed' },
};

const ROW_STATUS = {
  PENDING:  { cls: 'is-pending',  icon: 'fas fa-hourglass-half', label: 'Awaiting review' },
  APPROVED: { cls: 'is-current',  icon: 'fas fa-circle-check',   label: 'Approved' },
  REJECTED: { cls: 'is-missing',  icon: 'fas fa-circle-xmark',   label: 'Needs another look' },
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// Derived client-side purely for the chip at the top of the card. The server is
// still the authority — this is the same cascade as trainingService.deriveStatus.
function deriveStatus(certs) {
  const now = Date.now();
  const approved = certs.filter((c) => c.status === 'APPROVED');
  if (approved.some((c) => !c.expiresOn || new Date(c.expiresOn).getTime() > now)) return 'UP_TO_DATE';
  if (certs.some((c) => c.status === 'PENDING')) return 'PENDING_REVIEW';
  if (approved.length) return 'EXPIRED';
  return 'NOT_COMPLETED';
}

export default function TrainingSection({ section, onCompleted }) {
  const training = section.training;
  const [certs, setCerts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [file, setFile]           = useState(null);
  const [completedOn, setCompletedOn] = useState('');
  const [saving, setSaving]       = useState(false);
  const [showExample, setShowExample] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listMyCertificates(section.id);
      setCerts(data?.certificates ?? []);
    } catch {
      // A failed history load must not hide the upload form — the member can
      // still submit, which is the thing they came here to do.
      setCerts([]);
    } finally {
      setLoading(false);
    }
  }, [section.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!file)        { toast.error('Attach your certificate'); return; }
    if (!completedOn) { toast.error('Enter the completion date printed on it'); return; }
    setSaving(true);
    try {
      await submitCertificate(section.id, { file, completedOn });
      toast.success('Certificate submitted — an officer will review it');
      setFile(null);
      setCompletedOn('');
      await load();
      onCompleted?.();
    } catch (err) {
      toast.error(err?.message || 'Could not save that certificate');
    } finally {
      setSaving(false);
    }
  };

  if (!training) {
    return (
      <div className="cpm-card cpm-training-card">
        <p className="cpm-training-empty">
          <i className="fas fa-circle-info" aria-hidden="true" />{' '}
          This section has no training attached yet. Ask the course author to pick one.
        </p>
      </div>
    );
  }

  const status = CERT_STATUS[deriveStatus(certs)];

  return (
    <div className="cpm-card cpm-training-card">
      <header className="cpm-training-head">
        <div>
          <span className="cpm-training-provider">
            <i className="fas fa-building-columns" aria-hidden="true" /> {training.providerName}
          </span>
          <h3 className="cpm-training-name">{training.name}</h3>
        </div>
        <span className={`cpm-training-status ${status.cls}`}>
          <i className={status.icon} aria-hidden="true" /> {status.label}
        </span>
      </header>

      {training.description && <p className="cpm-training-desc">{training.description}</p>}

      {training.renewalMonths ? (
        <p className="cpm-training-renewal">
          <i className="fas fa-rotate" aria-hidden="true" />{' '}
          Renews every {training.renewalMonths} months.
        </p>
      ) : null}

      <div className="cpm-training-links">
        {training.courseUrl && (
          <a className="clubpm-btn-primary" href={training.courseUrl}
             target="_blank" rel="noopener noreferrer">
            <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /> Open training
          </a>
        )}
        {training.registrationUrl && (
          <a className="clubpm-btn-ghost" href={training.registrationUrl}
             target="_blank" rel="noopener noreferrer">
            <i className="fas fa-file-lines" aria-hidden="true" /> Registration instructions
          </a>
        )}
        {training.exampleFileId && (
          <button type="button" className="clubpm-btn-ghost"
                  onClick={() => setShowExample((v) => !v)}>
            <i className="fas fa-image" aria-hidden="true" />{' '}
            {showExample ? 'Hide example' : 'What should it look like?'}
          </button>
        )}
      </div>

      {showExample && training.exampleFileId && (
        <div className="cpm-training-example">
          <p className="cpm-training-example-cap">
            An example of an acceptable certificate. Yours will have your own name and date.
          </p>
          {/* An <object> rather than <img>: most certificates are PDFs, and this
              renders both without branching on mime type. The link beneath is the
              fallback for a browser that blocks the cross-origin session cookie. */}
          <object
            className="cpm-training-example-frame"
            data={trainingExampleUrl(training.id)}
            type={training.exampleMimeType || 'application/pdf'}
            aria-label={`Example ${training.name} certificate`}
          >
            <a href={trainingExampleUrl(training.id)} target="_blank" rel="noopener noreferrer">
              Open the example certificate
            </a>
          </object>
        </div>
      )}

      <form className="cpm-training-upload" onSubmit={submit}>
        <h4>Submit your certificate</h4>
        <label className="cpm-form-label" htmlFor={`cert-file-${section.id}`}>
          Certificate file (PDF or image)
        </label>
        <input
          id={`cert-file-${section.id}`}
          className="cpm-form-input"
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <label className="cpm-form-label" htmlFor={`cert-date-${section.id}`}>
          Completion date printed on the certificate
        </label>
        <input
          id={`cert-date-${section.id}`}
          className="cpm-form-input"
          type="date"
          value={completedOn}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setCompletedOn(e.target.value)}
        />

        <button className="clubpm-btn-primary" type="submit" disabled={saving}>
          {saving
            ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Uploading…</>
            : <><i className="fas fa-upload" aria-hidden="true" /> Submit certificate</>}
        </button>
        <p className="cpm-training-note">
          Submitting completes this section right away. An officer reviews it afterwards —
          you will hear back either way.
        </p>
      </form>

      {!loading && certs.length > 0 && (
        <div className="cpm-training-history">
          <h4>Your submissions</h4>
          <ul>
            {certs.map((c) => {
              const meta = ROW_STATUS[c.status] ?? ROW_STATUS.PENDING;
              return (
                <li key={c.id} className={`cpm-training-history-row ${meta.cls}`}>
                  <span className="cpm-training-history-status">
                    <i className={meta.icon} aria-hidden="true" /> {meta.label}
                  </span>
                  <a href={certificateFileUrl(c.id)} target="_blank" rel="noopener noreferrer">
                    {c.fileName}
                  </a>
                  <span className="cpm-training-history-dates">
                    Completed {fmtDate(c.completedOn)}
                    {c.expiresOn ? ` · expires ${fmtDate(c.expiresOn)}` : ''}
                  </span>
                  {c.status === 'REJECTED' && c.reviewNote && (
                    <span className="cpm-training-history-note">{c.reviewNote}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
