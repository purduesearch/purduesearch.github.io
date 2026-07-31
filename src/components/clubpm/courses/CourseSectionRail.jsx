import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// CourseSectionKind → the badge + icon shown on each rail row. Keys match the
// Prisma enum exactly; anything unknown falls back to CONTENT so a future kind
// added server-side degrades to a readable row instead of a blank badge.
export const SECTION_KINDS = {
  CONTENT: { label: 'Content', icon: 'fas fa-align-left' },
  VIDEO:   { label: 'Video',   icon: 'fas fa-video' },
  QUIZ:    { label: 'Quiz',    icon: 'fas fa-list-check' },
};

const kindMeta = (kind) => SECTION_KINDS[kind] ?? SECTION_KINDS.CONTENT;

// Two kinds of draggable share one DndContext, so their ids are namespaced.
// Without this a module and a section could collide on id, and drag-end could
// not tell which level the user grabbed.
const modId  = (id) => `mod:${id}`;
const secId  = (id) => `sec:${id}`;
const dropId = (id) => `drop:${id}`;
const rawId  = (v) => String(v).slice(String(v).indexOf(':') + 1);
const isMod  = (v) => String(v).startsWith('mod:');
const isSec  = (v) => String(v).startsWith('sec:');
const isDrop = (v) => String(v).startsWith('drop:');

/** modules[] → the wire shape saveStructure expects. */
const toTree = (modules) =>
  modules.map((m) => ({ moduleId: m.id, sectionIds: (m.sections ?? []).map((s) => s.id) }));

// Local reorder so the rail can render the new order optimistically before the
// structure PUT round-trip returns.
function moveItem(list, from, to) {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Apply a section drag to the module tree locally, so the rail can render the
 * result before the structure PUT returns. Returns a NEW modules array, or null
 * when the drag is a no-op.
 */
function moveSection(modules, activeSectionId, overId) {
  const fromModule = modules.find((m) => (m.sections ?? []).some((s) => s.id === activeSectionId));
  if (!fromModule) return null;

  const toModuleId = isDrop(overId)
    ? rawId(overId)
    : isSec(overId)
      ? modules.find((m) => (m.sections ?? []).some((s) => s.id === rawId(overId)))?.id
      : isMod(overId)
        ? rawId(overId)
        : null;
  if (!toModuleId) return null;

  const moving = fromModule.sections.find((s) => s.id === activeSectionId);
  const stripped = modules.map((m) => ({
    ...m,
    sections: (m.sections ?? []).filter((s) => s.id !== activeSectionId),
  }));
  const target = stripped.find((m) => m.id === toModuleId);
  if (!target) return null;

  // Dropping ON a section inserts at that section's position; dropping on a
  // module body (or the module header) appends.
  const index = isSec(overId)
    ? Math.max(0, target.sections.findIndex((s) => s.id === rawId(overId)))
    : target.sections.length;

  const nextSections = target.sections.slice();
  nextSections.splice(index, 0, moving);
  return stripped.map((m) => (m.id === toModuleId ? { ...m, sections: nextSections } : m));
}

function SectionRow({ section, isSelected, canEdit, onSelect, onToggleRequired, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: secId(section.id), disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const meta = kindMeta(section.kind);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pm-course-rail-row${isSelected ? ' is-selected' : ''}`}
      onClick={() => { if (!isDragging) onSelect(section.id); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(section.id); } }}
      aria-current={isSelected ? 'true' : undefined}
    >
      {canEdit && (
        // Drag listeners live on the grip alone; putting them on the row makes
        // every click-to-select register as a drag start.
        <i
          className="fas fa-grip-vertical pm-course-rail-grip"
          aria-hidden="true"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      <span className={`cpm-course-kind-badge cpm-course-kind-badge--${(section.kind ?? 'CONTENT').toLowerCase()}`}>
        <i className={meta.icon} aria-hidden="true" />
        <span>{meta.label}</span>
      </span>

      <span className="pm-course-rail-title" title={section.title}>{section.title}</span>

      <span className="pm-course-rail-row-actions">
        <button
          type="button"
          className={`pm-course-rail-req${section.isRequired ? ' is-on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleRequired(section); }}
          disabled={!canEdit}
          title={section.isRequired ? 'Required — blocks later sections until complete' : 'Optional — never blocks a learner'}
          aria-label={section.isRequired ? 'Required section' : 'Optional section'}
          aria-pressed={!!section.isRequired}
        >
          <i className={`fas ${section.isRequired ? 'fa-lock' : 'fa-lock-open'}`} aria-hidden="true" />
        </button>
        {canEdit && (
          <button
            type="button"
            className="pm-course-rail-del"
            onClick={(e) => { e.stopPropagation(); onDelete(section); }}
            title="Delete section"
            aria-label={`Delete section ${section.title}`}
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * One module: a draggable header plus its sections. The body is a droppable in
 * its own right so an EMPTY module is still a drop target — without that,
 * emptying a module makes it permanently unfillable by drag.
 */
function ModuleGroup({
  module: mod, expanded, selectedSectionId, isSelected, canEdit,
  onToggle, onSelectModule, onSelectSection, onUpdateSection,
  onDeleteSection, onDeleteModule, onAddSection,
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: modId(mod.id), disabled: !canEdit });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropId(mod.id) });

  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef(null);
  useEffect(() => {
    if (!addOpen) return undefined;
    const onDoc = (e) => { if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setAddOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [addOpen]);

  const sections = mod.sections ?? [];
  const ids = sections.map((s) => secId(s.id));
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  // Both warnings are authoring mistakes the gate treats as "never blocks".
  const warning = sections.length === 0
    ? 'This module has no sections, so it never blocks the next one.'
    : sections.every((s) => !s.isRequired)
      ? 'Every section here is optional, so this module never blocks the next one.'
      : null;

  return (
    <div ref={setNodeRef} style={style} className={`pm-course-module-group${isSelected ? ' is-selected' : ''}`}>
      <div
        className="pm-course-module-head"
        onClick={() => onSelectModule(mod.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectModule(mod.id); } }}
        aria-current={isSelected ? 'true' : undefined}
      >
        {canEdit && (
          <i
            className="fas fa-grip-vertical pm-course-rail-grip"
            aria-hidden="true"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <button
          type="button"
          className="pm-course-module-toggle"
          onClick={(e) => { e.stopPropagation(); onToggle(mod.id); }}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${mod.title}` : `Expand ${mod.title}`}
        >
          <i className={`fas ${expanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} aria-hidden="true" />
        </button>
        <span className="pm-course-module-title" title={mod.title}>{mod.title}</span>
        <span className="pm-course-module-meta">
          {sections.length}
          {!mod.sequential && <span className="cpm-tag">any order</span>}
          {!mod.isRequired && <span className="cpm-tag">optional</span>}
        </span>
        {warning && (
          <i
            className="fas fa-triangle-exclamation pm-course-module-warn"
            title={warning}
            aria-label={warning}
          />
        )}
        {canEdit && (
          <span className="pm-course-module-actions">
            <span className="pm-course-rail-add-wrap" ref={addRef}>
              <button
                type="button"
                className="pm-course-rail-add"
                onClick={(e) => { e.stopPropagation(); setAddOpen((o) => !o); }}
                aria-haspopup="menu"
                aria-expanded={addOpen}
                aria-label={`Add a section to ${mod.title}`}
                title="Add a section to this module"
              >
                <i className="fas fa-plus" aria-hidden="true" />
              </button>
              {addOpen && (
                <div className="pm-course-rail-add-pop" role="menu">
                  {Object.entries(SECTION_KINDS).map(([kind, meta]) => (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      onClick={(e) => { e.stopPropagation(); setAddOpen(false); onAddSection(mod.id, kind); }}
                    >
                      <i className={meta.icon} aria-hidden="true" /> {meta.label}
                    </button>
                  ))}
                </div>
              )}
            </span>
            <button
              type="button"
              className="pm-course-rail-del"
              onClick={(e) => { e.stopPropagation(); onDeleteModule(mod); }}
              title="Delete module"
              aria-label={`Delete module ${mod.title}`}
            >
              <i className="fas fa-trash" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>

      {expanded && (
        <div
          ref={setDropRef}
          className={`pm-course-module-body${isOver ? ' is-over' : ''}`}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {sections.length === 0 ? (
              <p className="pm-course-module-empty">
                Empty{canEdit ? ' — drag a section here, or use +' : ''}
              </p>
            ) : sections.map((section) => (
              <SectionRow
                key={section.id}
                section={section}
                isSelected={section.id === selectedSectionId}
                canEdit={canEdit}
                onSelect={onSelectSection}
                onToggleRequired={(s) => onUpdateSection?.(s.id, { isRequired: !s.isRequired })}
                onDelete={onDeleteSection}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

/**
 * Two-level course structure: modules in order, each holding its sections.
 *
 * One DndContext drives both levels. Module ids and section ids are namespaced
 * (`mod:` / `sec:`) so drag-end can tell which level was grabbed, and each
 * module body is a `drop:` droppable so an empty module remains a drop target.
 *
 * Every drag produces the WHOLE tree and hands it to `onSaveStructure` — the
 * server rejects anything less, deliberately, so a cross-module move cannot
 * half-apply.
 */
export default function CourseSectionRail({
  modules = [],
  selectedId,
  selectedKind = 'section',
  canEdit = false,
  onSelectSection,
  onSelectModule,
  onSaveStructure,
  onAddModule,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onDeleteModule,
}) {
  // Collapsed by default except the module holding the selection — a six-module
  // course otherwise makes a rail taller than the viewport.
  const [expanded, setExpanded] = useState(() => new Set());

  const selectedModuleId = useMemo(() => {
    if (selectedKind === 'module') return selectedId;
    return modules.find((m) => (m.sections ?? []).some((s) => s.id === selectedId))?.id ?? null;
  }, [modules, selectedId, selectedKind]);

  useEffect(() => {
    if (selectedModuleId) setExpanded((prev) => new Set(prev).add(selectedModuleId));
  }, [selectedModuleId]);

  const toggle = useCallback((moduleId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const moduleIds = useMemo(() => modules.map((m) => modId(m.id)), [modules]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (isMod(active.id)) {
      // Module reorder. Dropping a module onto a section means "onto that
      // section's module", which is the only sane reading of that gesture.
      const overModuleId = isMod(over.id) ? rawId(over.id)
        : isDrop(over.id) ? rawId(over.id)
        : modules.find((m) => (m.sections ?? []).some((s) => s.id === rawId(over.id)))?.id;
      if (!overModuleId) return;
      const from = modules.findIndex((m) => m.id === rawId(active.id));
      const to = modules.findIndex((m) => m.id === overModuleId);
      if (from < 0 || to < 0 || from === to) return;
      onSaveStructure?.(toTree(moveItem(modules, from, to)));
      return;
    }

    if (isSec(active.id)) {
      const next = moveSection(modules, rawId(active.id), over.id);
      if (next) onSaveStructure?.(toTree(next));
    }
  }, [modules, onSaveStructure]);

  return (
    <aside className="pm-course-rail" aria-label="Course structure">
      <div className="pm-course-rail-head">
        <span className="pm-course-rail-heading">Structure</span>
        {canEdit && (
          <button
            type="button"
            className="pm-course-rail-add"
            onClick={() => onAddModule?.()}
            title="Add a module"
            aria-label="Add a module"
          >
            <i className="fas fa-plus" aria-hidden="true" />
          </button>
        )}
      </div>

      {modules.length === 0 ? (
        <p className="pm-course-rail-empty">
          No modules yet.{canEdit ? ' Use + to add the first one.' : ''}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={moduleIds} strategy={verticalListSortingStrategy}>
            <div className="pm-course-rail-list">
              {modules.map((mod) => (
                <ModuleGroup
                  key={mod.id}
                  module={mod}
                  expanded={expanded.has(mod.id)}
                  isSelected={selectedKind === 'module' && mod.id === selectedId}
                  selectedSectionId={selectedKind === 'section' ? selectedId : null}
                  canEdit={canEdit}
                  onToggle={toggle}
                  onSelectModule={onSelectModule}
                  onSelectSection={onSelectSection}
                  onUpdateSection={onUpdateSection}
                  onDeleteSection={onDeleteSection}
                  onDeleteModule={onDeleteModule}
                  onAddSection={onAddSection}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </aside>
  );
}
