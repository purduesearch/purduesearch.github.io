import { advanceParticle, taskBurst, cancelTaskBursts, retainTaskConfetti, releaseTaskConfetti } from './taskConfetti';

test('particle trajectories and lifespan agree at 60Hz and 120Hz', () => {
  const initial = { x: 5, y: 8, vx: 6, vy: -10, rotation: .2, spin: .1, age: 0 };
  const sixty = { ...initial }, oneTwenty = { ...initial };
  for (let i = 0; i < 60; i++) advanceParticle(sixty, 1000 / 60);
  for (let i = 0; i < 120; i++) advanceParticle(oneTwenty, 1000 / 120);
  Object.keys(initial).forEach(key => expect(sixty[key]).toBeCloseTo(oneTwenty[key], 8));
});

test('a mounted page reuses its idle canvas without a running RAF and releases it on unmount', () => {
  const ctx = Object.fromEntries(['setTransform', 'clearRect'].map(k => [k, jest.fn()]));
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  window.matchMedia = () => ({ matches: false });
  const page = {}, row = {};
  retainTaskConfetti(page);
  expect(raf).not.toHaveBeenCalled();
  const canvas = document.querySelector('.pm-task-confetti');
  for (let i = 0; i < 20; i++) {
    taskBurst(row, 20, 30);
    cancelTaskBursts(row);
    expect(document.querySelector('.pm-task-confetti')).toBe(canvas);
    expect(canvas.hasAttribute('data-active')).toBe(false);
  }
  expect(getContext).toHaveBeenCalledTimes(1);
  releaseTaskConfetti(page);
  expect(document.querySelector('.pm-task-confetti')).toBeNull();
  getContext.mockRestore(); raf.mockRestore(); cancel.mockRestore();
});

test('bursts share one canvas and loop, stop when empty, and release listeners', () => {
  const ctx = Object.fromEntries(['setTransform', 'clearRect', 'save', 'translate', 'rotate', 'beginPath', 'arc', 'fill', 'fillRect', 'restore'].map(k => [k, jest.fn()]));
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const add = jest.spyOn(window, 'addEventListener'), remove = jest.spyOn(window, 'removeEventListener');
  const callbacks = [];
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.push(callback); return callbacks.length; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  window.matchMedia = () => ({ matches: false });
  const a = {}, b = {};
  taskBurst(a, 30, 40);
  taskBurst(b, 90, 80);
  expect(document.querySelectorAll('.pm-task-confetti')).toHaveLength(1);
  expect(raf).toHaveBeenCalledTimes(1);
  cancelTaskBursts(a);
  expect(document.querySelectorAll('.pm-task-confetti')).toHaveLength(1);
  callbacks[0](performance.now() + 1400);
  expect(document.querySelectorAll('.pm-task-confetti')).toHaveLength(0);
  expect(add).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(cancel).toHaveBeenCalled();
  getContext.mockRestore(); add.mockRestore(); remove.mockRestore(); raf.mockRestore(); cancel.mockRestore();
});
