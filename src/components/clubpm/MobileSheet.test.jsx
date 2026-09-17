/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   These tests assert on things no accessible query reaches: `inert` on the app
   root and on portalled overlay layers, where focus lands, and that every
   data-tour-id is mounted once across the page and its portals. */
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MobileSheet, { __overlayStackDepth } from './MobileSheet';

let rootEl;
beforeEach(() => {
  rootEl = document.createElement('div');
  rootEl.id = 'root';
  document.body.appendChild(rootEl);
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  rootEl.remove();
});

function Harness({ nested = false, autofocus = false }) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button type="button" data-opener="x" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <MobileSheet title="Filters" onClose={() => setOpen(false)} returnFocusSelector='[data-opener="x"]'>
          <button type="button">First</button>
          {autofocus && <input aria-label="Name" data-autofocus="" />}
          <button type="button" onClick={() => setInner(true)}>Last</button>
          {nested && inner && (
            <MobileSheet title="Assign" onClose={() => setInner(false)} variant="fullscreen">
              <button type="button">Pick</button>
            </MobileSheet>
          )}
        </MobileSheet>
      )}
    </>
  );
}

it('focuses the heading, traps Tab, isolates the app, and returns focus to the opener', () => {
  render(<Harness />, { container: rootEl });
  const opener = screen.getByText('Open');
  opener.focus();
  fireEvent.click(opener);

  const dialog = screen.getByRole('dialog', { name: 'Filters' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Filters' }));
  expect(rootEl).toHaveAttribute('inert');
  expect(document.body).toHaveClass('pm-m-scroll-lock');

  // Tab from the last control wraps to the first (the header's Close button);
  // Shift+Tab from there wraps back to the last.
  const last = screen.getByText('Last');
  last.focus();
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close Filters' }));
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);

  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(rootEl).not.toHaveAttribute('inert');
  expect(document.body).not.toHaveClass('pm-m-scroll-lock');
  act(() => { jest.runOnlyPendingTimers(); });
  expect(document.activeElement).toBe(screen.getByText('Open'));
  expect(__overlayStackDepth()).toBe(0);
});

it('honours data-autofocus instead of the heading', () => {
  render(<Harness autofocus />, { container: rootEl });
  fireEvent.click(screen.getByText('Open'));
  expect(document.activeElement).toBe(screen.getByLabelText('Name'));
});

it('only the top layer is interactive and Escape closes only the top layer', () => {
  render(<Harness nested />, { container: rootEl });
  fireEvent.click(screen.getByText('Open'));
  fireEvent.click(screen.getByText('Last'));

  const outer = screen.getByRole('dialog', { name: 'Filters' }).closest('.pm-m-layer');
  const top = screen.getByRole('dialog', { name: 'Assign' });
  expect(outer).toHaveAttribute('inert');
  expect(top.closest('.pm-m-layer')).not.toHaveAttribute('inert');
  expect(__overlayStackDepth()).toBe(2);

  fireEvent.keyDown(top, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Assign' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  expect(outer).not.toHaveAttribute('inert');
  expect(rootEl).toHaveAttribute('inert');
});

it('closes from the scrim and the labelled close button', () => {
  render(<Harness />, { container: rootEl });
  fireEvent.click(screen.getByText('Open'));
  fireEvent.click(document.querySelector('.pm-m-scrim'));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByText('Open'));
  fireEvent.click(screen.getByRole('button', { name: 'Close Filters' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('leaves keys alone for a plain portal dialog rendered by its content (not a sheet layer)', () => {
  const { createPortal } = require('react-dom');
  const onClose = jest.fn();
  function PortalChild() {
    return createPortal(<div role="dialog" aria-label="Move task"><input aria-label="Target project" /></div>, document.body);
  }
  render(
    <MobileSheet title="Task" onClose={onClose} variant="fullscreen">
      <button type="button">Inside</button>
      <PortalChild />
    </MobileSheet>,
    { container: rootEl },
  );
  const field = screen.getByRole('textbox', { name: 'Target project' });
  field.focus();
  fireEvent.keyDown(field, { key: 'Tab' });
  expect(document.activeElement).toBe(field);
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();

  // Keys inside the sheet itself are still handled.
  fireEvent.keyDown(screen.getByText('Inside'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
