import { useEffect, useState } from 'react';

/**
 * `editor.isEditable`, as reactive state.
 *
 * A React node view re-renders when ITS node or decorations change — never
 * because the editor's editable flag flipped. So every node view that read
 * `editor.isEditable` straight off the editor kept whatever it had at first
 * render: switching to Viewing hid the caret but left every section grip,
 * move/duplicate/delete button and column nudge on screen and working.
 *
 * `setEditable` emits `update`, and `transaction` covers anything else that
 * could change it. Both handlers bail out when the value is unchanged, so the
 * per-keystroke cost is one comparison and no re-render.
 */
export function useIsEditable(editor) {
  const [editable, setEditable] = useState(() => !!editor?.isEditable);

  useEffect(() => {
    if (!editor) return undefined;
    const sync = () => setEditable((prev) => (prev === editor.isEditable ? prev : editor.isEditable));
    sync();
    editor.on('update', sync);
    editor.on('transaction', sync);
    return () => {
      editor.off('update', sync);
      editor.off('transaction', sync);
    };
  }, [editor]);

  return editable;
}

export default useIsEditable;
