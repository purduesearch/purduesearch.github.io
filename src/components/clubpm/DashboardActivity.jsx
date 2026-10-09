import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../../api/clubPmClient";
import { describeEvent } from "./ProjectActivity";

export default function DashboardActivity({ memberId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setItems([]);
    get("/api/activity/dashboard")
      .then(data => { if (active) setItems(data.items ?? []); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [memberId, attempt]);

  useEffect(() => {
    window.addEventListener("pm-projects-refresh", refresh);
    return () => window.removeEventListener("pm-projects-refresh", refresh);
  }, [refresh]);

  return (
    <section className="pm-dashboard-activity" aria-labelledby="dashboard-activity-title" aria-busy={loading}>
      <header className="pm-dashboard-activity-header">
        <div>
          <h2 id="dashboard-activity-title">Activity</h2>
          <p>Latest changes in projects you contribute to</p>
        </div>
        <button type="button" className="pm-dashboard-activity-refresh" onClick={refresh} disabled={loading} aria-label="Refresh activity">
          <i className="fas fa-rotate" aria-hidden="true" />
        </button>
      </header>
      {loading ? <p className="pm-dashboard-activity-status" role="status">Loading activity…</p>
        : error ? <div className="pm-dashboard-activity-status" role="alert">Activity couldn’t be loaded. <button type="button" onClick={refresh}>Try again</button></div>
        : items.length === 0 ? <p className="pm-dashboard-activity-status">No recent activity in your projects yet.</p>
        : <ul className="pm-dashboard-activity-list">
          {items.map(log => (
            <li key={log.id}>
              <div className="pm-dashboard-activity-body">
                <div>{describeEvent(log)}</div>
                <Link to={`/clubpm/projects/${log.project.id}?tab=insights&view=activity`}>{log.project.name}</Link>
              </div>
              <time dateTime={log.createdAt} title={new Date(log.createdAt).toLocaleString()}>
                {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </time>
            </li>
          ))}
        </ul>}
    </section>
  );
}
