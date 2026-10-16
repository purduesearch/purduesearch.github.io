/* eslint-disable testing-library/no-node-access */
// Effects intentionally own temporary DOM nodes; inspect their cleanup directly.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import toast from 'react-hot-toast';
import useTaskAssignment, { TaskAssignmentContext } from './useTaskAssignment';
import { AvatarStack } from '../TaskPrimitives';
import { taskBurst, cancelTaskBursts } from './taskConfetti';

jest.mock('../anim/LottieCheck', () => () => null);
jest.mock('react-hot-toast', () => ({ __esModule: true, default: Object.assign(jest.fn(), {
  custom: jest.fn(), dismiss: jest.fn(), remove: jest.fn(), error: jest.fn(),
}) }));
jest.mock('./taskConfetti', () => ({ taskBurst: jest.fn(), cancelTaskBursts: jest.fn() }));

const members = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, displayName: `Member ${i}` }));
let actions, data, replace;
function Harness({ persist, initial = members.slice(0, 5), onCommit }) {
  const ref = useRef(null);
  const [project, setProject] = useState({ id: 'project', tasks: [{ id: 'task', title: 'Target', status: 'TODO', assignees: initial }] });
  data = project; replace = setProject;
  actions = useTaskAssignment(ref, project, setProject, persist);
  useLayoutEffect(() => { onCommit?.(ref.current); });
  return <TaskAssignmentContext.Provider value={actions}><div ref={ref}>
    <div ref={actions.liveRef} role="status" />
    <div data-assignment-ghost className="cpm-assignee-chip"><div>Avatar</div><span className="cpm-assignee-chip-name">Member 5</span></div>
    {members.map(m => <div key={m.id} data-assignment-source={m.id}><div>{m.displayName}</div></div>)}
    {project.tasks.map(t => <div key={t.id} data-completion-id={t.id} data-testid="row"><AvatarStack taskId={t.id} assignees={t.assignees} /></div>)}
  </div></TaskAssignmentContext.Provider>;
}
const ids = () => data.tasks[0].assignees.map(a => a.id);
const flush = async () => act(async () => { await Promise.resolve(); });
async function advance(ms) {
  for (let i = 0; i < ms; i += 40) await act(async () => { jest.advanceTimersByTime(Math.min(40, ms - i)); });
}
async function undo() {
  const [renderer] = toast.custom.mock.calls.at(-1);
  const view = render(renderer({ visible: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  view.unmount();
  await flush();
}
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers();
  window.matchMedia = jest.fn(() => ({ matches: false }));
  Element.prototype.animate = jest.fn(() => ({ cancel: jest.fn() }));
});
afterEach(() => { jest.useRealTimers(); delete Element.prototype.animate; });

test('five visible avatars before overflow; hover opens and closes the landing preview', () => {
  render(<Harness persist={jest.fn()} />);
  expect(document.querySelectorAll('[data-assignment-member]')).toHaveLength(5);
  expect(document.querySelector('.cpm-avatar-extra')).toBeNull();
  act(() => actions.setHover({ id: 'task', memberIds: ['m5'] }));
  expect(screen.getByText('Drop to assign')).toBeTruthy();
  act(() => actions.setHover(null));
  expect(screen.queryByText('Drop to assign')).toBeNull();
});

test('dropping keeps the hover landing slot and existing avatars through every pre-flight commit', async () => {
  const commits = [];
  render(<Harness persist={jest.fn().mockResolvedValue({})} onCommit={root => commits.push({
    placeholder: root.querySelector('.pm-assignment-placeholder'),
    members: Array.from(root.querySelectorAll('[data-assignment-member]'), el => el.dataset.assignmentMember),
  })} />);
  act(() => actions.setHover({ id: 'task', memberIds: ['m5'] }));
  await advance(400);
  const placeholder = document.querySelector('.pm-assignment-placeholder');
  expect(placeholder).not.toBeNull();
  commits.length = 0;
  Element.prototype.animate.mockClear();

  act(() => {
    // ProjectDetail ends the drag before handing the drop to assign().
    actions.endDrag();
    actions.assign('task', [members[5]], true);
  });
  await flush();
  await advance(250);

  expect(ids()).toContain('m5');
  expect(document.querySelector('.pm-assignment-flight')).not.toBeNull();
  expect(commits.length).toBeGreaterThan(0);
  commits.forEach(commit => {
    expect(commit.placeholder).toBe(placeholder);
    expect(commit.members).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });
  const previewRestarts = Element.prototype.animate.mock.calls.filter(([frames]) =>
    frames.some(frame => /^translateX\(/.test(frame.transform ?? '')));
  expect(previewRestarts).toHaveLength(0);
});

test('shared avatar stacks work without an assignment task id, inside and outside the provider', () => {
  const view = render(<AvatarStack assignees={members.slice(0, 5)} />);
  expect(document.querySelectorAll('[data-assignment-member]')).toHaveLength(5);
  view.rerender(<TaskAssignmentContext.Provider value={{ hover: null, presentation: null }}>
    <AvatarStack assignees={members.slice(0, 6)} />
  </TaskAssignmentContext.Provider>);
  expect(screen.getByText('+1')).toBeTruthy();
});

test('empty drop, panel cancellation, denied targets and duplicates do not save', async () => {
  const persist = jest.fn(); render(<Harness persist={persist} />);
  act(() => actions.endDrag(true));
  expect(document.querySelector('.pm-assignment-cancel')).toBeTruthy();
  expect(document.querySelector('.pm-assignment-cancel').classList.contains('clubpm-app')).toBe(false);
  await advance(240);
  await act(async () => { await actions.assign('missing', [members[5]], true); await actions.assign('task', [members[5]], false); });
  await advance(240);
  await act(async () => { await actions.assign('task', [members[0]], true); });
  expect(persist).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith('Member 0 is already assigned to Target');
  await advance(240);
  expect(document.querySelector('.pm-assignment-cancel')).toBeNull();
});

test('group additions save instantly, hop sequentially, displace into +N, and Undo removes only additions', async () => {
  const persist = jest.fn().mockResolvedValue({}); render(<Harness persist={persist} />);
  act(() => { actions.assign('task', [members[5], members[6], members[5]], true); });
  expect(ids()).toEqual(['m6', 'm5', 'm0', 'm1', 'm2', 'm3', 'm4']);
  await flush(); expect(persist).toHaveBeenCalledTimes(1);
  await advance(250);
  expect(document.querySelectorAll('.pm-assignment-flight')).toHaveLength(1);
  expect(screen.queryByText('Drop to assign')).toBeNull();
  await advance(300);
  expect(document.querySelectorAll('.pm-assignment-flight')).toHaveLength(2);
  await advance(340);
  expect(taskBurst).toHaveBeenCalledTimes(1);
  await advance(320);
  expect(taskBurst).toHaveBeenCalledTimes(2);
  await advance(1600);
  expect(document.querySelector('.pm-assignment-flight')).toBeNull();
  expect(screen.getByText('+2')).toBeTruthy();
  await undo();
  expect(ids()).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  await advance(280);
  expect(screen.queryByText('+2')).toBeNull();
  expect(persist.mock.calls.at(-1)[1].assigneeIds).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
});

test('Undo queues behind an unfinished save and stale responses cannot re-add members', async () => {
  let resolve;
  const persist = jest.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({});
  render(<Harness persist={persist} />);
  act(() => { actions.assign('task', [members[5]], true); }); await flush();
  await undo();
  expect(ids()).not.toContain('m5'); expect(persist).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ assignees: [...members.slice(0, 5), members[5]] }); });
  await flush();
  expect(persist).toHaveBeenCalledTimes(2);
  expect(persist.mock.calls[1][1].assigneeIds).not.toContain('m5');
  expect(ids()).not.toContain('m5');
});

test('failed earlier drop is excluded from a later queued save; later optimistic additions survive', async () => {
  let reject;
  const persist = jest.fn().mockImplementationOnce(() => new Promise((_, r) => { reject = r; })).mockResolvedValue({});
  render(<Harness persist={persist} />);
  act(() => { actions.assign('task', [members[5]], true); }); await flush();
  act(() => { actions.assign('task', [members[6]], true); });
  await act(async () => { reject(new Error('Denied')); }); await flush();
  expect(ids()).not.toContain('m5'); expect(ids()).toContain('m6');
  expect(persist.mock.calls[1][1].assigneeIds).not.toContain('m5');
  expect(toast.error).toHaveBeenCalledWith('Denied');
});

test('reduced motion omits flights and bursts; scroll, repeated drops, removed rows and unmount clean up', async () => {
  const view = render(<Harness persist={jest.fn().mockResolvedValue({})} />);
  act(() => { actions.assign('task', [members[5]], true); }); await advance(300);
  expect(document.querySelector('.pm-assignment-flight')).toBeTruthy();
  fireEvent.scroll(window);
  expect(document.querySelector('.pm-assignment-flight')).toBeNull();
  window.matchMedia = () => ({ matches: true });
  act(() => { actions.assign('task', [members[6]], true); }); await advance(400);
  expect(taskBurst).not.toHaveBeenCalled();
  expect(document.querySelector('.pm-assignment-flight')).toBeNull();
  act(() => replace({ ...data, tasks: [] }));
  view.unmount();
  expect(document.querySelectorAll('.pm-assignment-flight, .pm-assignment-ring, .pm-assignment-dot, .pm-assignment-cancel')).toHaveLength(0);
  expect(cancelTaskBursts).toHaveBeenCalled();
});

test('effects failing never prevent the assignment mutation', async () => {
  Element.prototype.animate = () => { throw new Error('Animation unavailable'); };
  const persist = jest.fn().mockResolvedValue({});
  render(<Harness persist={persist} />);
  act(() => { actions.assign('task', [members[5]], true); });
  await advance(1200);
  expect(persist).toHaveBeenCalledTimes(1); expect(ids()).toContain('m5');
  expect(document.querySelector('.pm-assignment-flight')).toBeNull();
});

test('unmount between hops cannot create nodes after cleanup; pending saves remain independent', async () => {
  let resolve;
  const persist = jest.fn(() => new Promise(r => { resolve = r; }));
  const view = render(<Harness persist={persist} />);
  act(() => { actions.assign('task', [members[5], members[6]], true); });
  await flush();
  view.unmount();
  await advance(1600);
  await act(async () => { resolve({}); });
  expect(persist).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('.pm-assignment-flight, .pm-assignment-ring, .pm-assignment-dot, .pm-assignment-cancel')).toHaveLength(0);
});

test('twenty assign/Undo cycles leave no effects or timers', async () => {
  const view = render(<Harness persist={jest.fn().mockResolvedValue({})} />);
  const assign = actions.assign;
  for (let i = 0; i < 20; i++) {
    act(() => { assign('task', [members[5]], true); });
    await advance(2600);
    await undo();
    await advance(300);
  }
  expect(ids()).not.toContain('m5');
  view.unmount();
  act(() => jest.advanceTimersByTime(0));
  expect(document.querySelectorAll('.pm-assignment-flight, .pm-assignment-ring, .pm-assignment-dot, .pm-assignment-cancel')).toHaveLength(0);
  expect(jest.getTimerCount()).toBe(0);
});
