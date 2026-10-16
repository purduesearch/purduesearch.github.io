import React, { useRef, useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import toast from 'react-hot-toast';
import useTaskCompletion from './useTaskCompletion';
import { taskBurst, cancelTaskBursts } from './taskConfetti';

jest.mock('react-hot-toast', () => ({ __esModule: true, default: {
  custom: jest.fn(), dismiss: jest.fn(), remove: jest.fn(), error: jest.fn(),
} }));
jest.mock('./taskConfetti', () => ({ taskBurst: jest.fn(), cancelTaskBursts: jest.fn(),
  retainTaskConfetti: jest.fn(), releaseTaskConfetti: jest.fn() }));

const tasks = [
  { id: 'first', title: 'First', status: 'TODO' },
  { id: 'target', title: 'Target', status: 'IN_PROGRESS' },
  { id: 'third', title: 'Third', status: 'TODO' },
  { id: 'done', title: 'Already completed', status: 'DONE' },
];
let actions, project, replaceProject;
let animations;
function Harness({ persist }) {
  const ref = useRef(null);
  const [data, setData] = useState({ tasks });
  project = data;
  replaceProject = setData;
  actions = useTaskCompletion(ref, data, setData, persist);
  return <div ref={ref}>
    <div ref={actions.liveRef} aria-live="polite" />
    {['TODO', 'IN_PROGRESS', 'DONE'].map(status => <section key={status}>
      <span data-completion-count={status}>{data.tasks.filter(t => t.status === status).length}</span>
      {data.tasks.filter(t => t.status === status).map(t => <div key={t.id}
        data-testid={t.id} data-completion-id={t.id} data-completion-status={t.status}>
        <button className="pm-task-check">{t.title}</button>
      </div>)}
    </section>)}
  </div>;
}
const rowTask = id => project.tasks.find(t => t.id === id);
const flush = async () => act(async () => { await Promise.resolve(); });
async function invokeUndo() {
  const [renderer] = toast.custom.mock.calls.at(-1);
  const content = renderer({ visible: true });
  const button = content.props.children[1];
  let promise;
  act(() => { promise = button.props.onClick(); });
  await act(async () => { await promise; });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  window.matchMedia = jest.fn(() => ({ matches: false }));
  animations = [];
  Element.prototype.animate = jest.fn((frames, options) => {
    const animation = { frames, options, cancel: jest.fn() };
    animations.push(animation);
    return animation;
  });
});
afterEach(() => { jest.useRealTimers(); delete Element.prototype.animate; });

test('initial, reordered, and remote completion renders never celebrate', () => {
  render(<Harness persist={jest.fn()} />);
  act(() => replaceProject({ tasks: [...tasks].reverse().map(t => ({ ...t, status: 'DONE' })) }));
  expect(taskBurst).not.toHaveBeenCalled();
  expect(Element.prototype.animate).not.toHaveBeenCalled();
  expect(toast.custom).not.toHaveBeenCalled();
});

test('optimistic drop lands before effects, then Undo restores original status and position', async () => {
  let resolveSave;
  const persist = jest.fn((id, body) => new Promise(resolve => { resolveSave = () => resolve({ id, ...body }); }));
  render(<Harness persist={persist} />);
  let moving;
  act(() => { moving = actions.move([rowTask('target')], 'DONE', { left: 20, top: 50 }); });
  expect(rowTask('target').status).toBe('DONE');
  expect(screen.getByTestId('target').classList.contains('pm-task-landing')).toBe(true);
  expect(taskBurst).not.toHaveBeenCalled();
  const landing = animations.find(a => a.options.duration === 340);
  act(() => landing.onfinish());
  expect(taskBurst).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('.pm-task-ripple')).toHaveLength(2);
  expect(screen.getByText('Task completed: Target. Undo available')).toBeTruthy();
  await flush();
  await act(async () => { resolveSave(); await moving; });
  persist.mockImplementation((id, body) => Promise.resolve({ id, ...body }));
  await invokeUndo();
  expect(project.tasks.map(t => t.id)).toEqual(tasks.map(t => t.id));
  expect(rowTask('target').status).toBe('IN_PROGRESS');
  expect(actions.order.target).toBeUndefined();
  expect(taskBurst).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('.pm-task-ripple')).toHaveLength(0);
});

test('Undo queues behind an unfinished save and stale responses do not overwrite it', async () => {
  let resolveSave;
  const persist = jest.fn().mockImplementationOnce((id, body) => new Promise(resolve => {
    resolveSave = () => resolve({ id, ...body });
  })).mockImplementation((id, body) => Promise.resolve({ id, ...body }));
  render(<Harness persist={persist} />);
  act(() => { actions.move([rowTask('target')], 'DONE'); });
  await flush();
  const [renderer] = toast.custom.mock.calls.at(-1);
  let undoing;
  act(() => { undoing = renderer({ visible: true }).props.children[1].props.onClick(); });
  expect(rowTask('target').status).toBe('IN_PROGRESS');
  expect(persist).toHaveBeenCalledTimes(1);
  await act(async () => { resolveSave(); await undoing; });
  expect(persist).toHaveBeenLastCalledWith('target', { status: 'IN_PROGRESS' });
  expect(rowTask('target').status).toBe('IN_PROGRESS');
});

test('failed saves roll back only affected rows while another completion succeeds', async () => {
  const persist = jest.fn((id, body) => id === 'target'
    ? Promise.reject(new Error('Save failed')) : Promise.resolve({ id, ...body }));
  render(<Harness persist={persist} />);
  await act(async () => { await Promise.all([
    actions.move([rowTask('target')], 'DONE'), actions.move([rowTask('third')], 'DONE'),
  ]); });
  expect(rowTask('target').status).toBe('IN_PROGRESS');
  expect(rowTask('third').status).toBe('DONE');
  expect(toast.error).toHaveBeenCalledWith('Save failed');
});

test('bulk completion uses one request and one burst, and rolls back skipped tasks', async () => {
  const data = [...tasks, { id: 'fourth', title: 'Fourth', status: 'TODO' }];
  const persist = jest.fn((id, body) => Promise.resolve(id ? { id, ...body } : {
    updated: body.ids.filter(tid => tid !== 'third').map(tid => ({ id: tid, status: 'DONE' })),
    skipped: [{ id: 'third', reason: 'Permission denied' }],
  }));
  render(<Harness persist={persist} />);
  act(() => replaceProject({ tasks: data }));
  await act(async () => { await actions.move(data.filter(t => t.status !== 'DONE'), 'DONE'); });
  expect(persist).toHaveBeenCalledTimes(1);
  expect(taskBurst).toHaveBeenCalledTimes(1);
  expect(rowTask('third').status).toBe('TODO');
  expect(rowTask('target').status).toBe('DONE');
  await invokeUndo();
  expect(project.tasks.map(t => t.status)).toEqual(data.map(t => t.status));
  expect(taskBurst).toHaveBeenCalledTimes(1);
});

test('reduced motion omits bursts, ripples, flying movement, and counter bounce', async () => {
  window.matchMedia.mockReturnValue({ matches: true });
  render(<Harness persist={(id, body) => Promise.resolve({ id, ...body })} />);
  await act(async () => { await actions.move([rowTask('target')], 'DONE', { left: 20, top: 50 }); });
  expect(rowTask('target').status).toBe('DONE');
  expect(taskBurst).not.toHaveBeenCalled();
  expect(Element.prototype.animate).not.toHaveBeenCalled();
  expect(document.querySelectorAll('.pm-task-ripple')).toHaveLength(0);
});

test('20 complete/Undo cycles leave no temporary nodes or timers; unmount cancels active effects', async () => {
  const { unmount } = render(<Harness persist={(id, body) => Promise.resolve({ id, ...body })} />);
  for (let i = 0; i < 20; i++) {
    await act(async () => { await actions.move([rowTask('target')], 'DONE'); });
    await invokeUndo();
    act(() => jest.advanceTimersByTime(1500));
    expect(document.querySelectorAll('.pm-task-ripple, .pm-task-celebrating, .pm-task-landing')).toHaveLength(0);
  }
  await act(async () => { await actions.move([rowTask('target')], 'DONE', { left: 20, top: 50 }); });
  const landing = animations.at(-3);
  unmount();
  expect(cancelTaskBursts).toHaveBeenCalled();
  expect(landing.cancel).toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(0));
  expect(jest.getTimerCount()).toBe(0);
});
