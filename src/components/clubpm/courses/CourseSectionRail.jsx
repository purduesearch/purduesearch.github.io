import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
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

// Local reorder so the rail can render the new order optimistically before the
// PUT /sections/order round-trip returns.
function moveItem(list, from, to) {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function SectionRow({ section, isSelected, canEdit, onSelect, onToggleRequired, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: !canEdit });

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
 * Ordered course-section list with drag reorder.
 *
 * @param {Array}    sections   ordered CourseSection rows (order asc)
 * @param {string}   selectedId currently open section
 * @param {boolean}  canEdit    author/admin — gates drag, add, delete, required toggle
 * @param {Function} onSelect   (sectionId) => void
 * @param {Function} onReorder  (orderedIds[]) => Promise — full ordered id list, per PUT /:id/sections/order
 * @param {Function} onAdd      (kind) => Promise
 * @param {Function} onUpdate   (sectionId, patch) => Promise
 * @param {Function} onDelete   (section) => Promise
 */
export default function CourseSectionRail({
  sections = [],
  selectedId,
  canEdit = false,
  onSelect,
  onReorder,
  onAdd,
  onUpdate,
  onDelete,
}) {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const ids = useMemo(() => sections.map((s) => s.id), [sections]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from < 0 || to < 0) return;
    onReorder?.(moveItem(ids, from, to));
  }, [ids, onReorder]);

  return (
    <aside className="pm-course-rail" aria-label="Course sections">
      <div className="pm-course-rail-head">
        <span className="pm-course-rail-heading">Sections</span>
        {canEdit && (
          <span className="pm-course-rail-add-wrap" ref={addRef}>
            <button
              type="button"
              className="pm-course-rail-add"
              onClick={() => setAddOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={addOpen}
              title="Add a section"
              aria-label="Add a section"
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
                    onClick={() => { setAddOpen(false); onAdd?.(kind); }}
                  >
                    <i className={meta.icon} aria-hidden="true" /> {meta.label}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
      </div>

      {sections.length === 0 ? (
        <p className="pm-course-rail-empty">
          No sections yet.{canEdit ? ' Use + to add the first one.' : ''}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="pm-course-rail-list">
              {sections.map((section) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  isSelected={section.id === selectedId}
                  canEdit={canEdit}
                  onSelect={onSelect}
                  onToggleRequired={(s) => onUpdate?.(s.id, { isRequired: !s.isRequired })}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </aside>
  );
}
