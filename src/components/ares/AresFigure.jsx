import { useState } from 'react';

/**
 * AresFigure — image slot for every /ares/* page, with a graceful placeholder.
 *
 * Previously copy-pasted into Ares.jsx and TheHeadset.jsx and absent from
 * TheScience.jsx; one copy now, so a fix to the fallback behaviour reaches all
 * three pages.
 *
 * Two states, and both are intentional rather than error handling:
 *   - no `src`, or a `src` that fails to load: renders a dashed instrument
 *     panel naming what belongs there. A slot whose photograph has not been
 *     shot yet should look like a slot, not like a broken image icon.
 *   - with a `src`: the image, plus its caption and credit.
 *
 * `credit` is not optional decoration. Spec §7 requires every third-party
 * figure to carry its source visibly, and the /ares figures include published
 * CFD work that is not ARES's own. If you add an image that came from
 * somewhere else, it gets a credit string.
 *
 * `--standalone` centres the figure under a full-width section; without it the
 * defaults fill a grid cell (the hardware gallery on TheHeadset).
 */
export default function AresFigure({
  src, alt, caption, credit, standalone = false, icon = 'fa-camera', wide = false,
}) {
  const [failed, setFailed] = useState(!src);

  const className = [
    'ares-figure',
    standalone ? 'ares-figure--standalone' : '',
    wide ? 'ares-figure--wide' : '',
  ].filter(Boolean).join(' ');

  if (failed) {
    return (
      <figure className={className}>
        <div className="ares-figure-placeholder" role="img" aria-label={alt}>
          <i className={`fas ${icon}`} aria-hidden="true" />
          <span>{alt}</span>
        </div>
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className={className}>
      <img loading="lazy" src={src} alt={alt} onError={() => setFailed(true)} />
      {(caption || credit) && (
        <figcaption>
          {caption}
          {credit && <span className="ares-figure-credit">{credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}
