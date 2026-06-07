import { useCallback, useEffect, useState } from "react";
import { get, put } from "../../api/clubPmClient";

export default function PendingRewardsPanel() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [adjusted, setAdjusted] = useState({ xp: 0, doubloons: 0 });
  const [eventConfigs, setEventConfigs] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    get("/api/rewards/pending")
      .then(setPending)
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    get("/api/event-config")
      .then(setEventConfigs)
      .catch(() => {});
  }, []);

  const handleApprove = async (id, overrides) => {
    await put(`/api/rewards/pending/${id}`, { action: "approve", ...overrides });
    setEditingId(null);
    load();
    window.dispatchEvent(new CustomEvent("clubpm:pending-rewards-updated"));
  };

  const handleReject = async (id) => {
    await put(`/api/rewards/pending/${id}`, { action: "reject" });
    load();
    window.dispatchEvent(new CustomEvent("clubpm:pending-rewards-updated"));
  };

  return (
    <details className="cpm-pending-panel" open={pending.length > 0}>
      <summary>
        <i className="fas fa-clipboard-check" aria-hidden="true" />
        <span>Pending reward approvals</span>
        <span className="cpm-pending-count">{pending.length}</span>
      </summary>
      {loading && <div className="cpm-pending-empty">Loading…</div>}
      {!loading && pending.length === 0 && (
        <div className="cpm-pending-empty">No pending rewards. Member-created task completions appear here.</div>
      )}
      {!loading && pending.length > 0 && (
        <ul className="cpm-pending-list">
          {pending.map(p => {
            const meta = p.metadata ?? {};

            // Calculate reward estimate from logged time
            const timeLogConfig = eventConfigs.find(c => c.eventType === "TIME_LOG_HOUR");
            const hourlyXp = timeLogConfig?.xpAmount ?? 10;
            const hourlyDoubloons = timeLogConfig?.doubloonAmount ?? 10;

            const memberLogs = p.task?.timeLogs?.filter(log => log.memberId === p.memberId) || [];
            const memberMinutes = memberLogs.reduce((sum, log) => sum + log.minutes, 0);
            const memberHours = memberMinutes / 60;
            const estimatedXp = Math.min(100, Math.round(memberHours * hourlyXp));
            const estimatedDoubloons = Math.min(100, Math.round(memberHours * hourlyDoubloons));

            return (
              <li key={p.id} className="cpm-pending-row" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
                  <div className="cpm-pending-row-main">
                    <div className="cpm-pending-avatar" aria-hidden="true">
                      {p.member.avatarUrl
                        ? <img src={p.member.avatarUrl} alt="" />
                        : (p.member.displayName || "?").charAt(0)}
                    </div>
                    <div className="cpm-pending-info">
                      <div className="cpm-pending-title">{meta.taskTitle ?? p.eventType}</div>
                      <div className="cpm-pending-meta">
                        <span>{p.member.displayName}</span>
                        <span aria-hidden="true">·</span>
                        <span>+{p.proposedXp} XP</span>
                        <span aria-hidden="true">·</span>
                        <span>+{p.proposedDoubloons} <i className="fas fa-coins" aria-hidden="true" /></span>
                      </div>
                    </div>
                  </div>

                  {editingId === p.id ? (
                    <div className="cpm-pending-adjust" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '12px', background: 'var(--clubpm-surface-200, var(--pm-bg-elevated, #1a1e2a))', borderRadius: '8px', border: '1px solid var(--clubpm-border, var(--pm-border, rgba(255,255,255,0.08)))' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label>XP <input type="number" min="0" max="100" value={adjusted.xp} onChange={e => setAdjusted(s => ({ ...s, xp: Math.min(100, Math.max(0, Number(e.target.value))) }))} style={{ padding: '4px 8px', width: '70px', borderRadius: '4px', border: '1px solid var(--clubpm-border)' }} /></label>
                        <label>Doubloons <input type="number" min="0" max="100" value={adjusted.doubloons} onChange={e => setAdjusted(s => ({ ...s, doubloons: Math.min(100, Math.max(0, Number(e.target.value))) }))} style={{ padding: '4px 8px', width: '70px', borderRadius: '4px', border: '1px solid var(--clubpm-border)' }} /></label>
                        <button type="button" className="cpm-btn-primary" onClick={() => handleApprove(p.id, { adjustedXp: adjusted.xp, adjustedDoubloons: adjusted.doubloons })}>Save</button>
                        <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                      {memberHours > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--pm-text-secondary, #9ea3ab)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <i className="fas fa-calculator" aria-hidden="true" style={{ color: 'var(--clubpm-accent-primary, #0ea5e9)' }} />
                          <span>Estimated from logged time ({memberHours.toFixed(1)} hrs): <strong>{estimatedXp} XP</strong> and <strong>{estimatedDoubloons} Db</strong></span>
                          <button type="button" style={{ padding: '2px 8px', fontSize: '11px', background: 'var(--pm-accent-teal, #00e5c3)', color: '#0d0f14', border: 'none', fontWeight: 'bold' }} onClick={() => setAdjusted({ xp: estimatedXp, doubloons: estimatedDoubloons })}>Apply Estimate</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="cpm-pending-actions">
                      <button type="button" className="cpm-btn-primary" onClick={() => handleApprove(p.id)}>Approve</button>
                      <button type="button" onClick={() => { setEditingId(p.id); setAdjusted({ xp: p.proposedXp, doubloons: p.proposedDoubloons }); }}>Adjust</button>
                      <button type="button" className="cpm-btn-danger" onClick={() => handleReject(p.id)}>Reject</button>
                    </div>
                  )}
                </div>

                {p.task && (
                  <details className="cpm-pending-history-details" style={{ marginTop: '4px', width: '100%' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--pm-text-secondary, #8892a4)', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}>
                      <i className="fas fa-history" aria-hidden="true" />
                      <span>Task History & Time Logs</span>
                    </summary>
                    <div style={{
                      marginTop: '8px',
                      padding: '12px',
                      background: 'var(--clubpm-surface-200, var(--pm-bg-elevated, #1a1e2a))',
                      borderRadius: '8px',
                      border: '1px solid var(--clubpm-border, var(--pm-border, rgba(255,255,255,0.08)))',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      {/* Time logs */}
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--clubpm-text-muted, #636b7a)' }}>Time Logged by Assignees</div>
                        {p.task.timeLogs && p.task.timeLogs.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {p.task.timeLogs.map(log => (
                              <div key={log.id} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: 'var(--pm-text-primary, #f0f2f7)' }}>
                                <span>{log.member?.displayName || 'Member'}:</span>
                                <span style={{ fontWeight: '500' }}>{(log.minutes / 60).toFixed(1)} hrs ({log.minutes} mins){log.note ? ` - "${log.note}"` : ''}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--clubpm-text-muted, #636b7a)' }}>No time logged on this task yet.</div>
                        )}
                      </div>

                      {/* Task activities */}
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--clubpm-text-muted, #636b7a)' }}>Task Activity History</div>
                        {p.task.activities && p.task.activities.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {p.task.activities.slice(0, 10).map(act => (
                              <div key={act.id} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', color: 'var(--clubpm-text-secondary, #9ea3ab)' }}>
                                <span>
                                  <strong>{act.member?.displayName || 'System'}:</strong> {act.type.toLowerCase().replace(/_/g, ' ')}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--clubpm-text-muted, #636b7a)' }}>
                                  {new Date(act.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--clubpm-text-muted, #636b7a)' }}>No task activities logged yet.</div>
                        )}
                      </div>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
