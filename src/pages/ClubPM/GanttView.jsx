import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { get } from "../../api/clubPmClient";
import GanttChart from "../../components/clubpm/GanttChart";

export default function GanttView() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    get(`/api/projects/${id}`)
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="clubpm-app flex items-center justify-center min-h-[60vh] bg-[var(--clubpm-surface-50)]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--clubpm-accent-primary)] border-t-transparent clubpm-animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="clubpm-app min-h-screen bg-[var(--clubpm-surface-50)]">
        <div className="max-w-7xl mx-auto px-6 py-12 text-center">
          <p className="text-[var(--clubpm-text-muted)] text-lg">Project not found</p>
          <Link to="/clubpm" className="text-[var(--clubpm-accent-primary)] text-sm mt-2 inline-block no-underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="clubpm-app min-h-screen bg-[var(--clubpm-surface-50)]">
      <div className="w-full px-8 py-8 clubpm-animate-fade-in">
        <div className="mb-6">
          <Link
            to={`/clubpm/projects/${project.id}`}
            className="text-sm text-[var(--clubpm-text-muted)] hover:text-[var(--clubpm-text-primary)] transition-colors no-underline mb-3 inline-block"
          >
            ← {project.name}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--clubpm-text-primary)]">
            Gantt View
          </h1>
        </div>

        <div className="clubpm-glass-card p-6 overflow-x-auto">
          {project.tasks.length === 0 ? (
            <p className="text-[var(--clubpm-text-muted)] text-sm text-center py-12">
              No tasks to display. Create tasks to see the Gantt chart.
            </p>
          ) : (
            <GanttChart tasks={project.tasks} />
          )}
        </div>
      </div>
    </div>
  );
}
