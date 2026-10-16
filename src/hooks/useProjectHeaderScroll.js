import { useEffect } from 'react';

// The task page owns one scroll container so the hero can leave naturally while
// the progress row sticks. Updating CSS avoids rerendering the board on scroll.
export default function useProjectHeaderScroll(mainRef, enabled, projectId, compact, loading) {
  useEffect(() => {
    const main = mainRef.current;
    if (!enabled || loading || !main) return undefined;
    const hero = main.querySelector('.pm-proj-hero');
    if (!hero) return undefined;
    let frame = 0;
    let height = hero.offsetHeight;
    const clamp = value => Math.max(0, Math.min(1, value));
    const update = () => {
      frame = 0;
      const y = main.scrollTop;
      main.style.setProperty('--project-header-dissolve', clamp(y / Math.max(1, height * 0.85)));
      main.style.setProperty('--project-progress-expand', clamp((y - Math.max(0, height - 90)) / Math.min(90, Math.max(1, height))));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(() => {
      height = hero.offsetHeight;
      schedule();
    });
    observer.observe(hero);
    main.addEventListener('scroll', schedule, { passive: true });
    update();
    return () => {
      main.removeEventListener('scroll', schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
      // Other tabs retain their own inner scroller; don't carry the task
      // container's offset into their fixed header and conversation layout.
      main.scrollTop = 0;
      main.style.removeProperty('--project-header-dissolve');
      main.style.removeProperty('--project-progress-expand');
    };
  }, [mainRef, enabled, projectId, compact, loading]);
}
