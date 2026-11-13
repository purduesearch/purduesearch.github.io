import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getOAuthPendingRequest, submitOAuthConsent } from '../../api/clubPmClient';

const READ = 'constellation.read';
const PLAN = 'constellation.plan';
const DELETE = 'constellation.plan.delete';

function needsLogin(error) {
  return error?.status === 401 || error?.message === 'invalid_token';
}

function connectionError(error) {
  if (needsLogin(error)) return 'Sign in to Constellation again to finish connecting Claude.';
  const messages = {
    invalid_request: 'This connection request is unavailable or has expired. Start a new connection from Claude.',
    invalid_scope: 'The requested permissions have changed. Start a new connection from Claude.',
    access_denied: 'You no longer have permission for this connection or one of its projects. Start a new connection from Claude.',
    temporarily_unavailable: 'The connection service is temporarily unavailable. Try again in a moment.',
  };
  if (messages[error?.message]) return messages[error.message];
  if (error?.status >= 500) return messages.temporarily_unavailable;
  return error?.message || 'Could not finish connecting. Start a new connection from Claude if this request has expired.';
}

export function oauthCallbackUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('The connection returned an invalid callback. Start a new connection from Claude.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('The connection returned an invalid callback. Start a new connection from Claude.');
  }
  return url.href;
}

const redirectToCallback = url => window.location.assign(url);

export default function ConnectConsent({ onRedirect = redirectToCallback }) {
  const { pathname, search } = useLocation();
  const requests = new URLSearchParams(search).getAll('req');
  const requestId = requests.length === 1 && /^[A-Za-z0-9_-]{1,200}$/.test(requests[0]) ? requests[0] : null;
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [planning, setPlanning] = useState(false);
  const [deletion, setDeletion] = useState(false);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    let expiryTimer;
    setPending(null);
    setSelectedProjects([]);
    setDeletion(false);
    setPlanning(false);
    setExpired(false);
    setError('');
    setRequiresLogin(false);
    setLoading(!!requestId);
    setBusy(false);
    inFlight.current = false;
    if (!requestId) {
      setError('This connection link is incomplete. Start a new connection from Claude.');
      return () => { generation.current++; };
    }
    getOAuthPendingRequest(requestId).then(data => {
      if (current !== generation.current) return;
      const remaining = new Date(data.expiresAt).getTime() - Date.now();
      if (data.id !== requestId || !Array.isArray(data.projects) || !Array.isArray(data.scopes) || !data.scopes.includes(READ)) {
        throw new Error('This connection request is unavailable. Start a new connection from Claude.');
      }
      if (!Number.isFinite(remaining) || remaining <= 0) {
        setExpired(true);
        throw new Error('This connection request has expired. Start a new connection from Claude.');
      }
      setPending(data);
      setPlanning(!!data.member?.isAdmin && data.scopes.includes(PLAN));
      expiryTimer = setTimeout(() => {
        if (current === generation.current) {
          setExpired(true);
          setError('This connection request has expired. Start a new connection from Claude.');
        }
      }, Math.min(remaining, 2_147_483_647));
    }).catch(err => {
      if (current === generation.current) {
        setRequiresLogin(needsLogin(err));
        setError(connectionError(err));
      }
    }).finally(() => {
      if (current === generation.current) setLoading(false);
    });
    return () => {
      generation.current++;
      clearTimeout(expiryTimer);
    };
  }, [requestId, retry]);

  const canPlan = !!pending?.member?.isAdmin && pending.scopes.includes(PLAN);
  const canDelete = canPlan && pending.scopes.includes(DELETE);

  function toggleProject(id) {
    setSelectedProjects(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  }

  async function decide(approve) {
    if (!pending || expired || inFlight.current || (approve && !selectedProjects.length)) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setRequiresLogin(false);
    const current = generation.current;
    const scopes = [READ];
    if (canPlan && planning) scopes.push(PLAN);
    if (canDelete && planning && deletion) scopes.push(DELETE);
    try {
      const result = await submitOAuthConsent({
        pendingId: pending.id,
        approve,
        scopes: approve ? scopes : [],
        projectIds: approve ? selectedProjects : [],
      });
      if (current !== generation.current) return;
      onRedirect(oauthCallbackUrl(result.redirectUrl));
      // Keep the synchronous guard locked while the browser leaves this page.
    } catch (err) {
      if (current === generation.current) {
        setRequiresLogin(needsLogin(err));
        setError(connectionError(err));
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div className="pm-connect">
      <section className="pm-connect-card" aria-labelledby="pm-connect-title" aria-busy={loading || busy}>
        <div className="pm-connect-heading">
          <div className="pm-connect-icon"><i className="fas fa-link" aria-hidden="true" /></div>
          <div><div className="pm-connect-eyebrow">Connected apps</div><h1 id="pm-connect-title">Connect Claude</h1></div>
        </div>
        {loading && <div className="pm-connect-message" role="status">Loading connection request…</div>}
        {error && <div className="pm-connect-error" role="alert">{error}</div>}
        {requiresLogin && <div className="pm-connect-actions"><Link to={`/clubpm/login?returnTo=${encodeURIComponent(pathname + search)}`}>Sign in again</Link></div>}
        {!loading && !pending && (
          <div className="pm-connect-actions">
            {requestId && !expired && !requiresLogin && <button type="button" className="pm-connect-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button>}
            <Link to="/clubpm/profile">Back to your account</Link>
          </div>
        )}
        {!loading && pending && <>
          <p className="pm-connect-intro"><strong>{pending.client.name}</strong> wants access to your Constellation account.</p>
          <fieldset className="pm-connect-fieldset" disabled={busy || expired}>
            <legend>Permissions</legend>
            <label className="pm-connect-option">
              <input type="checkbox" checked disabled />
              <span><strong>Read selected projects</strong><small>Read tasks, comments, milestones, members, and recent activity in the projects you select.</small></span>
            </label>
            {canPlan && <label className="pm-connect-option">
              <input type="checkbox" checked={planning} onChange={event => {
                setPlanning(event.target.checked);
                if (!event.target.checked) setDeletion(false);
              }} />
              <span><strong>Allow project changes</strong><small>Preview and apply action plans. Every change checks your current admin permissions.</small></span>
            </label>}
            {canDelete && <label className="pm-connect-option pm-connect-option--delete">
              <input type="checkbox" checked={deletion} disabled={!planning || busy || expired} onChange={event => setDeletion(event.target.checked)} />
              <span><strong>Allow task deletion</strong><small>Action plans may permanently delete tasks. Off unless you choose it.</small></span>
            </label>}
            {!pending.member?.isAdmin && <p className="pm-connect-note">Your connection is read-only. Project changes require current administrator permissions.</p>}
          </fieldset>
          <fieldset className="pm-connect-fieldset" disabled={busy || expired} aria-describedby="pm-connect-project-note">
            <legend>Choose projects</legend>
            <p className="pm-connect-note" id="pm-connect-project-note">Only the projects you select will be shared.</p>
            <div className="pm-connect-projects">
              {pending.projects.map(project => (
                <label className="pm-connect-option pm-connect-project" key={project.id}>
                  <input type="checkbox" aria-label={`Share ${project.name}`} checked={selectedProjects.includes(project.id)} onChange={() => toggleProject(project.id)} />
                  <span><strong>{project.name}</strong><small>{project.isLead ? 'You lead this project' : 'Available to your account'}{project.status === 'ARCHIVED' ? ' · Archived' : ''}</small></span>
                </label>
              ))}
            </div>
            {!pending.projects.length && <p className="pm-connect-note">There are no projects available to connect to your account.</p>}
            {!!pending.projects.length && <p className="pm-connect-note" aria-live="polite">{selectedProjects.length} selected</p>}
          </fieldset>
          <p className="pm-connect-account-note">You can change these projects or disconnect later in <strong>Profile → Customize → Connected apps</strong>.</p>
          <div className="pm-connect-actions">
            <button type="button" className="pm-connect-secondary" disabled={busy || expired} onClick={() => decide(false)}>Deny</button>
            <button type="button" className="pm-connect-primary" disabled={busy || expired || !selectedProjects.length} onClick={() => decide(true)}>{busy ? 'Returning to Claude…' : 'Connect selected projects'}</button>
          </div>
        </>}
      </section>
    </div>
  );
}
