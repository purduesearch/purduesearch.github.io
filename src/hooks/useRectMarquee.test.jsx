import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import useRectMarquee from './useRectMarquee';

function Harness({ onChange, onEnd }) {
  const begin = useRectMarquee({ onChange, onEnd });
  return (
    <div>
      {[0, 1, 2].map(di => [0, 1, 2].map(ti => (
        <div key={`${di}${ti}`} data-testid={`c${di}${ti}`} data-mq="1" data-di={di} data-ti={ti}
          onPointerDown={(e) => begin(di, ti, e)} />
      )))}
    </div>
  );
}

let original;
beforeEach(() => { original = document.elementFromPoint; });
afterEach(() => { document.elementFromPoint = original; });

test('reports the rectangle from the anchor to the cell under the pointer', () => {
  const onChange = jest.fn(), onEnd = jest.fn();
  render(<Harness onChange={onChange} onEnd={onEnd} />);
  fireEvent.pointerDown(screen.getByTestId('c21'));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ d0: 2, d1: 2, t0: 1, t1: 1 }));
  document.elementFromPoint = jest.fn(() => screen.getByTestId('c02'));
  fireEvent.pointerMove(window);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ d0: 0, d1: 2, t0: 1, t1: 2 }));
  fireEvent.pointerUp(window);
  expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ d0: 0, d1: 2, t0: 1, t1: 2 }), expect.objectContaining({ cancelled: false }));
});

test('ignores moves when no drag is active', () => {
  const onChange = jest.fn(), onEnd = jest.fn();
  render(<Harness onChange={onChange} onEnd={onEnd} />);
  document.elementFromPoint = jest.fn(() => screen.getByTestId('c00'));
  fireEvent.pointerMove(window);
  fireEvent.pointerUp(window);
  expect(onChange).not.toHaveBeenCalled();
  expect(onEnd).not.toHaveBeenCalled();
});

test('pointercancel ends the drag as cancelled', () => {
  const onEnd = jest.fn();
  render(<Harness onChange={() => {}} onEnd={onEnd} />);
  fireEvent.pointerDown(screen.getByTestId('c11'));
  fireEvent.pointerCancel(window);
  expect(onEnd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cancelled: true }));
});
