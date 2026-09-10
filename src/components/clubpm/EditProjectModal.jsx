// Edit a project's core info (name, status, type, program, dates).
// PATCH /api/projects/:id is gated by channelAuth (linked-channel members only)
// and additionally makes programTag admin-only. Only changed fields are sent, so
// a non-admin saving other fields never trips the admin gate.

import React, { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { patch } from "../../api/clubPmClient";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

const TYPE_OPTIONS = [
  { value: "ENGINEERING", label: "Engineering" },
  { value: "RESEARCH", label: "Research" },
  { value: "HYBRID", label: "Hybrid" },
];

// Must match PROGRAM_TAGS in backend/src/api/projects.ts.
const PROGRAM_OPTIONS = [
  { value: "", label: "None" },
  { value: "astrousa", label: "AstroUSA" },
  { value: "sa2tp", label: "SA²TP" },
  { value: "research", label: "Research" },
  { value: "software", label: "Software" },
  { value: "business", label: "Business" },
];

// Dates are stored as UTC midnight (new Date("YYYY-MM-DD")), so the ISO prefix is the date.
const toDateInput = (iso) => (iso ? String(iso).slice(0, 10) : "");

export default function EditProjectModal({ project, isAdmin, onClose, onSaved }) {
  const initial = {
    name: project.name ?? "",
    status: project.status ?? "ACTIVE",
    type: project.type ?? "ENGINEERING",
    programTag: project.programTag ?? "",
    startDate: toDateInput(project.startDate),
    targetDate: toDateInput(project.targetDate),
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const changes = {};
  if (form.name.trim() !== initial.name) changes.name = form.name.trim();
  for (const key of ["status", "type", "programTag", "startDate", "targetDate"]) {
    if (form[key] !== initial[key]) changes[key] = form[key] || null;
  }
  const hasChanges = Object.keys(changes).length > 0;
  const nameEmpty = !form.name.trim();
  const datesInverted =
    form.startDate && form.targetDate && form.startDate > form.targetDate;

  // A tag set outside the known list (e.g. directly in the DB) stays selectable.
  const programOptions =
    initial.programTag && !PROGRAM_OPTIONS.some((o) => o.value === initial.programTag)
      ? [...PROGRAM_OPTIONS, { value: initial.programTag, label: initial.programTag }]
      : PROGRAM_OPTIONS;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hasChanges || nameEmpty || datesInverted || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patch(`/api/projects/${project.id}`, changes);
      toast.success("Project updated");
      onSaved?.(updated);
      onClose();
    } catch (err) {
      setError(err?.message ?? "Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="cpm-proj-edit-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cpm-proj-edit-modal" role="dialog" aria-label="Edit project">
        <div className="cpm-proj-edit-header">
          <span>
            <i className="fas fa-pencil-alt" style={{ marginRight: 10 }} aria-hidden="true" />
            Edit project
          </span>
          <button onClick={onClose} aria-label="Close" className="cpm-proj-edit-close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cpm-proj-edit-body">
          <label className="cpm-proj-edit-field">
            <span className="cpm-proj-edit-label">Name</span>
            <input
              type="text"
              autoFocus
              value={form.name}
              onChange={set("name")}
              maxLength={120}
              className="cpm-proj-edit-input"
            />
          </label>

          <div className="cpm-proj-edit-row">
            <label className="cpm-proj-edit-field">
              <span className="cpm-proj-edit-label">Status</span>
              <select value={form.status} onChange={set("status")} className="cpm-proj-edit-input">
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="cpm-proj-edit-field">
              <span className="cpm-proj-edit-label">Type</span>
              <select value={form.type} onChange={set("type")} className="cpm-proj-edit-input">
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="cpm-proj-edit-row">
            <label className="cpm-proj-edit-field">
              <span className="cpm-proj-edit-label">Start date</span>
              <input type="date" value={form.startDate} onChange={set("startDate")} className="cpm-proj-edit-input" />
            </label>
            <label className="cpm-proj-edit-field">
              <span className="cpm-proj-edit-label">Target date</span>
              <input type="date" value={form.targetDate} onChange={set("targetDate")} className="cpm-proj-edit-input" />
            </label>
          </div>

          <label className="cpm-proj-edit-field">
            <span className="cpm-proj-edit-label">Public program</span>
            <select
              value={form.programTag}
              onChange={set("programTag")}
              disabled={!isAdmin}
              className="cpm-proj-edit-input"
            >
              {programOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="cpm-proj-edit-hint">
              {isAdmin
                ? "Files this project under a program page on the public site."
                : "Only admins can change the public program."}
            </span>
          </label>

          {nameEmpty && <p className="cpm-proj-edit-error">Name can't be empty.</p>}
          {datesInverted && <p className="cpm-proj-edit-error">Start date is after the target date.</p>}
          {error && <p className="cpm-proj-edit-error">{error}</p>}

          <div className="cpm-proj-edit-footer">
            <button type="button" className="cpm-proj-edit-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="clubpm-btn-primary"
              disabled={!hasChanges || nameEmpty || datesInverted || saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
