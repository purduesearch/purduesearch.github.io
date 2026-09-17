/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   One assertion is about which element carries the walkthrough anchor. */
// Phase 4D: the phone editor keeps a short always-visible formatting row, and
// everything else moves behind one labelled "More formatting" control. The row
// must still drive the real editor commands, not a reduced copy of them.
import { render, screen, fireEvent } from '@testing-library/react';
import CompactPrimaryToolbar from './CompactPrimaryToolbar';

function fakeEditor({ bold = false, italic = false, canUndo = true, canRedo = false } = {}) {
  const calls = [];
  const chain = {
    focus: () => chain,
    toggleBold: () => { calls.push('toggleBold'); return chain; },
    toggleItalic: () => { calls.push('toggleItalic'); return chain; },
    undo: () => { calls.push('undo'); return chain; },
    redo: () => { calls.push('redo'); return chain; },
    run: () => true,
  };
  return {
    calls,
    isActive: (name) => (name === 'bold' ? bold : name === 'italic' ? italic : false),
    can: () => ({ undo: () => canUndo, redo: () => canRedo }),
    chain: () => chain,
  };
}

describe('CompactPrimaryToolbar', () => {
  it('runs the editor commands its buttons name', () => {
    const editor = fakeEditor();
    render(<CompactPrimaryToolbar editor={editor} onAddSection={() => {}} onOpenMore={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(editor.calls).toEqual(['toggleBold', 'toggleItalic', 'undo']);
  });

  it('reflects active marks and disables what the editor cannot do', () => {
    render(
      <CompactPrimaryToolbar
        editor={fakeEditor({ bold: true, canUndo: false, canRedo: false })}
        onAddSection={() => {}}
        onOpenMore={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('keeps Add Section on the row and opens the rest as a dialog', () => {
    const onAddSection = jest.fn();
    const onOpenMore = jest.fn();
    render(
      <CompactPrimaryToolbar editor={fakeEditor()} onAddSection={onAddSection} onOpenMore={onOpenMore} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Section/ }));
    expect(onAddSection).toHaveBeenCalled();

    const more = screen.getByRole('button', { name: /More formatting/ });
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(more);
    expect(onOpenMore).toHaveBeenCalled();
  });

  it('carries the walkthrough anchor so blog steps still find a toolbar', () => {
    const { container } = render(
      <CompactPrimaryToolbar editor={fakeEditor()} onAddSection={() => {}} onOpenMore={() => {}} />
    );
    expect(container.querySelector('[data-tour-id="blog.editor.toolbar"]')).not.toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
  });
});
