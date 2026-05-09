import React, { useState } from "react";
import { createPortal } from "react-dom";
import { patch, post } from "../../api/clubPmClient";
import MemberBadge from "./MemberBadge";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";

export default function TaskModal({ task, onClose, onUpdate }) {
  const { member } = useClubPmAuth();
  const [commentText, setCommentText] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [attachmentInput, setAttachmentInput] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const newComment = await post(`/api/tasks/${task.id}/comments`, { content: commentText });
      onUpdate({ ...task, comments: [...(task.comments || []), newComment] });
      setCommentText("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!tagInput.trim()) return;
    const newTags = [...(task.tags || []), tagInput.trim().toLowerCase()];
    try {
      await patch(`/api/tasks/${task.id}`, { tags: newTags });
      onUpdate({ ...task, tags: newTags });
      setTagInput("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddAttachment = async (e) => {
    e.preventDefault();
    if (!attachmentInput.trim()) return;
    const newAttachments = [...(task.attachments || []), attachmentInput.trim()];
    try {
      await patch(`/api/tasks/${task.id}`, { attachments: newAttachments });
      onUpdate({ ...task, attachments: newAttachments });
      setAttachmentInput("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!subtaskTitle.trim()) return;
    try {
      const newSub = await post(`/api/tasks/${task.id}/subtasks`, { title: subtaskTitle });
      onUpdate({ ...task, subtasks: [...(task.subtasks || []), newSub] });
      setSubtaskTitle("");
    } catch (err) { console.error(err); }
  };

  const handleToggleSubtask = async (sub) => {
    const newStatus = sub.status === "DONE" ? "TODO" : "DONE";
    try {
      await patch(`/api/tasks/${sub.id}`, { status: newStatus });
      onUpdate({ ...task, subtasks: (task.subtasks || []).map(s => s.id === sub.id ? { ...s, status: newStatus } : s) });
    } catch (err) { console.error(err); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="clubpm-glass-card w-full max-w-3xl max-h-[90vh] flex flex-col relative bg-[var(--clubpm-surface-100)]">
        
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--clubpm-text-muted)] hover:text-white">
          ✕
        </button>

        <div className="p-6 border-b border-[var(--clubpm-border)]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-semibold px-2 py-1 rounded bg-[var(--clubpm-surface-300)]">{task.status}</span>
            <span className="text-xs font-semibold px-2 py-1 rounded text-red-400 bg-red-500/10 border border-red-500/20">{task.priority}</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{task.title}</h2>
          <p className="text-[var(--clubpm-text-secondary)] whitespace-pre-wrap">{task.description || "No description provided."}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
          
          {/* Main Left: Comments & Attachments */}
          <div className="flex-1 space-y-8">
            
            {/* Attachments */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--clubpm-text-muted)] mb-3">Attachments</h3>
              <div className="flex flex-col gap-2 mb-3">
                {(task.attachments || []).length === 0 ? (
                  <span className="text-sm text-[var(--clubpm-text-muted)]">No attachments yet.</span>
                ) : (
                  (task.attachments || []).map((att, i) => (
                    <a key={i} href={att} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--clubpm-accent-primary)] hover:underline truncate max-w-full block">
                      🔗 {att}
                    </a>
                  ))
                )}
              </div>
              <form onSubmit={handleAddAttachment} className="flex gap-2">
                <input type="url" value={attachmentInput} onChange={e => setAttachmentInput(e.target.value)} placeholder="Paste URL (Google Drive, Figma, etc.)" className="clubpm-input flex-1 py-1 px-3 text-sm" />
                <button type="submit" className="clubpm-btn-primary py-1 px-3 text-sm">Add</button>
              </form>
            </section>

            {/* Comments */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--clubpm-text-muted)] mb-3">Discussion</h3>
              <div className="space-y-4 mb-4">
                {(task.comments || []).map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <MemberBadge member={comment.author} size="sm" />
                    <div className="flex-1 bg-[var(--clubpm-surface-200)] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{comment.author?.displayName}</span>
                        <span className="text-xs text-[var(--clubpm-text-muted)]">{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-[var(--clubpm-text-secondary)] whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddComment} className="mt-4">
                <textarea 
                  value={commentText} 
                  onChange={e => setCommentText(e.target.value)} 
                  placeholder="Add a comment... Use @username to notify" 
                  className="clubpm-input w-full min-h-[80px] p-3 mb-2 resize-none"
                />
                <div className="flex justify-end">
                  <button type="submit" className="clubpm-btn-primary">Post Comment</button>
                </div>
              </form>
            </section>

            {/* Subtasks */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--clubpm-text-muted)] mb-3">Subtasks</h3>
              <div className="space-y-1.5 mb-3">
                {(task.subtasks || []).length === 0 ? (
                  <span className="text-sm text-[var(--clubpm-text-muted)]">No subtasks yet.</span>
                ) : (
                  (task.subtasks || []).map(sub => (
                    <button key={sub.id} onClick={() => handleToggleSubtask(sub)} className="w-full flex items-center gap-2 p-2 rounded hover:bg-[var(--clubpm-surface-200)] transition-colors text-left">
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] ${sub.status === "DONE" ? "bg-[var(--clubpm-accent-green)] border-[var(--clubpm-accent-green)] text-white" : "border-[var(--clubpm-border)]"}`}>
                        {sub.status === "DONE" && "✓"}
                      </span>
                      <span className={`text-sm ${sub.status === "DONE" ? "line-through text-[var(--clubpm-text-muted)]" : "text-[var(--clubpm-text-primary)]"}`}>{sub.title}</span>
                    </button>
                  ))
                )}
              </div>
              <form onSubmit={handleAddSubtask} className="flex gap-2">
                <input type="text" value={subtaskTitle} onChange={e => setSubtaskTitle(e.target.value)} placeholder="Add a subtask..." className="clubpm-input flex-1 py-1 px-3 text-sm" />
                <button type="submit" className="clubpm-btn-primary py-1 px-3 text-sm">Add</button>
              </form>
            </section>

          </div>

          {/* Sidebar Right: Meta, Assignee, Tags */}
          <div className="md:w-64 shrink-0 space-y-6">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--clubpm-text-muted)] mb-2">Assignee</h3>
              {task.assignees && task.assignees.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {task.assignees.map(a => (
                    <div key={a.id} className="flex items-center gap-2 bg-[var(--clubpm-surface-200)] p-2 rounded">
                      <MemberBadge member={a} size="sm" />
                      <span className="text-sm">{a.displayName}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-[var(--clubpm-text-muted)]">Unassigned</span>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--clubpm-text-muted)] mb-2">Labels / Tags</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                {(task.tags || []).map((tag, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded bg-[var(--clubpm-surface-300)] border border-[var(--clubpm-border)]">
                    #{tag}
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddTag} className="flex gap-2 mt-2">
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add tag" className="clubpm-input flex-1 py-1 px-2 text-xs" />
                <button type="submit" className="clubpm-btn-primary py-1 px-2 text-xs">Add</button>
              </form>
            </div>

            {/* Dependencies */}
            {((task.blockedBy && task.blockedBy.length > 0) || (task.blocking && task.blocking.length > 0)) && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--clubpm-text-muted)] mb-2">Dependencies</h3>
                {task.blockedBy && task.blockedBy.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] text-[var(--clubpm-text-muted)] mb-1">Blocked by:</p>
                    {task.blockedBy.map(dep => (
                      <div key={dep.id} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 mb-1">
                        🚫 {dep.title}
                      </div>
                    ))}
                  </div>
                )}
                {task.blocking && task.blocking.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[var(--clubpm-text-muted)] mb-1">Blocking:</p>
                    {task.blocking.map(dep => (
                      <div key={dep.id} className="text-xs px-2 py-1 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 mb-1">
                        ⚠ {dep.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recurring badge */}
            {task.recurringInterval && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--clubpm-text-muted)] mb-2">Recurring</h3>
                <span className="text-xs px-2 py-1 rounded bg-[var(--clubpm-accent-primary)]/10 text-[var(--clubpm-accent-primary)] border border-[var(--clubpm-accent-primary)]/20">
                  🔁 {task.recurringInterval}
                </span>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>,
    document.body
  );
}
