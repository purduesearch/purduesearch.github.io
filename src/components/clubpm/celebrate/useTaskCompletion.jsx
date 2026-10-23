import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { taskBurst, cancelTaskBursts, retainTaskConfetti, releaseTaskConfetti } from './taskConfetti';

export const TaskCompletionContext = createContext(null);
export const useTaskCompletionActions = () => useContext(TaskCompletionContext);
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const mapTasks = (tasks, update) => tasks.map(t => {
  const next = update(t);
  return next.subtasks ? { ...next, subtasks: next.subtasks.map(update) } : next;
});

function positionOf(tasks, id) {
  let parentId = null, list = tasks;
  if (!list.some(t => t.id === id)) {
    const parent = tasks.find(t => t.subtasks?.some(s => s.id === id));
    if (parent) { parentId = parent.id; list = parent.subtasks; }
  }
  const index = list.findIndex(t => t.id === id);
  return { parentId, index, previous: list[index - 1]?.id, next: list[index + 1]?.id };
}

function restorePositions(tasks, records) {
  let result = tasks;
  records.filter(r => r.position).sort((a, b) => a.position.index - b.position.index).forEach(record => {
    const restoreList = list => {
      const item = list.find(t => t.id === record.id);
      if (!item) return list;
      const rest = list.filter(t => t.id !== record.id);
      const next = rest.findIndex(t => t.id === record.position.next);
      const previous = rest.findIndex(t => t.id === record.position.previous);
      const index = next >= 0 ? next : previous >= 0 ? previous + 1 : Math.min(record.position.index, rest.length);
      rest.splice(Math.max(0, index), 0, item);
      return rest;
    };
    result = record.position.parentId
      ? result.map(t => t.id === record.position.parentId ? { ...t, subtasks: restoreList(t.subtasks ?? []) } : t)
      : restoreList(result);
  });
  return result;
}

// Events are explicitly queued by local mutations, never inferred from props.
export default function useTaskCompletion(rootRef, project, setProject, persist) {
  const pending = useRef([]);
  const running = useRef(new Map());
  const counterAnimations = useRef(new Set());
  const requests = useRef(new Map());
  const versions = useRef(new Map());
  const mounted = useRef(true);
  const pageOwner = useRef({});
  const serial = useRef(0);
  const [order, setOrder] = useState({});
  const orderRef = useRef(order);
  orderRef.current = order;
  const liveRef = useRef(null);
  const announce = message => { if (liveRef.current) liveRef.current.textContent = message; };
  const toastId = useRef(`task-completion-${Math.random()}`);
  const latestUndo = useRef(null);
  const shownUndo = useRef(null);
  const undoRef = useRef(null);

  function enqueue(id, body) {
    const previous = requests.current.get(id) || Promise.resolve();
    const request = previous.catch(() => {}).then(() => persist(id, body));
    requests.current.set(id, request);
    request.finally(() => {
      if (requests.current.get(id) === request) requests.current.delete(id);
    }).catch(() => {});
    return request;
  }

  function enqueueBatch(records, body) {
    const predecessors = records.map(r => requests.current.get(r.id) || Promise.resolve());
    const request = Promise.allSettled(predecessors).then(() => persist(null, {
      ids: records.map(r => r.id), patch: body,
    }));
    const perTask = records.map(record => request.then(response => {
      const skipped = response.skipped?.find(s => s.id === record.id);
      if (skipped) throw new Error(skipped.reason);
      const updated = response.updated?.find(t => t.id === record.id);
      if (!updated) throw new Error('Task was not updated');
      return updated;
    }));
    records.forEach((record, i) => {
      requests.current.set(record.id, perTask[i]);
      perTask[i].finally(() => {
        if (requests.current.get(record.id) === perTask[i]) requests.current.delete(record.id);
      }).catch(() => {});
    });
    return perTask;
  }

  function cancel(id) {
    running.current.get(id)?.();
    running.current.delete(id);
    pending.current = pending.current.filter(event => event.id !== id);
  }

  function restore(records) {
    records.forEach(r => {
      cancel(r.id);
      pending.current.push({ id: r.id, reverse: true });
    });
    setOrder(current => {
      const next = { ...current };
      records.forEach(r => { if (r.rank == null) delete next[r.id]; else next[r.id] = r.rank; });
      orderRef.current = next;
      return next;
    });
    setProject(current => current && ({ ...current, tasks: restorePositions(mapTasks(current.tasks, t => {
      const record = records.find(r => r.id === t.id);
      return record ? { ...t, ...record.before } : t;
    }), records) }));
  }

  async function undo(records) {
    toast.dismiss(toastId.current);
    latestUndo.current = null;
    const eligible = records.filter(r => versions.current.get(r.id) === r.version);
    if (!eligible.length) return;
    const completed = eligible.map(r => ({ ...r, before: { status: 'DONE' }, rank: orderRef.current[r.id], version: ++serial.current }));
    completed.forEach(r => { versions.current.set(r.id, r.version); });
    restore(eligible);
    announce('Completion undone.');
    const results = await Promise.allSettled(eligible.map(r => enqueue(r.id, r.before)));
    if (!mounted.current) return;
    const failed = completed.filter((r, i) => results[i].status === 'rejected' && versions.current.get(r.id) === r.version);
    if (failed.length) {
      restore(failed);
      toast.error('Could not undo completion.');
    }
  }
  undoRef.current = undo;

  function showUndo(records, refresh = false) {
    if (latestUndo.current !== records) return;
    const saved = records.filter(record => !record.failed);
    if (!saved.length) { toast.dismiss(toastId.current); return; }
    if (shownUndo.current === records && !refresh) return;
    shownUndo.current = records;
    const title = saved.length === 1 ? saved[0].title : `${saved.length} tasks`;
    announce(`Task completed: ${title}. Undo available`);
    toast.custom(t => (
      <div className={`clubpm-app pm-completion-toast${t.visible ? ' is-visible' : ''}`}>
        <span>Completed “{title}”</span>
        <button type="button" onClick={() => undoRef.current(saved)}>Undo</button>
      </div>
    ), { id: toastId.current, duration: 4500, position: 'bottom-center' });
  }

  async function move(tasks, status, rect, fields = {}) {
    const records = tasks.filter(t => t.status !== status).map(t => ({
      id: t.id, title: t.title, before: { status: t.status,
        ...Object.fromEntries(Object.keys(fields).filter(key =>
          ['priority', 'dueDate', 'storyPoints', 'estimatedHours'].includes(key)).map(key => [key, t[key]])) },
      source: t.status, rank: orderRef.current[t.id], version: ++serial.current,
      position: positionOf(project?.tasks ?? [], t.id),
    }));
    if (!records.length) return [];
    const burstGate = { played: false, capped: records.length > 3 };
    records.forEach(r => {
      versions.current.set(r.id, r.version);
      cancel(r.id);
      if (status === 'DONE') pending.current.push({ ...r, rect,
        burstGate, toastRecords: records });
      else pending.current.push({ id: r.id, reverse: true });
    });
    if (status === 'DONE') {
      setOrder(current => {
        const next = { ...current };
        records.forEach(r => { next[r.id] = r.version; });
        orderRef.current = next;
        return next;
      });
    }
    const ids = new Set(records.map(r => r.id));
    setProject(current => current && ({ ...current,
      tasks: mapTasks(current.tasks, t => ids.has(t.id) ? { ...t, status, ...fields } : t) }));
    if (status === 'DONE') latestUndo.current = records;
    const body = { status, ...fields };
    const results = await Promise.allSettled(records.length > 1
      ? enqueueBatch(records, body) : records.map(r => enqueue(r.id, body)));
    if (!mounted.current) return [];
    const failed = records.filter((r, i) => results[i].status === 'rejected' && versions.current.get(r.id) === r.version);
    if (failed.length) {
      failed.forEach(record => { record.failed = true; });
      restore(failed);
      if (shownUndo.current === records) showUndo(records, true);
      else if (failed.length === records.length && latestUndo.current === records) toast.dismiss(toastId.current);
      toast.error(results.find(r => r.status === 'rejected')?.reason?.message || 'Could not save task status.');
    }
    results.forEach((result, i) => {
      const record = records[i];
      if (result.status !== 'fulfilled' || versions.current.get(record.id) !== record.version) return;
      setProject(current => current && ({ ...current,
        tasks: mapTasks(current.tasks, t => t.id === record.id ? { ...t, ...result.value } : t) }));
    });
    return results.filter((result, i) => result.status === 'fulfilled' &&
      versions.current.get(records[i].id) === records[i].version).map(r => r.value);
  }

  // Plays another person's completion. Same animation events as move(), but no
  // save, no undo toast and no version bookkeeping: the data is already committed.
  function applyRemote(tasks, status, rect) {
    const records = tasks.map(t => ({ id: t.id, source: t.status }));
    if (!records.length) return;
    const burstGate = { played: false, capped: records.length > 3 };
    records.forEach(r => {
      cancel(r.id);
      if (status === 'DONE') pending.current.push({ id: r.id, source: r.source, rect, burstGate });
      else pending.current.push({ id: r.id, reverse: true });
    });
    if (status === 'DONE') {
      setOrder(current => {
        const next = { ...current };
        records.forEach(r => { next[r.id] = ++serial.current; });
        orderRef.current = next;
        return next;
      });
    }
    const ids = new Set(records.map(r => r.id));
    setProject(current => current && ({ ...current,
      tasks: mapTasks(current.tasks, t => ids.has(t.id) ? { ...t, status } : t) }));
  }

  useLayoutEffect(() => {
    const rows = new Map(Array.from(rootRef.current?.querySelectorAll('[data-completion-id]') || [], row => [row.dataset.completionId, row]));
    // Rows removed by filters, collapsed groups, or page changes stop immediately.
    running.current.forEach((cleanup, id) => {
      if (rows.get(String(id)) !== cleanup.row) cancel(id);
    });
    const events = pending.current.splice(0);
    const counters = new Set();
    events.forEach(event => {
      const row = rows.get(String(event.id));
      if (!event.reverse) { counters.add(event.source); counters.add('DONE'); }
      if (!row) { if (event.toastRecords) showUndo(event.toastRecords); return; }
      const animations = new Set(), timers = new Set(), nodes = new Set();
      const owner = {};
      let disposed = false;
      function cleanup() {
        disposed = true;
        animations.forEach(a => a.cancel());
        timers.forEach(clearTimeout);
        nodes.forEach(n => n.remove());
        cancelTaskBursts(owner);
        row.classList.remove('pm-task-landing', 'pm-task-celebrating');
        running.current.delete(event.id);
      }
      cleanup.row = row;
      running.current.set(event.id, cleanup);
      function later(fn, ms) {
        const timer = setTimeout(() => { timers.delete(timer); if (!disposed) fn(); }, ms);
        timers.add(timer);
      }
      function play(el, frames, options) {
        if (!el?.animate) return null;
        const a = el.animate(frames, options);
        animations.add(a);
        a.onfinish = () => animations.delete(a);
        return a;
      }
      if (event.reverse) {
        play(row, reduced() ? [{ opacity: .4 }, { opacity: 1 }] :
          [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: 'ease-out' });
        later(cleanup, 270);
        return;
      }
      function celebrate() {
        if (disposed || !row.isConnected) { cleanup(); return; }
        row.classList.remove('pm-task-landing');
        row.classList.add('pm-task-celebrating');
        if (event.toastRecords) showUndo(event.toastRecords);
        const circle = row.querySelector('.pm-task-check');
        if (!reduced() && circle) {
          const bounds = circle.getBoundingClientRect();
          const accent = getComputedStyle(circle).getPropertyValue('--pm-task-completed');
          [0, 150].forEach(delay => {
            const ring = document.createElement('span');
            ring.className = 'pm-task-ripple';
            ring.setAttribute('aria-hidden', 'true');
            // Portal the rings past the board's scrolling/overflow ancestors.
            Object.assign(ring.style, { position: 'fixed', inset: 'auto',
              left: `${bounds.left - 2}px`, top: `${bounds.top - 2}px`,
              width: `${bounds.width + 4}px`, height: `${bounds.height + 4}px`,
              borderColor: accent,
              zIndex: '2147483646' });
            ring.style.animationDelay = `${delay}ms`;
            document.body.appendChild(ring);
            nodes.add(ring);
            later(() => { ring.remove(); nodes.delete(ring); }, delay + 800);
          });
          if (!event.burstGate.capped || !event.burstGate.played) {
            event.burstGate.played = true;
            taskBurst(owner, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
          }
        }
        later(cleanup, 1400);
      }
      row.classList.add('pm-task-landing');
      if (event.rect && !reduced()) {
        const end = row.getBoundingClientRect();
        const a = play(row, [
          { transform: `translate(${event.rect.left - end.left}px,${event.rect.top - end.top}px) rotate(1.2deg) scale(1.02)` },
          { transform: 'none' },
        ], { duration: 340, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
        if (a) a.onfinish = () => { animations.delete(a); celebrate(); };
        else celebrate();
      } else celebrate();
    });
    if (!reduced()) counters.forEach(status => {
      const counter = rootRef.current?.querySelector(`[data-completion-count="${status}"]`);
      if (!counter) return;
      counter.getAnimations?.().forEach(a => a.cancel());
      counter.classList.remove('pm-task-count-bounce');
      // WAAPI avoids layout reads and restarts cleanly on rapid completions.
      const animation = counter.animate?.([{ transform: 'scale(1)' },
        { transform: 'scale(1.6)', color: 'var(--clubpm-accent-green)', offset: .4 },
        { transform: 'scale(1)' }], { duration: 500,
        delay: events.some(event => event.rect && !event.reverse) ? 340 : 0,
        easing: 'cubic-bezier(.34,1.56,.64,1)' });
      if (animation) {
        counterAnimations.current.add(animation);
        animation.onfinish = animation.oncancel = () => counterAnimations.current.delete(animation);
      }
    });
  });

  useEffect(() => {
    mounted.current = true;
    const activeRows = running.current;
    const activeCounters = counterAnimations.current;
    const id = toastId.current;
    const page = pageOwner.current;
    retainTaskConfetti(page);
    return () => {
      mounted.current = false;
      activeRows.forEach(cleanup => cleanup());
      releaseTaskConfetti(page);
      pending.current = [];
      activeCounters.forEach(a => a.cancel());
      activeCounters.clear();
      toast.remove(id);
    };
  }, [rootRef]);

  return { move, applyRemote, cancel, order, liveRef };
}
