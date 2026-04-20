import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get } from '../../api/clubPmClient';
import GanttChart from '../../components/clubpm/GanttChart';

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="cpm-spinner" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="cpm-container" style={{ paddingTop: '3rem', paddingBottom: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.125rem' }}>Project not found</p>
        <Link to="/clubpm" style={{ color: 'var(--color-accent-primary)', fontSize: '0.875rem', marginTop: '0.5rem', display: 'inline-block', textDecoration: 'none' }}>
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="cpm-container cpm-animate-fade-in" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          to={`/clubpm/projects/${project.id}`}
          style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '0.75rem', display: 'inline-block', transition: 'color 0.2s' }}
        >
          ← {project.name}
        </Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Gantt View
        </h1>
      </div>

      <div className="cpm-glass-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
        {project.tasks.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '3rem 0' }}>
            No tasks to display. Create tasks to see the Gantt chart.
          </p>
        ) : (
          <GanttChart tasks={project.tasks} />
        )}
      </div>
    </div>
  );
}
