import { act, renderHook } from '@testing-library/react';
import useProjectHeaderScroll from './useProjectHeaderScroll';

describe('project header scroll', () => {
  let main;
  let hero;
  let resize;
  let disconnect;
  let originalObserver;

  beforeEach(() => {
    jest.useFakeTimers();
    originalObserver = global.ResizeObserver;
    disconnect = jest.fn();
    global.ResizeObserver = jest.fn(callback => {
      resize = callback;
      return { observe: jest.fn(), disconnect };
    });
    main = document.createElement('main');
    hero = document.createElement('header');
    hero.className = 'pm-proj-hero';
    Object.defineProperty(hero, 'offsetHeight', { configurable: true, value: 180 });
    main.appendChild(hero);
  });

  afterEach(() => {
    jest.useRealTimers();
    global.ResizeObserver = originalObserver;
  });

  const scroll = top => act(() => {
    main.scrollTop = top;
    main.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(20);
  });

  test('expands near the end of the hero and restores on scrolling back', () => {
    renderHook(() => useProjectHeaderScroll({ current: main }, true, 'project', false, false));
    scroll(135);
    expect(main.style.getPropertyValue('--project-progress-expand')).toBe('0.5');
    scroll(500);
    expect(main.style.getPropertyValue('--project-progress-expand')).toBe('1');
    expect(main.style.getPropertyValue('--project-header-dissolve')).toBe('1');
    scroll(0);
    expect(main.style.getPropertyValue('--project-progress-expand')).toBe('0');
    expect(main.style.getPropertyValue('--project-header-dissolve')).toBe('0');
  });

  test('measures a resized hero and honors an already restored scroll position', () => {
    main.scrollTop = 180;
    renderHook(() => useProjectHeaderScroll({ current: main }, true, 'project', false, false));
    expect(main.style.getPropertyValue('--project-progress-expand')).toBe('1');
    Object.defineProperty(hero, 'offsetHeight', { value: 360 });
    act(() => { resize(); jest.advanceTimersByTime(20); });
    expect(main.style.getPropertyValue('--project-progress-expand')).toBe('0');
  });

  test('waits for the loaded task page and cleans up when leaving Tasks', () => {
    const ref = { current: main };
    const { rerender } = renderHook(({ enabled, loading }) => useProjectHeaderScroll(ref, enabled, 'project', false, loading), {
      initialProps: { enabled: true, loading: true },
    });
    expect(global.ResizeObserver).not.toHaveBeenCalled();
    rerender({ enabled: true, loading: false });
    scroll(180);
    rerender({ enabled: false, loading: false });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(main.scrollTop).toBe(0);
    expect(main.style.getPropertyValue('--project-progress-expand')).toBe('');
    scroll(90);
    expect(main.style.getPropertyValue('--project-progress-expand')).toBe('');
  });
});
