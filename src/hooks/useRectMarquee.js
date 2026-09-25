import { useCallback, useEffect, useRef } from 'react';

// Rectangle-marquee drag across a grid of cells, for mouse and touch.
// Cells opt in with data-mq="1" data-di={dayIndex} data-ti={timeIndex}.
// While dragging, the cell under the pointer is resolved with
// elementFromPoint because a touch pointer stays captured by the cell the
// drag started on. Same mechanics as MeetingPollBoard's availability grid.

function rectOf(dr) {
  return {
    d0: Math.min(dr.anchorDi, dr.di), d1: Math.max(dr.anchorDi, dr.di),
    t0: Math.min(dr.anchorTi, dr.ti), t1: Math.max(dr.anchorTi, dr.ti),
    anchorDi: dr.anchorDi, anchorTi: dr.anchorTi,
  };
}

/**
 * @param {{ onChange?: (rect) => void, onEnd?: (rect, info: { clientX, clientY, cancelled }) => void }} callbacks
 * @returns {(di: number, ti: number, event?: PointerEvent) => void} begin — call from a cell's onPointerDown
 */
export default function useRectMarquee({ onChange, onEnd }) {
  const dragRef = useRef(null);
  const cbRef = useRef({ onChange, onEnd });
  useEffect(() => { cbRef.current = { onChange, onEnd }; }, [onChange, onEnd]);

  useEffect(() => {
    function move(e) {
      const dr = dragRef.current;
      if (!dr) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest ? el.closest('[data-mq="1"]') : null;
      if (!cell) return;
      const di = Number(cell.getAttribute('data-di'));
      const ti = Number(cell.getAttribute('data-ti'));
      if (Number.isNaN(di) || Number.isNaN(ti) || (di === dr.di && ti === dr.ti)) return;
      dr.di = di; dr.ti = ti;
      if (typeof e.clientX === 'number') { dr.x = e.clientX; dr.y = e.clientY; }
      cbRef.current.onChange?.(rectOf(dr));
    }
    function finish(e, cancelled) {
      const dr = dragRef.current;
      if (!dr) return;
      dragRef.current = null;
      const clientX = typeof e.clientX === 'number' ? e.clientX : dr.x;
      const clientY = typeof e.clientY === 'number' ? e.clientY : dr.y;
      cbRef.current.onEnd?.(rectOf(dr), { clientX, clientY, cancelled });
    }
    const up = (e) => finish(e, false);
    const cancel = (e) => finish(e, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  return useCallback((di, ti, e) => {
    dragRef.current = { anchorDi: di, anchorTi: ti, di, ti, x: e?.clientX ?? 0, y: e?.clientY ?? 0 };
    cbRef.current.onChange?.(rectOf(dragRef.current));
  }, []);
}
