import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { taskBurst, cancelTaskBursts } from './taskConfetti';

export const TaskAssignmentContext = createContext(null);
export const useTaskAssignmentActions = () => useContext(TaskAssignmentContext);
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
export const assignmentTasks = tasks => (tasks ?? []).flatMap(t => [t, ...(t.subtasks ?? [])]);

// Assignment writes and effects have separate lifetimes. Cancelling a flight
// never cancels its save. Each task's writes are serialized, including Undo.
export default function useTaskAssignment(rootRef, project, setProject, persist) {
  const current = useRef(project);
  current.current = project;
  const mounted = useRef(true);
  const requests = useRef(new Map());
  const confirmed = useRef(new Map());
  const running = useRef(null);
  const pending = useRef(null);
  const latest = useRef(null);
  const liveRef = useRef(null);
  const [presentation, setPresentation] = useState(null);
  const [hover, setHover] = useState(null);
  const [frontOrder, setFrontOrder] = useState({});
  const tilt = useRef({ x: 0, angle: 0 });
  const toastId = useRef(`assignment-${Math.random()}`);

  function announce(message) { if (liveRef.current) liveRef.current.textContent = message; }
  function update(id, updater) {
    const change = data => data && ({ ...data, tasks: data.tasks.map(t => ({
      ...((t.id === id) ? updater(t) : t),
      ...(t.subtasks ? { subtasks: t.subtasks.map(s => s.id === id ? updater(s) : s) } : {}),
    })) });
    current.current = change(current.current);
    setProject(change);
  }
  function enqueue(id, change) {
    const previous = requests.current.get(id) ?? Promise.resolve();
    const request = previous.catch(() => {}).then(change);
    requests.current.set(id, request);
    request.finally(() => {
      if (requests.current.get(id) === request) requests.current.delete(id);
    }).catch(() => {});
    return request;
  }
  function cancel() {
    pending.current = null;
    running.current?.();
    running.current = null;
    if (mounted.current) setPresentation(null);
  }
  function start(x = 0) { cancel(); tilt.current = { x, angle: 0 }; }
  function move(x) {
    const previous = tilt.current;
    previous.angle += (Math.max(-16, Math.min(16, (x - previous.x) * .9)) - previous.angle) * .3;
    previous.x = x;
    const ghost = rootRef.current?.querySelector('[data-assignment-ghost]');
    if (ghost) ghost.style.transform = reduced() ? '' : `rotate(${previous.angle}deg)`;
  }
  function endDrag(cancelled = false) {
    setHover(null);
    if (!cancelled) return;
    const ghost = rootRef.current?.querySelector('[data-assignment-ghost]');
    if (ghost) run({ ghost: ghost.cloneNode(true), rect: ghost.getBoundingClientRect(), cancel: true });
  }

  function run(event) {
    cancel();
    // Copy the theme into the effect layer without mounting another app page.
    // .clubpm-app carries page backgrounds, padding and viewport-sized layout.
    const theme = rootRef.current ? getComputedStyle(rootRef.current) : null;
    const themeVariables = theme ? Array.from(theme).filter(name => name.startsWith('--')) : [];
    const nodes = new Set(), animations = new Set(), timers = new Set(), finishers = new Set();
    const owner = {};
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      timers.forEach(clearTimeout);
      animations.forEach(a => a.cancel());
      nodes.forEach(n => n.remove());
      finishers.forEach(resolve => resolve());
      cancelTaskBursts(owner);
      event.row?.classList.remove('pm-assignment-landing');
      if (running.current === cleanup) {
        running.current = null;
        if (mounted.current) setPresentation(null);
      }
    };
    cleanup.row = event.row;
    running.current = cleanup;
    function later(fn, ms) {
      const timer = setTimeout(() => { timers.delete(timer); if (!disposed) fn(); }, ms);
      timers.add(timer);
      return timer;
    }
    function wait(ms) { return new Promise(resolve => { finishers.add(resolve); later(() => { finishers.delete(resolve); resolve(); }, ms); }); }
    function play(el, frames, options) {
      const animation = el?.animate?.(frames, options);
      if (animation) {
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
      return animation;
    }
    function node(className, style, child) {
      const el = document.createElement('div');
      el.className = className;
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, style);
      if (theme) {
        themeVariables.forEach(name => el.style.setProperty(name, theme.getPropertyValue(name)));
        el.style.fontFamily = theme.fontFamily;
        el.style.color = theme.color;
      }
      if (child) el.appendChild(child);
      document.body.appendChild(el);
      nodes.add(el);
      return el;
    }
    const accent = theme?.getPropertyValue('--pm-accent-teal').trim();
    const amber = theme?.getPropertyValue('--pm-accent-amber').trim();
    const cloneAvatar = member => {
      const chip = Array.from(rootRef.current?.querySelectorAll('[data-assignment-source]') ?? [])
        .find(n => n.dataset.assignmentSource === member.id);
      return chip?.firstElementChild?.cloneNode(true);
    };
    async function hop(avatar, from, to, duration = 580, trail = true) {
      if (!avatar || disposed) return;
      const outer = node('pm-assignment-flight', {}, avatar);
      avatar.classList.add('pm-assignment-flight-avatar');
      const height = Math.max(60, Math.abs(to.y - from.y) * .35 + 55);
      play(outer, [{ transform: `translate(${from.x}px,${from.y}px)` }, { transform: `translate(${to.x}px,${to.y}px)` }],
        { duration, easing: 'linear', fill: 'forwards' });
      play(avatar, [{ transform: 'translateY(0) scale(1.1) rotate(0deg)', easing: 'cubic-bezier(.2,.75,.4,1)' },
        { transform: `translateY(${-height}px) scale(1.35) rotate(200deg)`, offset: .48, easing: 'cubic-bezier(.6,0,.8,.3)' },
        { transform: 'translateY(0) scale(1) rotate(360deg)' }], { duration, fill: 'forwards' });
      // Calculate trail positions without reading layout during the flight.
      if (trail) for (let ms = 40; ms < duration; ms += 40) later(() => {
        const k = ms / duration;
        const dot = node('pm-assignment-dot', { left: `${from.x + (to.x - from.x) * k + 9}px`,
          top: `${from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * height + 9}px`, background: accent });
        play(dot, [{ opacity: .8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.1)' }], { duration: 380 });
        later(() => { dot.remove(); nodes.delete(dot); }, 380);
      }, ms);
      await wait(duration);
      outer.remove(); nodes.delete(outer);
    }
    async function sequence() {
      if (event.cancel) {
        const g = node('pm-assignment-cancel', { left: `${event.rect.left}px`, top: `${event.rect.top}px` }, event.ghost);
        play(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
        await wait(210); cleanup(); return;
      }
      if (!event.row?.isConnected) { cleanup(); return; }
      if (event.reverse) {
        const slots = Array.from(event.row.querySelectorAll('[data-assignment-member]'));
        slots.filter(n => event.ids.includes(n.dataset.assignmentMember)).forEach(n =>
          play(n, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.4)', opacity: 0 }], { duration: 220 }));
        await wait(220); cleanup(); return;
      }
      let visible = event.before;
      setPresentation({ id: event.id, assignees: visible, incoming: true });
      await wait(32);
      if (disposed || !event.row.isConnected) { cleanup(); return; }
      const stack = event.row.querySelector('.cpm-avatar-stack');
      const bounds = stack?.getBoundingClientRect();
      if (!bounds) { cleanup(); return; }
      const slots = Array.from(stack.querySelectorAll('[data-assignment-member]'));
      const avatarSize = slots[0]?.getBoundingClientRect().width || 22;
      const spacing = slots.length > 1
        ? slots[1].getBoundingClientRect().left - slots[0].getBoundingClientRect().left
        : avatarSize - 5;
      const from = { x: event.rect.left, y: event.rect.top };
      // Collapse the group pill once. Its avatars then launch at a fixed cadence,
      // independently of landings and overflow hops.
      if (!reduced() && event.ghost) {
        const pill = event.ghost.cloneNode(true);
        pill.style.transform = '';
        const g = node('pm-assignment-cancel', { left: `${from.x}px`, top: `${from.y}px` }, pill);
        play(g, [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(.15)' }], { duration: 200, fill: 'forwards' });
        await wait(200); g.remove(); nodes.delete(g);
      }
      if (disposed) return;
      const cadence = reduced() ? 150 : 300;
      const flights = event.members.map(async (member, index) => {
        if (index) await wait(index * cadence);
        if (disposed || !event.row.isConnected) return;
        const expected = [...event.members.slice(0, index)].reverse().concat(event.before);
        const finalCount = expected.length + 1;
        const width = avatarSize + (Math.min(5, finalCount) - 1 + (finalCount > 5 ? 1 : 0)) * spacing;
        // The stack's right edge stays anchored; calculate each future left slot
        // from the single drop measurement, including the +N slot when needed.
        const to = { x: bounds.right - width, y: bounds.top };
        if (!reduced()) await hop(cloneAvatar(member), from, to);
        if (disposed || !event.row.isConnected) return;
        const displacedId = expected.length >= 5 ? expected[4].id : null;
        const displaced = Array.from(event.row.querySelectorAll('[data-assignment-member]')).find(n => n.dataset.assignmentMember === displacedId);
        const displacedRect = displaced?.getBoundingClientRect();
        const displacedAvatar = displaced?.firstElementChild?.cloneNode(true);
        visible = [member, ...visible];
        event.row.classList.remove('pm-assignment-landing');
        setPresentation({ id: event.id, assignees: visible, incoming: null });
        await wait(32);
        if (disposed || !event.row.isConnected) return;
        const slot = Array.from(event.row.querySelectorAll('[data-assignment-member]')).find(n => n.dataset.assignmentMember === member.id);
        play(slot, reduced() ? [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }] :
          [{ transform: 'scale(1.3,.65)' }, { transform: 'scale(.85,1.2)', offset: .45 }, { transform: 'scale(1)' }],
        { duration: reduced() ? 150 : 420, easing: 'ease-out' });
        if (!reduced()) {
          event.row.classList.add('pm-assignment-landing');
          const center = { x: to.x + avatarSize / 2, y: to.y + avatarSize / 2 };
          [0, 110].forEach(delay => {
            const ring = node('pm-assignment-ring', { left: `${center.x - 14}px`, top: `${center.y - 14}px`, borderColor: accent });
            play(ring, [{ opacity: .9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(3.6)' }],
              { duration: 650, delay, easing: 'ease-out', fill: 'both' });
          });
          taskBurst(owner, center.x, center.y, 20, [accent, amber].filter(Boolean));
          Array.from(event.row.querySelectorAll('[data-assignment-member]')).slice(1).forEach((n, i) =>
            play(n, [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], { duration: 320, delay: 70 * (i + 1) }));
          if (displacedRect && displacedAvatar) {
            const extra = event.row.querySelector('.cpm-avatar-extra')?.getBoundingClientRect();
            if (extra) await hop(displacedAvatar, { x: displacedRect.left, y: displacedRect.top }, { x: extra.left, y: extra.top }, 360, false);
          }
        }
        const chip = Array.from(rootRef.current?.querySelectorAll('[data-assignment-source]') ?? []).find(n => n.dataset.assignmentSource === member.id);
        if (!reduced()) play(chip, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 380 });
        else await wait(150);
      });
      await Promise.all(flights);
      await wait(reduced() ? 0 : 850);
      cleanup();
    }
    sequence().catch(cleanup);
  }

  async function undo(record) {
    if (latest.current !== record || record.failed) return;
    latest.current = null;
    toast.dismiss(toastId.current);
    cancel();
    const task = assignmentTasks(current.current?.tasks).find(t => t.id === record.id);
    if (!task) return;
    const ids = record.members.map(m => m.id);
    setFrontOrder(previous => ({ ...previous, [record.id]: (previous[record.id] ?? []).filter(id => !ids.includes(id)) }));
    const row = Array.from(rootRef.current?.querySelectorAll('[data-completion-id]') ?? []).find(n => n.dataset.completionId === record.id);
    if (row) {
      run({ reverse: true, row, ids });
      setPresentation({ id: record.id, assignees: task.assignees });
    }
    update(record.id, t => ({ ...t, assignees: t.assignees.filter(a => !ids.includes(a.id)) }));
    announce('Assignment undone.');
    try {
      await enqueue(record.id, async () => {
        if (record.failed) return;
        const base = confirmed.current.get(record.id) ?? task.assignees;
        const next = base.filter(a => !ids.includes(a.id));
        const saved = await persist(record.id, { assigneeIds: next.map(a => a.id) });
        confirmed.current.set(record.id, saved?.assignees ?? next);
      });
    } catch (error) {
      if (!mounted.current || current.current?.id !== record.projectId) return;
      cancel();
      update(record.id, t => ({ ...t, assignees: [...record.members.filter(m => !t.assignees.some(a => a.id === m.id)), ...t.assignees] }));
      setFrontOrder(previous => ({ ...previous, [record.id]: [...ids].reverse().concat(previous[record.id] ?? []) }));
      toast.error(error?.message || 'Could not undo assignment.');
    }
  }

  async function assign(id, members, allowed) {
    const task = assignmentTasks(current.current?.tasks).find(t => t.id === id);
    if (!task || !allowed || task.archivedAt) { endDrag(true); return; }
    const added = members.filter((m, i) => m && members.findIndex(a => a?.id === m.id) === i && !task.assignees?.some(a => a.id === m.id));
    const row = Array.from(rootRef.current?.querySelectorAll('[data-completion-id]') ?? []).find(n => n.dataset.completionId === id);
    if (!added.length) {
      endDrag(true);
      if (!reduced()) {
        const existing = Array.from(row?.querySelectorAll('[data-assignment-member]') ?? []).find(n => n.dataset.assignmentMember === members[0]?.id);
        try { existing?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 400 }); } catch { /* Assignment feedback is best effort. */ }
      }
      const message = `${members.length > 1 ? 'These members are' : `${members[0]?.displayName ?? 'Member'} is`} already assigned to ${task.title}`;
      toast(message); announce(message); return;
    }
    const ghost = rootRef.current?.querySelector('[data-assignment-ghost]');
    const rect = ghost?.getBoundingClientRect();
    const record = { id, title: task.title, members: added, failed: false };
    record.projectId = current.current.id;
    latest.current = record;
    setFrontOrder(previous => ({ ...previous, [id]: [...added].reverse().map(m => m.id).concat(previous[id] ?? []) }));
    pending.current = row && rect ? { id, row, rect, ghost: ghost.cloneNode(true), members: added, before: task.assignees ?? [] } : null;
    update(id, t => ({ ...t, assignees: [...added].reverse().concat(t.assignees ?? []) }));
    endDrag();
    const message = `${added.map(m => m.displayName).join(', ')} assigned to ${task.title}`;
    announce(`${message}. Undo available.`);
    toast.custom(t => <div className={`clubpm-app pm-completion-toast${t.visible ? ' is-visible' : ''}`}>
      <span>{message}</span><button type="button" onClick={() => undo(record)}>Undo</button>
    </div>, { id: toastId.current, duration: 4500 + added.length * 1100, position: 'bottom-center' });
    // Queue deltas against confirmed state, never a failed optimistic addition.
    if (!requests.current.has(id)) confirmed.current.set(id, task.assignees ?? []);
    try {
      await enqueue(id, async () => {
        const base = confirmed.current.get(id) ?? [];
        const ids = new Set(added.map(a => a.id));
        const next = [...added].reverse().concat(base.filter(a => !ids.has(a.id)));
        const saved = await persist(id, { assigneeIds: next.map(a => a.id) });
        confirmed.current.set(id, saved?.assignees ?? next);
      });
      return true;
    } catch (error) {
      record.failed = true;
      if (!mounted.current || current.current?.id !== record.projectId) return;
      cancel();
      const ids = new Set(added.map(a => a.id));
      setFrontOrder(previous => ({ ...previous, [id]: (previous[id] ?? []).filter(mid => !ids.has(mid)) }));
      const before = assignmentTasks(current.current?.tasks).find(t => t.id === id)?.assignees;
      const reverseRow = Array.from(rootRef.current?.querySelectorAll('[data-completion-id]') ?? []).find(n => n.dataset.completionId === id);
      if (reverseRow && before) {
        try { run({ reverse: true, row: reverseRow, ids: [...ids] }); setPresentation({ id, assignees: before }); } catch { cancel(); }
      }
      update(id, t => ({ ...t, assignees: t.assignees.filter(a => !ids.has(a.id)) }));
      if (latest.current === record) { latest.current = null; toast.dismiss(toastId.current); }
      toast.error(error?.message || 'Could not save assignment.');
      announce(`Assignment to ${task.title} failed.`);
      return false;
    }
  }

  useLayoutEffect(() => {
    if (running.current?.row && !rootRef.current?.contains(running.current.row)) cancel();
    const event = pending.current;
    if (event) {
      pending.current = null;
      try { run(event); } catch { cancel(); }
    }
  });
  useEffect(() => {
    mounted.current = true;
    latest.current = null;
    setHover(null);
    setFrontOrder({});
    const id = toastId.current;
    const scroll = () => cancel();
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      mounted.current = false;
      running.current?.();
      pending.current = null;
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
      toast.remove(id);
    };
    // The root ref is stable for the lifetime of the project page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, project?.id]);
  return { assign, cancel, start, move, endDrag, hover, setHover, presentation, liveRef, frontOrder };
}
