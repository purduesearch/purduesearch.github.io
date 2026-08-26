// Is a stored TipTap/ProseMirror document actually blank?
//
// This is the client-side mirror of `isEmptyDoc` in
// backend/src/services/courseService.ts. Keep the two in step: they answer the
// same question about the same column (`CourseSection.contentJson`), one to
// decide whether a revision is worth snapshotting, the other to decide whether
// a reader is worth rendering.
//
// Why a reader needs it: every section is seeded with `contentJson: {}` (see
// backend/scripts/seedCourses.ts), and `{}` is truthy, so a bare
// `section.contentJson && <reader/>` guard renders the editor over a document
// with nothing in it. The read-only surface still claims its
// `min-height: 320px` (.cpm-blog-editor-surface .ProseMirror), so a section
// with no prose — every TRAINING section, which carries its content in the
// registry entry rather than in a body — opens with a 320px blank band between
// its title and its actual content.
//
// Empty means: not an object, no `content` array, an empty `content` array, or
// content nodes that contain no text at all (the single empty paragraph a
// freshly-mounted editor reports).
export function isEmptyDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return true;
  if (!Array.isArray(doc.content) || doc.content.length === 0) return true;
  return !JSON.stringify(doc.content).includes('"text"');
}

// The reader guard itself, named for what it is at the call site.
export const hasReadableContent = (doc) => !isEmptyDoc(doc);
