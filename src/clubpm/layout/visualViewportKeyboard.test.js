import { act, render, screen } from '@testing-library/react';
import { useVisualViewportKeyboard } from './visualViewportKeyboard';

function Probe() {
  const state = useVisualViewportKeyboard(true);
  return (
    <div>
      <input aria-label="Composer" />
      <output data-testid="keyboard">{state.open ? 'open' : 'closed'}</output>
    </div>
  );
}

function installViewport(height = 800) {
  const listeners = new Map();
  const viewport = {
    height,
    offsetTop: 0,
    addEventListener: jest.fn((name, fn) => listeners.set(name, fn)),
    removeEventListener: jest.fn(),
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  return { viewport, resize: () => act(() => listeners.get('resize')?.()) };
}

test('focus with a hardware keyboard does not hide navigation', () => {
  installViewport();
  render(<Probe />);
  act(() => screen.getByLabelText('Composer').focus());
  expect(screen.getByTestId('keyboard')).toHaveTextContent('closed');
});

test('rotation with hardware-keyboard focus establishes a new viewport baseline', () => {
  const { viewport, resize } = installViewport();
  render(<Probe />);
  act(() => screen.getByLabelText('Composer').focus());
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
  viewport.height = 390;
  resize();
  expect(screen.getByTestId('keyboard')).toHaveTextContent('closed');
});

test('a focused editor plus a contracted visual viewport detects the software keyboard', () => {
  const { viewport, resize } = installViewport();
  render(<Probe />);
  act(() => screen.getByLabelText('Composer').focus());
  viewport.height = 520;
  resize();
  expect(screen.getByTestId('keyboard')).toHaveTextContent('open');

  viewport.height = 800;
  resize();
  expect(screen.getByTestId('keyboard')).toHaveTextContent('closed');
});
