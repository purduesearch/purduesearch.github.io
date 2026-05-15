import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { get } from "../api/client";
import type { Project } from "../types";
import GanttChart from "../components/GanttChart";

export default function GanttView() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    get<Project>(`/api/projects/${id}`)
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 text-center">
        <p className="text-[var(--color-text-muted)] text-lg">Project not found</p>
        <Link to="/" className="text-[var(--color-accent-primary)] text-sm mt-2 inline-block no-underline">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 animate-fade-in">
      <div className="mb-6">
        <Link
          to={`/projects/${project.id}`}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors no-underline mb-3 inline-block"
        >
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Gantt View
        </h1>
      </div>

      <div className="glass-card p-6 overflow-x-auto">
        {project.tasks.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-sm text-center py-12">
            No tasks to display. Create tasks to see the Gantt chart.
          </p>
        ) : (
          <GanttChart tasks={project.tasks} />
        )}
      </div>
    </div>
  );
}
