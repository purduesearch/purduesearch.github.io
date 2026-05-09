import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { get, post } from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import ProjectCard from "../../components/clubpm/ProjectCard";
import TaskList from "../../components/clubpm/TaskList";

// ── Helpers ──────────────────────────────────────────────────

function activityIcon(item) {
  if (item.type === "comment") return "💬";
  if (item.content?.startsWith("**Standup**")) return "🧍";
  return "📋";
}

function activityLabel(item) {
  if (item.type === "comment") {
    return (
      <>
        Commented on{" "}
        <span className="font-semibold text-[var(--clubpm-accent-primary)]">
          {item.task?.title}
        </span>
        : {item.content?.slice(0, 80)}{item.content?.length > 80 ? "…" : ""}
      </>
    );
  }
  if (item.content?.startsWith("**Standup**")) {
    const lines = item.content.split("\n\n");
    const worked = lines.find(l => l.startsWith("**Worked on:**"))?.replace("**Worked on:** ", "") ?? "";
    const next = lines.find(l => l.startsWith("**Next:**"))?.replace("**Next:** ", "") ?? "";
    const blockers = lines.find(l => l.startsWith("**Blockers:**"))?.replace("**Blockers:** ", "") ?? "";
    return (
      <div className="space-y-0.5 text-xs">
        {worked && <div><span className="text-[var(--clubpm-text-muted)]">Worked on:</span> {worked.slice(0, 60)}{worked.length > 60 ? "…" : ""}</div>}
        {next && <div><span className="text-[var(--clubpm-text-muted)]">Up next:</span> {next.slice(0, 60)}{next.length > 60 ? "…" : ""}</div>}
        {blockers && blockers !== "None" && <div><span className="text-[var(--clubpm-text-muted)]">Blockers:</span> {blockers.slice(0, 60)}</div>}
      </div>
    );
  }
  return item.content?.slice(0, 100) ?? "";
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Create Project Modal ──────────────────────────────────────

function CreateProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("ENGINEERING");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const project = await post("/api/projects", {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        targetDate: targetDate || undefined,
      });
      onCreate(project);
      onClose();
    } catch (err) {
      setError(err.message ?? "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="clubpm-glass-card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[var(--clubpm-text-primary)]">Create Project</h2>
          <button
            onClick={onClose}
            className="text-[var(--clubpm-text-muted)] hover:text-[var(--clubpm-text-primary)] text-xl leading-none"
          >×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--clubpm-text-muted)] mb-1">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. Lunar Rover"
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--clubpm-surface-300)] border border-[var(--clubpm-border)] text-[var(--clubpm-text-primary)] placeholder-[var(--clubpm-text-muted)] focus:outline-none focus:border-[var(--clubpm-accent-primary)] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--clubpm-text-muted)] mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this project about?"
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--clubpm-surface-300)] border border-[var(--clubpm-border)] text-[var(--clubpm-text-primary)] placeholder-[var(--clubpm-text-muted)] focus:outline-none focus:border-[var(--clubpm-accent-primary)] transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--clubpm-text-muted)] mb-1">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--clubpm-surface-300)] border border-[var(--clubpm-border)] text-[var(--clubpm-text-primary)] focus:outline-none focus:border-[var(--clubpm-accent-primary)] transition-colors"
            >
              <option value="ENGINEERING">Engineering</option>
              <option value="RESEARCH">Research</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--clubpm-text-muted)] mb-1">Target Date</label>
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--clubpm-surface-300)] border border-[var(--clubpm-border)] text-[var(--clubpm-text-primary)] focus:outline-none focus:border-[var(--clubpm-accent-primary)] transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[var(--clubpm-surface-300)] text-[var(--clubpm-text-primary)] hover:bg-[var(--clubpm-surface-400)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[var(--clubpm-accent-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Dashboard ─────────────────────────────────────────────────

export default function Dashboard() {
  const { member } = useClubPmAuth();
  const [projects, setProjects] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);

  useEffect(() => {
    Promise.all([
      get("/api/projects"),
      member ? get("/api/members/me").then((m) => m.tasks ?? []) : Promise.resolve([]),
      get("/api/activity"),
    ])
      .then(([projectData, taskData, activityData]) => {
        setProjects(projectData);
        setMyTasks(taskData);
        setActivity(activityData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [member]);

  if (loading) {
    return (
      <div className="clubpm-app flex items-center justify-center min-h-[60vh] bg-[var(--clubpm-surface-50)]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--clubpm-accent-primary)] border-t-transparent clubpm-animate-spin" />
      </div>
    );
  }

  return (
    <div className="clubpm-app min-h-screen bg-[var(--clubpm-surface-50)]">
      <div className="w-full px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 clubpm-animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold text-[var(--clubpm-text-primary)] mb-1">
              Dashboard
            </h1>
            <p className="text-[var(--clubpm-text-secondary)]">
              {member ? `Welcome back, ${member.displayName.split(" ")[0]}` : "Project overview"} ·{" "}
              {projects.length} project{projects.length !== 1 ? "s" : ""} active
            </p>
          </div>
          <button
            onClick={() => setShowCreateProject(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--clubpm-accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <span className="text-lg leading-none">+</span> New Project
          </button>
        </div>

        {/* Recent Activity — full width strip at top */}
        <div className="mb-8 clubpm-animate-fade-in" style={{ animationDelay: "0.1s", opacity: 0 }}>
          <h2 className="text-sm font-semibold text-[var(--clubpm-text-muted)] uppercase tracking-wider mb-3">
            Recent Activity
          </h2>
          <div className="clubpm-glass-card p-4">
            {activity.length === 0 ? (
              <p className="text-[var(--clubpm-text-muted)] text-sm text-center py-4">
                No recent activity — post a standup or leave a comment to get started!
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--clubpm-border)]">
                {activity.map((item) => (
                  <div key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="text-base shrink-0 w-5 text-center mt-0.5">{activityIcon(item)}</div>
                    <div className="shrink-0">
                      {item.author?.avatarUrl ? (
                        <img src={item.author.avatarUrl} alt={item.author?.displayName} className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[var(--clubpm-accent-primary)] flex items-center justify-center text-xs font-bold text-white">
                          {item.author?.displayName?.charAt(0) ?? "?"}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-semibold text-[var(--clubpm-text-primary)]">
                          {item.author?.displayName ?? "Unknown"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--clubpm-surface-300)] text-[var(--clubpm-text-muted)]">
                          {item.project?.name}
                        </span>
                        <span className="text-[10px] text-[var(--clubpm-text-muted)] ml-auto">
                          {timeAgo(item.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--clubpm-text-secondary)]">
                        {activityLabel(item)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom two-column layout */}
        <div className="flex flex-col xl:flex-row gap-8">
          {/* My Tasks */}
          <div className="xl:w-72 shrink-0">
            <h2 className="text-sm font-semibold text-[var(--clubpm-text-muted)] uppercase tracking-wider mb-4">
              My Tasks
            </h2>
            <div className="clubpm-glass-card p-4 clubpm-animate-fade-in" style={{ animationDelay: "0.2s", opacity: 0 }}>
              {myTasks.length === 0 ? (
                <p className="text-[var(--clubpm-text-muted)] text-sm text-center py-6">
                  No tasks assigned to you
                </p>
              ) : (
                <TaskList tasks={myTasks} showProject />
              )}
            </div>
          </div>

          {/* Projects Grid */}
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-[var(--clubpm-text-muted)] uppercase tracking-wider mb-4">
              Active Projects
            </h2>
            {projects.length === 0 ? (
              <div className="clubpm-glass-card p-12 text-center">
                <p className="text-[var(--clubpm-text-muted)] text-lg mb-3">No projects yet</p>
                <p className="text-sm text-[var(--clubpm-text-muted)] mb-6">
                  Create your first project to get started
                </p>
                <button
                  onClick={() => setShowCreateProject(true)}
                  className="px-5 py-2 rounded-lg bg-[var(--clubpm-accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  + New Project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project, i) => (
                  <div key={project.id} className={`clubpm-animate-fade-in clubpm-stagger-${Math.min(i + 1, 6)}`} style={{ opacity: 0 }}>
                    <ProjectCard project={project} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreate={(project) => setProjects(prev => [project, ...prev])}
        />
      )}
    </div>
  );
}
