// Public badge verification page (/badges/:id). Renders what GET /api/public/badges/:id returns. The signature is
// checked on the server with jose's jwtVerify; the root app does not ship a browser JOSE build, so this page reports
// the server's result in plain language. Never shows an email, name, photo or member id (decision 5).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import { getPublicBadge } from '../../api/clubPmClient';

const fmt = d => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

export function verifyReason(code) {
  if (!code) return 'The server could not check the signature.';
  if (code === 'KEY_MISMATCH') return 'This badge was issued under a previous signing key; the server could not check it against the current key.';
  if (code === 'KEY_UNSET') return 'The server has no signing key set up right now, so it could not check the signature.';
  if (code === 'KEY_INVALID') return 'The server signing key is misconfigured, so it could not check the signature.';
  if (code === 'HASH_MISMATCH') return 'The stored credential does not match its recorded fingerprint. Treat this badge as unverified.';
  if (code === 'SIGNATURE_INVALID') return 'The signature did not match. Treat this badge as unverified.';
  if (code.startsWith('CLAIM_MISMATCH')) return 'The credential contents do not match what Purdue SEARCH issues. Treat this badge as unverified.';
  return 'The server could not check the signature.';
}

/** Defence in depth for decision 5: drop anything that looks like an email address. */
const safe = v => (typeof v === 'string' && v.includes('@') ? '' : v);

export default function BadgeVerify() {
  const { id } = useParams();
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading', data: null });
    getPublicBadge(id)
      .then(data => { if (live) setState({ status: data ? 'ok' : 'missing', data }); })
      .catch(() => { if (live) setState({ status: 'error', data: null }); });
    return () => { live = false; };
  }, [id]);

  const { status, data } = state;
  const name = safe(data?.achievement?.name) || 'Badge';
  const criteria = safe(data?.achievement?.description);
  const issuerName = safe(data?.issuer?.name) || 'Purdue SEARCH';
  const issuerUrl = typeof data?.issuer?.url === 'string' && /^https?:\/\//.test(data.issuer.url) ? data.issuer.url : null;
  const value = safe(data?.resultText) || (data?.value ?? '');
  const jwt = typeof data?.jwt === 'string' && !data.jwt.includes('@') ? data.jwt : null;

  return (
    <>
      <SEOHead
        title={status === 'ok' ? `${name} badge` : 'Badge verification'}
        description="Check a Purdue SEARCH badge: who issued it, what it was awarded for, and whether it is still valid."
        canonical={`/badges/${encodeURIComponent(id || '')}`}
        noindex
      />
      <Navbar />
      <main id="main-content" className="badge-verify-page">
        <p className="badge-verify-eyebrow">Badge verification</p>
        {status === 'loading' && <p className="badge-verify-note" role="status">Loading…</p>}
        {status === 'missing' && (
          <>
            <h1>No badge with this id</h1>
            <p className="badge-verify-note">Check the link you were given. It may have been copied incompletely.</p>
          </>
        )}
        {status === 'error' && (
          <p className="badge-verify-note" role="alert">This badge could not be loaded right now. Please try again later.</p>
        )}
        {status === 'ok' && (
          <article className="badge-verify-card" aria-labelledby="badge-verify-title">
            {data.revoked && (
              <p className="badge-verify-banner badge-verify-banner--revoked" role="alert">
                <i className="fas fa-ban" aria-hidden="true" /> This badge was revoked by its holder{data.revokedAt ? ` on ${fmt(data.revokedAt)}` : ''}. It is no longer valid.
              </p>
            )}
            <h1 id="badge-verify-title">{name}</h1>
            {criteria && <p className="badge-verify-criteria">{criteria}</p>}
            <dl className="badge-verify-facts">
              <div><dt>Issuer</dt><dd>{issuerUrl ? <a href={issuerUrl}>{issuerName}</a> : issuerName}</dd></div>
              <div><dt>Achievement</dt><dd>{name}</dd></div>
              <div><dt>Value</dt><dd>{value}</dd></div>
              <div><dt>Issued</dt><dd>{fmt(data.issuedAt)}</dd></div>
              <div><dt>Status</dt><dd>{data.revoked ? 'Revoked' : 'Active'}</dd></div>
            </dl>
            {data.verified ? (
              <p className="badge-verify-check badge-verify-check--ok">
                <i className="fas fa-circle-check" aria-hidden="true" /> Signature verified by the server against the current Purdue SEARCH signing key.
              </p>
            ) : (
              <p className="badge-verify-check badge-verify-check--fail">
                <i className="fas fa-triangle-exclamation" aria-hidden="true" /> Signature not verified. {verifyReason(data.verifyError)}
              </p>
            )}
            <p className="badge-verify-note">
              This is an Open Badges 3.0 credential. It identifies its holder only by a salted hash, so it shows no name or contact details.
            </p>
            {jwt && (
              <details className="badge-verify-raw">
                <summary>Show the signed credential (JWT)</summary>
                <code>{jwt}</code>
              </details>
            )}
          </article>
        )}
      </main>
      <Footer />
    </>
  );
}
