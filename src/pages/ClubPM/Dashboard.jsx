import { useState, useEffect } from 'react';
import { get } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import ProjectCard from '../../components/clubpm/ProjectCard';
import TaskList from '../../components/clubpm/TaskList';

export default function Dashboard() {
  const { member } = useClubPmAuth();
  const [projects, setProjects] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      get('/api/projects'),
      member ? get('/api/members/me').then((m) => m.tasks) : Promise.resolve([]),
    ])
      .then(([projectData, taskData]) => {
        setProjects(projectData);
        setMyTasks(taskData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [member]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="cpm-spinner" />
      </div>
    );
  }

  return (
    <div className="cpm-container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      {/* Header */}
      <div className="cpm-animate-fade-in" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {member ? `Welcome back, ${member.displayName.split(' ')[0]}` : 'Project overview'} ·{' '}
          {projects.length} project{projects.length !== 1 ? 's' : ''} active
        </p>
      </div>

      <div className="cpm-dashboard-layout">
        {/* Projects Grid */}
        <div style={{ flex: 1 }}>
          <h2 style={{
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem',
          }}>
            Projects
          </h2>
          {projects.length === 0 ? (
            <div className="cpm-glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                No projects yet
              </p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                Create a project from Slack using{' '}
                <code style={{ color: 'var(--color-accent-primary)' }}>/pm</code>
              </p>
            </div>
          ) : (
            <div className="cpm-project-grid">
              {projects.map((project, i) => (
                <div
                  key={project.id}
                  className={`cpm-animate-fade-in cpm-stagger-${Math.min(i + 1, 6)}`}
                >
                  <ProjectCard project={project} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Tasks Sidebar */}
        <div style={{ width: '20rem', flexShrink: 0 }}>
          <h2 style={{
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem',
          }}>
            My Tasks
          </h2>
          <div className="cpm-glass-card cpm-animate-fade-in" style={{ padding: '1rem', animationDelay: '0.2s' }}>
            {myTasks.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
                No tasks assigned to you
              </p>
            ) : (
              <TaskList tasks={myTasks} showProject />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
