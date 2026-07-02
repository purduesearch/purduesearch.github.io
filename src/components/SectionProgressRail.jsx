import { useEffect, useState } from 'react';

/**
 * Sticky progress rail: one dot per section id. Highlights the section
 * in view (IntersectionObserver), click scrolls smoothly. Hidden on
 * <1100px via CSS. sections = [{ id, label }]
 */
export default function SectionProgressRail({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: '-35% 0px -55% 0px' });
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [sections]);

  const jump = (id) => document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });

  return (
    <nav className="section-rail" aria-label="Page sections">
      {sections.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={`section-rail-dot${active === id ? ' active' : ''}`}
          aria-current={active === id ? 'true' : undefined}
          onClick={() => jump(id)}
        >
          <span className="section-rail-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
