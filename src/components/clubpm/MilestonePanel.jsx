import React, { useState, useEffect } from "react";
import { get, post, patch, del } from "../../api/clubPmClient";

export default function MilestonePanel({ projectId, onRefresh }) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");

  const fetchMilestones = () => {
    get(`/api/milestones/project/${projectId}`)
      .then(setMilestones)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMilestones(); }, [projectId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await post("/api/milestones", { name: newName, projectId, dueDate: newDate || undefined });
    setNewName("");
    setNewDate("");
    fetchMilestones();
    onRefresh?.();
  };

  const handleDelete = async (id) => {
    await del(`/api/milestones/${id}`);
    fetchMilestones();
    onRefresh?.();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 border-[var(--clubpm-accent-primary)] border-t-transparent clubpm-animate-spin" /></div>;

  return (
    <div className="max-w-3xl clubpm-animate-fade-in">
      <form onSubmit={handleCreate} className="flex gap-3 mb-6">
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="New milestone name" className="clubpm-input flex-1 py-2 px-3" />
        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="clubpm-input py-2 px-3" />
        <button type="submit" className="clubpm-btn-primary whitespace-nowrap">+ Add</button>
      </form>

      {milestones.length === 0 ? (
        <div className="text-center py-12"><p className="text-4xl mb-3">🎯</p><p className="text-[var(--clubpm-text-muted)]">No milestones yet. Create one above.</p></div>
      ) : (
        <div className="space-y-4">
          {milestones.map(m => (
            <div key={m.id} className="clubpm-glass-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-[var(--clubpm-text-primary)]">{m.name}</h3>
                  {m.dueDate && <p className="text-xs text-[var(--clubpm-text-muted)] mt-1">📅 Due: {new Date(m.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
                  <div className="mt-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2.5 rounded-full bg-[var(--clubpm-surface-300)] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[var(--clubpm-accent-primary)] to-[var(--clubpm-accent-cyan)] transition-all duration-500" style={{ width: `${m.completionPct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-[var(--clubpm-text-primary)]">{m.completionPct}%</span>
                    </div>
                    <p className="text-[10px] text-[var(--clubpm-text-muted)] mt-1">{m.taskCounts.done}/{m.taskCounts.total} tasks complete</p>
                  </div>
                </div>
                <button onClick={() => handleDelete(m.id)} className="text-[var(--clubpm-text-muted)] hover:text-red-400 transition-colors text-sm" title="Delete milestone">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
