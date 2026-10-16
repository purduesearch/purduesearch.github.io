// Tab strip for the profile. A single accent "pill" slides under the active tab;
// arrow keys / Home / End move between tabs (roving tabindex), and the strip
// scrolls the active tab into view on narrow screens.

import { useCallback, useLayoutEffect, useRef, useState } from "react";

export default function ProfileTabs({ tabs, active, onChange }) {
  const listRef = useRef(null);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  const measure = useCallback(() => {
    const list = listRef.current;
    const el = list?.querySelector('[aria-selected="true"]');
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
    if (el.scrollIntoView && list.scrollWidth > list.clientWidth) {
      list.scrollTo?.({ left: el.offsetLeft - 12, behavior: "smooth" });
    }
  }, []);

  const signature = tabs.map(t => `${t.id}:${t.badge ?? ""}`).join("|");
  useLayoutEffect(() => { measure(); }, [measure, active, signature]);
  useLayoutEffect(() => {
    window.addEventListener("resize", measure);
    const fonts = document.fonts?.ready;
    fonts?.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const onKeyDown = (e) => {
    const i = tabs.findIndex(t => t.id === active);
    let next = null;
    if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
    else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === "Home") next = tabs[0];
    else if (e.key === "End") next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    requestAnimationFrame(() => listRef.current?.querySelector(`#cpm-pf-tab-${next.id}`)?.focus());
  };

  return (
    <div className="cpm-pf-tabs" role="tablist" aria-label="Profile sections" ref={listRef} onKeyDown={onKeyDown}>
      <span
        className="cpm-pf-tab-pill"
        aria-hidden="true"
        style={{ transform: `translateX(${pill.left}px)`, width: pill.width, opacity: pill.ready ? 1 : 0 }}
      />
      {tabs.map(t => (
        <button
          key={t.id}
          id={`cpm-pf-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          aria-controls={`cpm-pf-panel-${t.id}`}
          tabIndex={active === t.id ? 0 : -1}
          className="cpm-pf-tab"
          onClick={() => onChange(t.id)}
        >
          <i className={`fas ${t.icon}`} aria-hidden="true" />
          <span>{t.label}</span>
          {t.badge ? <b className="cpm-pf-tab-badge" aria-label={`${t.badge} ${t.badgeLabel ?? "new"}`}>{t.badge}</b> : null}
        </button>
      ))}
    </div>
  );
}
