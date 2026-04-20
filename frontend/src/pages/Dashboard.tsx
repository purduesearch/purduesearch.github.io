import { useState, useEffect } from "react";
import { get } from "../api/client";
import { useAuth } from "../App";
import type { Project, Task } from "../types";
import ProjectCard from "../components/ProjectCard";
import TaskList from "../components/TaskList";

export default function Dashboard() {
  const { member } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      get<Project[]>("/api/projects"),
      member ? get<{ tasks: Task[] }>("/api/members/me").then((m) => m.tasks) : Promise.resolve([]),
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
          Dashboard
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          {member ? `Welcome back, ${member.displayName.split(" ")[0]}` : "Project overview"} ·{" "}
          {projects.length} project{projects.length !== 1 ? "s" : ""} active
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Projects Grid */}
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">
            Projects
          </h2>
          {projects.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-[var(--color-text-muted)] text-lg mb-2">No projects yet</p>
              <p className="text-sm text-[var(--color-text-muted)]">
                Create a project from Slack using <code className="text-[var(--color-accent-primary)]">/pm</code>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((project, i) => (
                <div key={project.id} className={`animate-fade-in stagger-${Math.min(i + 1, 6)}`} style={{ opacity: 0 }}>
                  <ProjectCard project={project} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Tasks Sidebar */}
        <div className="lg:w-80 shrink-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">
            My Tasks
          </h2>
          <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: "0.2s", opacity: 0 }}>
            {myTasks.length === 0 ? (
              <p className="text-[var(--color-text-muted)] text-sm text-center py-6">
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
