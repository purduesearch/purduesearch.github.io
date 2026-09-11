import { useEffect, useId, useRef, useState } from 'react';

/**
 * Small disclosure dropdown used for "Subscribe" and "Add to calendar".
 * Not an ARIA `menu` (that would require arrow-key roving focus); a button +
 * list of links is fully keyboard-usable as-is. Closes on outside click/tap
 * and Escape (Escape returns focus to the toggle).
 *
 * items: [{ label, icon, href?, external?, onSelect?, keepOpen? }]
 */
export default function PublicCalendarMenu({
  label, icon, items, align = 'left', variant = 'solid', footnote = null, ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`home-events-menu${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className={`home-events-menu-btn${variant === 'ghost' ? ' home-events-menu-btn--ghost' : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        {icon && <i className={icon} aria-hidden="true" />}
        <span>{label}</span>
        <i className="fas fa-chevron-down home-events-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className={`home-events-menu-list home-events-menu-list--${align}`}>
          {items.map(item => (
            <li key={item.label}>
              {item.href ? (
                <a
                  href={item.href}
                  className="home-events-menu-item"
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <i className={item.icon} aria-hidden="true" />
                  {item.label}
                </a>
              ) : (
                <button
                  type="button"
                  className="home-events-menu-item"
                  onClick={() => { item.onSelect?.(); if (!item.keepOpen) setOpen(false); }}
                >
                  <i className={item.icon} aria-hidden="true" />
                  {item.label}
                </button>
              )}
            </li>
          ))}
          {footnote && <li className="home-events-menu-note">{footnote}</li>}
        </ul>
      )}
    </div>
  );
}
