// Projects the member belongs to. Rows expand to show a status breakdown of
// their tasks; projects with no tasks are hidden unless toggled on.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const STATUS_ORDER = [
  ["DONE", "Done"],
  ["IN_PROGRESS", "In progress"],
  ["BLOCKED", "Blocked"],
  ["TODO", "To do"],
];

function ProjectRow({ project, ready }) {
  const [open, setOpen] = useState(false);
  const tasks = project.tasks ?? [];
  const counts = tasks.reduce((m, t) => { m[t.status] = (m[t.status] ?? 0) + 1; return m; }, {});
  const done = counts.DONE ?? 0;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const dot = { ACTIVE: "cpm-dot-active", PAUSED: "cpm-dot-paused", COMPLETED: "cpm-dot-done", ARCHIVED: "cpm-dot-muted" }[project.status] ?? "cpm-dot-muted";

  return (
    <div className={`cpm-pf-proj${open ? " is-open" : ""}`}>
      <button type="button" className="cpm-pf-proj-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="cpm-pf-proj-name"><span className={`cpm-status-dot ${dot}`} /> {project.name}</span>
        <span className="cpm-pf-bar cpm-pf-bar--sm" aria-hidden="true"><i style={{ width: ready ? `${pct}%` : 0 }} /></span>
        <small>{tasks.length} task{tasks.length === 1 ? "" : "s"}</small>
        <i className="fas fa-chevron-down cpm-pf-proj-chev" aria-hidden="true" />
      </button>
      <div className="cpm-pf-proj-more">
        <div>
          {tasks.length === 0 ? (
            <p>No tasks assigned yet.</p>
          ) : (
            <ul className="cpm-pf-proj-counts">
              {STATUS_ORDER.filter(([s]) => counts[s]).map(([s, label]) => (
                <li key={s} data-status={s}><b>{counts[s]}</b> {label}</li>
              ))}
            </ul>
          )}
          <Link to={`/clubpm/projects/${project.id}`} className="cpm-skill-link">Open project <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsTab({ projects }) {
  const [hideEmpty, setHideEmpty] = useState(true);
  const [ready, setReady] = useState(false);

  // Bars start empty and fill once the tab is on screen.
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const list = useMemo(
    () => projects.slice().sort((a, b) => (b.tasks?.length ?? 0) - (a.tasks?.length ?? 0) || a.name.localeCompare(b.name)),
    [projects],
  );
  const empty = list.filter(p => !(p.tasks?.length)).length;
  const shown = hideEmpty ? list.filter(p => p.tasks?.length) : list;

  return (
    <div className="cpm-profile-card">
      <div className="cpm-pf-head">
        <h2>Projects <span className="cpm-skill-count">{list.length}</span></h2>
        {empty > 0 && (
          <button type="button" className="cpm-pf-pill" aria-pressed={!hideEmpty} onClick={() => setHideEmpty(h => !h)}>
            {hideEmpty ? `Show ${empty} with no tasks` : "Hide projects with no tasks"}
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="cpm-pf-empty">{list.length === 0 ? "No projects yet." : "No projects with tasks. Use the toggle to show the rest."}</p>
      ) : shown.map(p => <ProjectRow key={p.id} project={p} ready={ready} />)}
    </div>
  );
}
