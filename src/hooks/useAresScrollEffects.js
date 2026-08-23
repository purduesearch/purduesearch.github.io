import { useEffect } from 'react';

/**
 * The two scroll effects specific to the ARES hub.
 *
 * 1. GRAVITY DRAIN — the hero's background particle drift is coupled to scroll
 *    position, so crossing out of the opening sections kills the upward motion.
 *    The page performs its own subject rather than describing it.
 *
 * 2. CONCENTRATION TINT — section backgrounds walk from cream toward warm
 *    ochre through the bubble and exposure sections, reading as accumulation.
 *
 * Both are disabled entirely under prefers-reduced-motion — not slowed, not
 * shortened. A scroll-coupled animation is exactly what that setting is for.
 *
 * GSAP is imported dynamically so it does not enter the /ares initial chunk.
 */
export default function useAresScrollEffects(heroRef, tintRef) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let ctx = null;
    let cancelled = false;

    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        if (heroRef.current) {
          // Written onto the nearest .ares-page ancestor, not heroRef.current
          // itself. --ares-drift's declared starting value lives on .ares-page
          // (public/ares-theme.css), and in Ares.jsx the hero div and the
          // #ares-gravity section holding PlumeSimulator's canvas are SIBLINGS
          // under <main> — neither is a descendant of the other. CSS custom
          // properties only inherit downward through the DOM tree, so tweening
          // the property on the hero div alone would update the hero's own
          // subtree and never reach the canvas, silently animating a property
          // nothing responds to. Writing it on the shared .ares-page ancestor
          // makes the value visible to every descendant, including the canvas,
          // while `trigger` below still keys the scroll-linked *timing* to the
          // hero div specifically, so the drift still dies on leaving the hero.
          const driftTarget = heroRef.current.closest('.ares-page') || heroRef.current;
          gsap.to(driftTarget, {
            '--ares-drift': 0,
            ease: 'none',
            scrollTrigger: {
              trigger: heroRef.current,
              start: 'top top',
              end: 'bottom top',
              scrub: true,
            },
          });
        }

        if (tintRef.current) {
          // GSAP's CSS colour parser interpolates between concrete colour
          // values frame by frame — it cannot resolve a `var(...)` reference
          // itself, so animating straight to/from the token strings (as
          // written) would silently no-op. Resolving both tokens to their
          // computed colour on this element first keeps public/ares-theme.css
          // as the single source of truth for the palette, rather than
          // hardcoding a second copy of the two hex values in this hook.
          // Fallbacks mirror --ares-conc-0 / --ares-conc-2 for the case
          // getPropertyValue can't resolve them (property missing/unsupported).
          const computed = getComputedStyle(tintRef.current);
          const concStart = computed.getPropertyValue('--ares-conc-0').trim() || '#f5efe6';
          const concEnd = computed.getPropertyValue('--ares-conc-2').trim() || '#e6d0ac';

          gsap.fromTo(tintRef.current,
            { backgroundColor: concStart },
            {
              backgroundColor: concEnd,
              ease: 'none',
              scrollTrigger: {
                trigger: tintRef.current,
                start: 'top 80%',
                end: 'bottom 40%',
                scrub: true,
              },
            });
        }
      });
    })();

    return () => {
      cancelled = true;
      if (ctx) ctx.revert();
    };
  }, [heroRef, tintRef]);
}
