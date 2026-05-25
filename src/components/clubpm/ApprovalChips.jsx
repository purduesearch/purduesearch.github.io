import React, { useState, useEffect, useCallback } from 'react';
import { get, post, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

function Avatar({ member, size = 22 }) {
  const initials = (member.displayName ?? '?').slice(0, 2).toUpperCase();
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.displayName}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size < 20 ? 8 : 9, fontWeight: 700, color: 'var(--clubpm-text-secondary)',
      }}
    >
      {initials}
    </div>
  );
}

/**
 * ApprovalChips — Avatar row showing required approvers, ✓ if approved.
 *
 * Props:
 *   submissionId
 *   currentMemberId — who's logged in (controls "Approve" button visibility)
 *   isAdmin         — admins can approve even if not required
 *   onAdvanced      — called when this approval advances status to APPROVED
 */
export default function ApprovalChips({ submissionId, currentMemberId, isAdmin, onAdvanced }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    get(`/api/outreach/submissions/${submissionId}/approvals`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [submissionId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return null;
  if (data.required.length === 0) return null;  // no approval workflow configured

  const approvedIds = new Set((data.approvals ?? []).map(a => a.approverId));
  const myApproval = data.approvals.find(a => a.approverId === currentMemberId);
  const canIApprove = data.required.includes(currentMemberId) || isAdmin;
  const allApproved = data.complete;

  async function handleApprove() {
    setSubmitting(true);
    try {
      const result = await post(`/api/outreach/submissions/${submissionId}/approvals`, {});
      if (result.advanced) {
        toast.success('All approvals complete — submission moved to APPROVED');
        onAdvanced?.();
      } else {
        toast.success('Approval recorded');
      }
      load();
    } catch (err) {
      toast.error(err.message ?? 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetract() {
    if (!myApproval) return;
    setSubmitting(true);
    try {
      await del(`/api/outreach/submissions/${submissionId}/approvals/${currentMemberId}`);
      toast.success('Approval retracted');
      load();
    } catch (err) {
      toast.error(err.message ?? 'Failed to retract');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pm-approval-row">
      <div className="pm-approval-stack">
        {data.required.map(id => {
          const isApproved = approvedIds.has(id);
          const member = isApproved
            ? data.approvals.find(a => a.approverId === id)?.approver
            : data.remaining.find(m => m.id === id);
          if (!member) return null;
          return (
            <div
              key={id}
              className={`pm-approval-chip${isApproved ? ' pm-approval-chip--ok' : ' pm-approval-chip--pending'}`}
              title={`${member.displayName} ${isApproved ? '· approved' : '· pending'}`}
            >
              <Avatar member={member} size={20} />
              {isApproved
                ? <i className="fas fa-check pm-approval-check" aria-hidden="true" />
                : <i className="far fa-circle pm-approval-pending-icon" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      <span className="pm-approval-count">
        {data.approvals.length}/{data.required.length}
        {allApproved && <span className="pm-approval-complete-tag"> · complete</span>}
      </span>
      {canIApprove && !allApproved && (
        myApproval
          ? (
            <button className="pm-approval-action retract" onClick={handleRetract} disabled={submitting}>
              <i className="fas fa-undo" aria-hidden="true" /> Retract
            </button>
          )
          : (
            <button className="pm-approval-action approve" onClick={handleApprove} disabled={submitting}>
              {submitting ? <i className="fas fa-spinner fa-spin" aria-hidden="true" /> : <><i className="fas fa-check" aria-hidden="true" /> Approve</>}
            </button>
          )
      )}
    </div>
  );
}
