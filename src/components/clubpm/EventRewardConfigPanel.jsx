import { useCallback, useEffect, useState } from "react";
import { get, put } from "../../api/clubPmClient";

const EVENT_LABEL = {
  TIME_LOG_HOUR:                "Time logged (per hour)",
  TASK_COMPLETE_ADMIN_CREATED:  "Task complete (admin-created)",
  TASK_COMPLETE_MEMBER_CREATED: "Task complete (member-created)",
  MILESTONE_HIT:                "Milestone hit",
  KUDOS_RECEIVED:               "Kudos received",
  BLOG_POST_PUBLISHED:          "Blog post published",
  EARLY_DELIVERY_BONUS:         "Early delivery bonus (+50%)",
};

export default function EventRewardConfigPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    get("/api/event-config")
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateLocal = (eventType, patch) => {
    setRows(prev => prev.map(r => r.eventType === eventType ? { ...r, ...patch } : r));
  };

  const save = async (row) => {
    setSavingId(row.eventType);
    try {
      await put(`/api/event-config/${row.eventType}`, {
        autoApprove:    row.autoApprove,
        xpAmount:       row.xpAmount,
        doubloonAmount: row.doubloonAmount,
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <details className="cpm-event-config-panel">
      <summary>
        <i className="fas fa-sliders-h" aria-hidden="true" />
        <span>Event reward config</span>
      </summary>
      {loading && <div className="cpm-pending-empty">Loading…</div>}
      {!loading && (
        <table className="cpm-event-config-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Auto-approve</th>
              <th>XP</th>
              <th>Doubloons</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.eventType}>
                <td>{EVENT_LABEL[r.eventType] ?? r.eventType}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={r.autoApprove}
                    onChange={e => updateLocal(r.eventType, { autoApprove: e.target.checked })}
                  />
                </td>
                <td><input type="number" value={r.xpAmount} onChange={e => updateLocal(r.eventType, { xpAmount: Number(e.target.value) })} /></td>
                <td><input type="number" value={r.doubloonAmount} onChange={e => updateLocal(r.eventType, { doubloonAmount: Number(e.target.value) })} /></td>
                <td>
                  <button type="button" disabled={savingId === r.eventType} onClick={() => save(r)}>
                    {savingId === r.eventType ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
