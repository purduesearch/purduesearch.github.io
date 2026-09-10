import React from 'react';
import { render } from '@testing-library/react';
import AssigneeWorkloadCard from './AssigneeWorkloadCard';

// jsdom gives ResponsiveContainer a 0x0 box, so recharts renders nothing at all.
// Pin a real size so the legend is actually in the DOM to assert against.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <actual.ResponsiveContainer width={640} height={320}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const DATA = [
  { memberId: 'm1', member: 'Ada', TODO: 3, IN_PROGRESS: 2, BLOCKED: 1, DONE: 4, total: 10 },
  { memberId: 'm2', member: 'Grace', TODO: 1, IN_PROGRESS: 1, BLOCKED: 0, DONE: 2, total: 4 },
];

/** Legend swatches are `<Surface>` children of `.recharts-legend-item`. */
function legendSwatchFills(container) {
  return Array.from(container.querySelectorAll('.recharts-legend-item path'))
    .map(p => p.getAttribute('fill'));
}

describe('AssigneeWorkloadCard legend', () => {
  it('renders one swatch per status series', () => {
    const { container } = render(<AssigneeWorkloadCard data={DATA} />);
    expect(legendSwatchFills(container)).toHaveLength(4);
  });

  it('colors each swatch with its status color, not black', () => {
    const { container } = render(<AssigneeWorkloadCard data={DATA} />);
    const fills = legendSwatchFills(container);
    fills.forEach(fill => {
      expect(fill).toBeTruthy();
      expect(['#000', '#000000', 'black']).not.toContain(String(fill).toLowerCase());
    });
    // Four distinct statuses must not collapse to one shared color.
    expect(new Set(fills).size).toBe(4);
  });
});
