/**
 * Admin settings for one sub-project: what rolls up into its parent.
 * Saves with a single PUT; no row on the server means everything is off.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getProjectRollup, saveProjectRollup } from "../../api/clubPmClient";

const DEFAULT_COLOR = "#6c5ce7";

const OFF = {
  tasks: false, tagEnabled: false, tagLabel: null, tagColor: null,
  github: false, slack: false, vault: false, milestones: false,
  insights: false, parentMembersCanEdit: false, aiContext: false,
};

const TOGGLES = [
  { key: "tasks", label: "Tasks", help: "Show this sub-project's tasks on the parent board." },
  { key: "tag", special: true },
  { key: "github", label: "GitHub repositories", help: "List this sub-project's repositories on the parent." },
  { key: "slack", label: "Slack channels", help: "List this sub-project's channels in the parent chat. Channel access is unchanged." },
  { key: "vault", label: "CAD (Vault) items", help: "List Vault items on the parent for members who can open this sub-project's Vault." },
  { key: "milestones", label: "Milestones & Gantt", help: "Show milestones on the parent milestone list and Gantt." },
  { key: "insights", label: "Insights", help: "Count rolled-up tasks in parent charts and progress.", needsTasks: true },
  { key: "parentMembersCanEdit", label: "Parent members can edit tasks", help: "Members of the parent can edit tasks here. Vault and Slack access stay unchanged." },
  { key: "aiContext", label: "AI assistant context", help: "Include this sub-project in the parent's AI answers and plans." },
];

function Switch({ id, checked, disabled, onChange, label, help }) {
  return (
    <div className="cpm-rollup-toggle">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-help`}
        disabled={disabled}
        className={`cpm-rollup-switch${checked ? " is-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="cpm-rollup-switch-knob" aria-hidden="true" />
      </button>
      <label htmlFor={id} className="cpm-rollup-toggle-text">
        <span className="cpm-rollup-toggle-label">{label}</span>
        <span id={`${id}-help`} className="cpm-rollup-toggle-help">{help}</span>
      </label>
    </div>
  );
}

export default function SubProjectRollupSettings({ projectId, projectName, parentName, canEdit, onSaved }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let live = true;
    setForm(null);
    setLoadError(null);
    getProjectRollup(projectId)
      .then(res => {
        if (!live) return;
        const s = { ...OFF, ...(res?.settings ?? {}) };
        setForm(s);
        setSaved(s);
      })
      .catch(err => live && setLoadError(err?.message ?? "Could not load roll-up settings"));
    return () => { live = false; };
  }, [projectId]);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved);

  const save = useCallback(async () => {
    if (inFlight.current || !form) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const body = {
        ...form,
        // Dependent options cannot stay on while Tasks is off.
        tagEnabled: form.tasks && form.tagEnabled,
        insights: form.tasks && form.insights,
      };
      const res = await saveProjectRollup(projectId, body);
      const s = { ...OFF, ...(res ?? body) };
      setForm(s);
      setSaved(s);
      toast.success("Roll-up settings saved");
      onSaved?.(s);
    } catch (err) {
      toast.error(err?.message ?? "Could not save roll-up settings");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [form, projectId, onSaved]);

  if (loadError) return <p className="cpm-proj-edit-error">{loadError}</p>;
  if (!form) return <p className="cpm-proj-edit-hint">Loading…</p>;

  const disabled = !canEdit || saving;
  const idBase = `cpm-rollup-${projectId}`;

  return (
    <div className="cpm-rollup-settings" role="group" aria-label={`Roll up into ${parentName}`}>
      <p className="cpm-rollup-heading">Roll up into {parentName}</p>
      {TOGGLES.map(t => {
        if (t.special) {
          return (
            <React.Fragment key="tag">
              <Switch
                id={`${idBase}-tag`}
                label="Tag rolled-up tasks"
                help="Add a coloured tag chip to each rolled-up task. A source chip always shows."
                checked={form.tasks && form.tagEnabled}
                disabled={disabled || !form.tasks}
                onChange={v => set("tagEnabled", v)}
              />
              <div className="cpm-rollup-tag-row">
                <label className="cpm-rollup-field">
                  <span className="cpm-proj-edit-label">Tag label</span>
                  <input
                    type="text"
                    className="cpm-proj-edit-input"
                    maxLength={40}
                    placeholder={projectName}
                    value={form.tagLabel ?? ""}
                    disabled={disabled || !form.tasks || !form.tagEnabled}
                    onChange={e => set("tagLabel", e.target.value || null)}
                  />
                </label>
                <label className="cpm-rollup-field cpm-rollup-field--color">
                  <span className="cpm-proj-edit-label">Tag colour</span>
                  <input
                    type="color"
                    className="cpm-rollup-color"
                    value={form.tagColor || DEFAULT_COLOR}
                    disabled={disabled || !form.tasks || !form.tagEnabled}
                    onChange={e => set("tagColor", e.target.value)}
                  />
                </label>
              </div>
            </React.Fragment>
          );
        }
        return (
          <Switch
            key={t.key}
            id={`${idBase}-${t.key}`}
            label={t.label}
            help={t.help}
            checked={t.needsTasks ? form.tasks && form[t.key] : form[t.key]}
            disabled={disabled || (t.needsTasks && !form.tasks)}
            onChange={v => set(t.key, v)}
          />
        );
      })}
      {canEdit && (
        <div className="cpm-rollup-actions">
          <button type="button" className="clubpm-btn-primary" disabled={saving || !dirty} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
