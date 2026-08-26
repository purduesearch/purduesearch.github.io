import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  SLIDES:  { label: 'Slides',  icon: 'fas fa-file-powerpoint' },
  WALKTHROUGH: { label: 'Walkthrough', icon: 'fas fa-hand-pointer' },
  LIT_REVIEW:  { label: 'Paper review', icon: 'fas fa-book-open' },
  ASSIGNMENT:  { label: 'Assignment', icon: 'fas fa-file-pen' },
  TRAINING:    { label: 'Training', icon: 'fas fa-certificate' },
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
  //
  // The index is read from the target's ORIGINAL section list, not the stripped
  // one — that is what makes a within-module drag match arrayMove semantics. On
  // the stripped list every downward drag lands one slot short, so dragging a
  // section down by one would be a silent no-op. For a cross-module drag the two
  // lists are identical, since the moving section was never in the target.
  const targetOriginal = modules.find((m) => m.id === toModuleId)?.sections ?? [];
  const index = isSec(overId)
    ? Math.max(0, targetOriginal.findIndex((s) => s.id === rawId(overId)))
    : target.sections.length;

  const nextSections = target.sections.slice();
  nextSections.splice(index, 0, moving);
  return stripped.map((m) => (m.id === toModuleId ? { ...m, sections: nextSections } : m));
}

// Menu geometry, in viewport coordinates. Rendered through a portal because the
// rail is `overflow-y: auto`, which clips any absolutely-positioned child — an
// empty module has no content below it to scroll to, so the menu was simply cut
// off. Flips above the button when there isn't room below.
const MENU_WIDTH = 158;
const MENU_MARGIN = 8;

function menuPositionFor(button, itemCount) {
  const rect = button.getBoundingClientRect();
  const height = itemCount * 34 + 10;
  const openUp = rect.bottom + height + MENU_MARGIN > window.innerHeight
    && rect.top - height - MENU_MARGIN > 0;
  return {
    top: openUp ? rect.top - height - 6 : rect.bottom + 6,
    // Right-aligned to the button, then clamped so it can never leave the viewport.
    left: Math.max(MENU_MARGIN, Math.min(
      rect.right - MENU_WIDTH,
      window.innerWidth - MENU_WIDTH - MENU_MARGIN
    )),
  };
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

  // null when closed; {top,left} in viewport coords when open.
  const [addMenu, setAddMenu] = useState(null);
  const addRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!addMenu) return undefined;
    const onDoc = (e) => {
      // The menu is portalled out of the rail, so it is NOT inside addRef —
      // both subtrees have to be checked or clicking an item closes the menu
      // before its own handler runs.
      if (addRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setAddMenu(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setAddMenu(null); };
    // A portalled menu is detached from the rail's scroller, so it would other-
    // wise hang in place while the rail scrolls underneath it.
    const onReflow = () => setAddMenu(null);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [addMenu]);

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
                onClick={(e) => {
                  e.stopPropagation();
                  // Captured before the updater: React nulls `currentTarget`
                  // once the handler returns, and the updater runs later.
                  const button = e.currentTarget;
                  setAddMenu((open) => (
                    open ? null : menuPositionFor(button, Object.keys(SECTION_KINDS).length)
                  ));
                }}
                aria-haspopup="menu"
                aria-expanded={!!addMenu}
                aria-label={`Add a section to ${mod.title}`}
                title="Add a section to this module"
              >
                <i className="fas fa-plus" aria-hidden="true" />
              </button>
              {addMenu && createPortal(
                <div
                  ref={menuRef}
                  className="pm-course-rail-add-pop pm-course-rail-add-pop--floating"
                  role="menu"
                  style={{ top: addMenu.top, left: addMenu.left }}
                >
                  {Object.entries(SECTION_KINDS).map(([kind, meta]) => (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      onClick={(e) => { e.stopPropagation(); setAddMenu(null); onAddSection(mod.id, kind); }}
                    >
                      <i className={meta.icon} aria-hidden="true" /> {meta.label}
                    </button>
                  ))}
                </div>,
                document.body
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
    <aside className="pm-course-rail" data-tour-id="course.editor.rail" aria-label="Course structure">
      <div className="pm-course-rail-head">
        <span className="pm-course-rail-heading">Structure</span>
        {canEdit && (
          <button
            type="button"
            className="pm-course-rail-add"
            data-tour-id="course.editor.addsection"
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
