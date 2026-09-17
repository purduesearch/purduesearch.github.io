/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   The timeline is an <svg> with no accessible role, and the assertions are
   about which container it panned inside. */
// Phase 4B: on a phone, a chart must also be readable as data, and the timeline
// must open on a schedule list rather than a 260px label column plus a day grid.
import { fireEvent, render, screen, within } from '@testing-library/react';
import AnalyticsCard from './analytics/AnalyticsCard';
import GanttChart from './GanttChart';

let mockCompact = true;

jest.mock('../../clubpm/layout/compactLayout', () => ({
  useCompactLayout: () => mockCompact,
  COMPACT_CLASS: 'pm-shell--compact',
}));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const csv = {
  filename: 'velocity.csv',
  columns: [{ key: 'label', label: 'Week' }, { key: 'done', label: 'Done' }],
  rows: [
    { label: 'Wk 1', done: 3 },
    { label: 'Wk 2', done: 5 },
  ],
};

describe('AnalyticsCard on phones', () => {
  it('offers the same numbers as a readable table', () => {
    mockCompact = true;
    render(
      <AnalyticsCard title="Velocity" subtitle="Tasks completed per week" csv={csv}>
        <div data-testid="chart">chart</div>
      </AnalyticsCard>
    );

    // The chart is still the default view.
    expect(screen.getByTestId('chart')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Week' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Wk 2' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '5' })).toBeInTheDocument();

    // And it is reversible, so no chart affordance is lost.
    fireEvent.click(screen.getByRole('button', { name: 'Chart' }));
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });

  it('says so when a card has no exportable rows', () => {
    mockCompact = true;
    render(<AnalyticsCard title="Velocity" csv={null}><div>chart</div></AnalyticsCard>);
    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.getByText(/no data in this range yet/i)).toBeInTheDocument();
  });

  it('adds no view control on desktop', () => {
    mockCompact = false;
    render(
      <AnalyticsCard title="Velocity" csv={csv}><div data-testid="chart">chart</div></AnalyticsCard>
    );
    expect(screen.queryByRole('button', { name: 'Data' })).not.toBeInTheDocument();
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });
});

describe('GanttChart on phones', () => {
  const tasks = [
    {
      id: 't1',
      title: 'Wire the harness',
      status: 'IN_PROGRESS',
      createdAt: '2026-03-01T00:00:00.000Z',
      dueDate: '2026-03-12T00:00:00.000Z',
      dependencies: [],
      subtasks: [],
    },
    {
      id: 't2',
      title: 'Order the connectors',
      status: 'TODO',
      createdAt: '2026-03-04T00:00:00.000Z',
      dueDate: null,
      dependencies: [{ taskId: 't1' }],
      subtasks: [],
    },
  ];
  const milestones = [{ id: 'm1', title: 'Design freeze', dueDate: '2026-03-20T00:00:00.000Z', health: 'AT_RISK' }];

  it('opens on a schedule list carrying what the bars encode', () => {
    mockCompact = true;
    render(<GanttChart tasks={tasks} milestones={milestones} />);

    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByText('Wire the harness')).toBeInTheDocument();
    expect(screen.getByText('No due date')).toBeInTheDocument();
    expect(screen.getByText('1 dependency')).toBeInTheDocument();
    expect(screen.getByText('Design freeze')).toBeInTheDocument();
    // No timeline SVG until it is asked for.
    expect(document.querySelector('svg.select-none')).toBeNull();
  });

  it('keeps the timeline one tap away and contains its panning', () => {
    mockCompact = true;
    render(<GanttChart tasks={tasks} milestones={milestones} />);

    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    const svg = document.querySelector('svg.select-none');
    expect(svg).not.toBeNull();
    expect(svg.closest('.pm-m-gantt-frame')).not.toBeNull();
    expect(screen.getByText(/drag sideways/i)).toBeInTheDocument();
  });

  it('renders the desktop chart unchanged', () => {
    mockCompact = false;
    render(<GanttChart tasks={tasks} milestones={milestones} />);
    expect(document.querySelector('svg.select-none')).not.toBeNull();
    expect(document.querySelector('.pm-m-gantt')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument();
  });
});
