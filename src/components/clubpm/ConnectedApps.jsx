import React, { useCallback, useEffect, useState } from 'react';
import { listOAuthGrants, updateOAuthGrantProjects, revokeOAuthGrant } from '../../api/clubPmClient';
import ConfirmInline from './ConfirmInline';

const SCOPE_LABELS = {
  'constellation.read': 'Read projects',
  'constellation.plan': 'Propose and apply changes',
  'constellation.plan.delete': 'Delete tasks',
  'constellation.contacts': 'See teammates\' contact details',
};

function when(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'never';
}

/**
 * Profile → Connected apps: Claude connections made through /clubpm/connect.
 * Lists each grant's projects and permissions, edits the project list, and
 * disconnects. Disconnecting revokes every token the grant issued.
 */
export default function ConnectedApps() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listOAuthGrants()
      .then(result => { setData(result); setError(null); })
      .catch(err => setError(err.message ?? 'Could not load connected apps.'));
  }, []);
  useEffect(load, [load]);

  function startEdit(grant) {
    setEditing(grant.id);
    setPicked(grant.projects.map(p => p.id));
  }
  function toggle(id) {
    setPicked(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));
  }
  async function save(grantId) {
    setBusy(true);
    try {
      await updateOAuthGrantProjects(grantId, picked);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message ?? 'Could not save those projects.');
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(grantId) {
    try {
      await revokeOAuthGrant(grantId);
      load();
    } catch (err) {
      setError(err.message ?? 'Could not disconnect that app.');
    }
  }

  if (!data && !error) return null;

  return (
    <div className="pm-connected-apps">
      <div className="cpm-form-label">Connected apps</div>
      {error && <p className="pm-connected-apps-error" role="alert">{error}</p>}
      {data && !data.grants.length && (
        <p className="pm-connected-apps-hint">
          No apps are connected. Add Constellation as a custom connector in Claude to manage your projects from a chat.
        </p>
      )}
      {data?.grants.map(grant => (
        <div className="pm-connected-app" key={grant.id}>
          <div className="pm-connected-app-head">
            <i className="fas fa-link" aria-hidden="true" />
            <div className="pm-connected-app-text">
              <div className="pm-connected-app-name">{grant.clientName}</div>
              <div className="pm-connected-app-meta">
                Connected {when(grant.createdAt)} · last used {when(grant.lastUsedAt)}
              </div>
            </div>
            <ConfirmInline
              label="Disconnect"
              prompt={`Disconnect ${grant.clientName}?`}
              confirmLabel="Disconnect"
              icon={null}
              onConfirm={() => disconnect(grant.id)}
              className="cpm-btn cpm-btn-ghost"
            />
          </div>
          <div className="pm-connected-app-scopes">
            {grant.scopes.map(scope => <span key={scope} className="cpm-tag">{SCOPE_LABELS[scope] ?? scope}</span>)}
          </div>
          {editing === grant.id ? (
            <fieldset className="pm-connected-app-edit" disabled={busy}>
              <legend className="cpm-form-label">Projects this app can see</legend>
              {data.projects.map(project => (
                <label className="pm-connected-app-project" key={project.id}>
                  <input type="checkbox" checked={picked.includes(project.id)} onChange={() => toggle(project.id)} />
                  <span>{project.name}</span>
                  {project.isLead && <span className="pm-connected-app-lead">Lead</span>}
                </label>
              ))}
              <div className="pm-connected-app-actions">
                <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button type="button" className="clubpm-btn-primary" onClick={() => save(grant.id)}>
                  {busy ? 'Saving…' : 'Save projects'}
                </button>
              </div>
            </fieldset>
          ) : (
            <div className="pm-connected-app-projects">
              <span>
                {grant.projects.length ? grant.projects.map(p => p.name).join(', ') : 'No projects selected'}
                {grant.unavailableProjectCount > 0 && ` (+${grant.unavailableProjectCount} you can no longer open)`}
              </span>
              <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => startEdit(grant)}>Edit projects</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
