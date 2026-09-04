import React, { useEffect } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { ShortcutsProvider, useShortcutsRegistry } from './ShortcutsRegistry';

/**
 * The rule under test: a literal character typed into a field is text, never a
 * global shortcut.
 *
 * '?' used to be exempt from the in-a-field guard, so typing a question mark
 * anywhere — a course summary, a task comment, a blog paragraph — popped the
 * keyboard-shortcuts help over the top of the work. Escape stays exempt on
 * purpose: someone reaching for it mid-typing wants to close something.
 */

function Harness({ onFire }) {
  const { register } = useShortcutsRegistry();
  useEffect(() => {
    register({ id: 'help', keys: '?', scope: 'global', description: 'help', action: () => onFire('?') });
    register({ id: 'esc', keys: 'Escape', scope: 'global', description: 'esc', action: () => onFire('Escape') });
  }, [register, onFire]);
  return (
    <>
      <textarea data-testid="composer" />
      {/* tabIndex so jsdom will focus it at all — a bare div cannot take focus
          there the way a real contentEditable host can. */}
      <div data-testid="rich" contentEditable tabIndex={-1} suppressContentEditableWarning />
      <button data-testid="plain" type="button">elsewhere</button>
    </>
  );
}

function setup() {
  const onFire = jest.fn();
  const utils = render(
    <ShortcutsProvider>
      <Harness onFire={onFire} />
    </ShortcutsProvider>
  );
  return { onFire, ...utils };
}

test('"?" does not open the shortcuts help while typing in a textarea', () => {
  const { onFire, getByTestId } = setup();
  const composer = getByTestId('composer');
  composer.focus();

  fireEvent.keyDown(composer, { key: '?' });

  expect(onFire).not.toHaveBeenCalled();
});

test('"?" does not fire inside a contentEditable surface either', () => {
  const { onFire, getByTestId } = setup();
  const rich = getByTestId('rich');
  // jsdom does not implement isContentEditable — it is always false there, even
  // on an element carrying the attribute. The guard reads that property because
  // in a real browser it is what identifies a rich-text host (the blog editor,
  // TipTap node views), so the property is stubbed rather than the guard
  // loosened to sniff the attribute instead.
  Object.defineProperty(rich, 'isContentEditable', { value: true, configurable: true });
  rich.focus();

  fireEvent.keyDown(rich, { key: '?' });

  expect(onFire).not.toHaveBeenCalled();
});

test('"?" still opens the shortcuts help when no field has focus', () => {
  const { onFire, getByTestId } = setup();
  const plain = getByTestId('plain');
  plain.focus();

  fireEvent.keyDown(plain, { key: '?' });

  expect(onFire).toHaveBeenCalledWith('?');
});

test('Escape still dispatches from inside a field', () => {
  const { onFire, getByTestId } = setup();
  const composer = getByTestId('composer');
  composer.focus();

  fireEvent.keyDown(composer, { key: 'Escape' });

  expect(onFire).toHaveBeenCalledWith('Escape');
});
