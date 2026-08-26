import React, { useEffect, useState } from 'react';
import { myTrainingStatus } from '../../../api/clubPmClient';
import { CERT_STATUS } from './TrainingSection';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;

/**
 * The member's own compliance standing.
 *
 * Renders only on your OWN profile — another member's safety-training record is
 * not public within the club, and the backing route is `my-status`, which only
 * ever answers for the caller.
 */
export default function TrainingStatusStrip({ isSelf }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSelf) { setLoading(false); return; }
    let cancelled = false;
    myTrainingStatus()
      .then((d) => { if (!cancelled) setRows(d?.trainings ?? []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isSelf]);

  // Nothing to say when there is no registry yet, and nothing to say on someone
  // else's profile. Render nothing rather than an empty card.
  if (!isSelf || loading || !rows.length) return null;

  return (
    <section className="cpm-card cpm-training-strip">
      <h3>
        <i className="fas fa-certificate" aria-hidden="true" /> Safety trainings
      </h3>
      <ul>
        {rows.map((r) => {
          const meta = CERT_STATUS[r.status] ?? CERT_STATUS.NOT_COMPLETED;
          const expiry = fmtDate(r.expiresOn);
          return (
            <li key={r.trainingId} className={`cpm-training-strip-row ${meta.cls}`}>
              <span className="cpm-training-strip-status" title={meta.label}>
                <i className={meta.icon} aria-hidden="true" />
              </span>
              <span className="cpm-training-strip-name">{r.name}</span>
              <span className="cpm-training-strip-provider">{r.providerName}</span>
              <span className="cpm-training-strip-expiry">
                {r.status === 'UP_TO_DATE' && expiry ? `Valid to ${expiry}` : meta.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
