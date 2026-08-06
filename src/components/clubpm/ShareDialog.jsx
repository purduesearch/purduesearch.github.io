import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  get,
  listDocAccess,
  setDocAccess,
  removeDocAccess,
  setDocClubAccess,
} from '../../api/clubPmClient';

const LEVEL_LABELS = {
  VIEW:    'Can view',
  COMMENT: 'Can comment',
  EDIT:    'Can edit',
  OWNER:   'Owner',
};

// OWNER is deliberately absent: it is never a valid club-wide tier.
const CLUB_LEVELS = ['VIEW', 'COMMENT', 'EDIT'];

/**
 * Share/permissions modal for one collaborative document.
 *
 * Portaled to <body> on purpose: ClubPM panels use revealStagger transforms,
 * and a transformed ancestor becomes the containing block for position:fixed
 * children, which would trap the overlay inside the panel.
 */
export default function ShareDialog({ docType, docId, onClose }) {
  const [grants, setGrants]       = useState([]);
  const [clubLevel, setClubLevel] = useState(null);
  const [myLevel, setMyLevel]     = useState(null);
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');

  const refresh = useCallback(() => (
    listDocAccess(docType, docId)
      .then((data) => {
        setGrants(data.grants ?? []);
        setClubLevel(data.clubLevel ?? null);
        setMyLevel(data.myLevel ?? null);
        setError(null);
      })
      .catch((err) => setError(err?.message || 'Could not load sharing settings'))
  ), [docType, docId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      refresh(),
      get('/api/members').then((data) => { if (!cancelled) setMembers(data ?? []); }).catch(() => {}),
    ]).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canGrantOwner = myLevel === 'OWNER';
  const memberLevels = canGrantOwner
    ? ['VIEW', 'COMMENT', 'EDIT', 'OWNER']
    : ['VIEW', 'COMMENT', 'EDIT'];

  const grantedIds = useMemo(
    () => new Set(grants.map((g) => g.memberId)),
    [grants],
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => !grantedIds.has(m.id))
      .filter((m) => (m.displayName ?? '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [members, grantedIds, search]);

  const run = useCallback(async (fn, failMessage) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      toast.error(err?.message || failMessage);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleAdd = (memberId) => {
    setSearch('');
    run(() => setDocAccess(docType, docId, memberId, 'COMMENT'), 'Could not add member');
  };

  const handleLevel = (memberId, level) =>
    run(() => setDocAccess(docType, docId, memberId, level), 'Could not change access');

  const handleRemove = (memberId) =>
    run(() => removeDocAccess(docType, docId, memberId), 'Could not remove access');

  const handleClub = (value) =>
    run(() => setDocClubAccess(docType, docId, value || null), 'Could not change club access');

  const modal = (
    <div
      className="cpm-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cpm-share-dialog" role="dialog" aria-modal="true" aria-label="Share document">
        <div className="cpm-share-header">
          <h2 className="cpm-share-title">
            <i className="fas fa-user-plus" aria-hidden="true" /> Share
          </h2>
          <button type="button" className="cpm-icon-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="cpm-share-empty">
            <i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> Loading…
          </div>
        ) : error ? (
          <div className="cpm-share-empty">{error}</div>
        ) : (
          <div className="cpm-share-body">
            <div className="cpm-share-picker">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Add people by name"
                aria-label="Add people by name"
              />
              {candidates.length > 0 && (
                <ul className="cpm-share-suggestions">
                  {candidates.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => handleAdd(m.id)} disabled={busy}>
                        {m.avatarUrl
                          ? <img src={m.avatarUrl} alt="" className="cpm-share-avatar" />
                          : <span className="cpm-share-avatar cpm-share-avatar--fallback">
                              <i className="fas fa-user" aria-hidden="true" />
                            </span>}
                        <span>{m.displayName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {grants.length === 0 ? (
              <div className="cpm-share-empty">No one has been given access yet.</div>
            ) : (
              <ul className="cpm-share-list">
                {grants.map((g) => (
                  <li key={g.id} className="cpm-share-row">
                    {g.member?.avatarUrl
                      ? <img src={g.member.avatarUrl} alt="" className="cpm-share-avatar" />
                      : <span className="cpm-share-avatar cpm-share-avatar--fallback">
                          <i className="fas fa-user" aria-hidden="true" />
                        </span>}
                    <span className="cpm-share-name">{g.member?.displayName ?? 'Unknown member'}</span>
                    <select
                      className="cpm-share-level"
                      value={g.level}
                      disabled={busy}
                      onChange={(e) => handleLevel(g.memberId, e.target.value)}
                      aria-label={`Access level for ${g.member?.displayName ?? 'member'}`}
                    >
                      {memberLevels.map((lvl) => (
                        <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>
                      ))}
                      {/* An existing OWNER grant stays visible to non-owners, but
                          they cannot select it for anyone else. */}
                      {!canGrantOwner && g.level === 'OWNER' && (
                        <option value="OWNER">{LEVEL_LABELS.OWNER}</option>
                      )}
                    </select>
                    <button
                      type="button"
                      className="cpm-icon-btn"
                      onClick={() => handleRemove(g.memberId)}
                      disabled={busy}
                      title="Remove access"
                      aria-label={`Remove access for ${g.member?.displayName ?? 'member'}`}
                    >
                      <i className="fas fa-xmark" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="cpm-share-club">
              <span className="cpm-share-club-icon">
                <i className="fas fa-users" aria-hidden="true" />
              </span>
              <span className="cpm-share-name">Everyone in the club</span>
              <select
                className="cpm-share-level"
                value={clubLevel ?? ''}
                disabled={busy}
                onChange={(e) => handleClub(e.target.value)}
                aria-label="Club-wide access level"
              >
                <option value="">No access</option>
                {CLUB_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="cpm-share-footer">
          <button type="button" className="clubpm-btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
