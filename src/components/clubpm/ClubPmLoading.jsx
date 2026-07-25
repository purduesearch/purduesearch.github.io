/**
 * Suspense fallback for every /clubpm/* route.
 *
 * This renders while the route chunk and public/clubpm-theme.css are still in
 * flight, so it can only rely on styles that already exist at that moment —
 * i.e. search-theme.css (see its "ClubPM boot screen" section). Do not move
 * .clubpm-boot* into clubpm-theme.css: that is the very sheet being waited on.
 */
export default function ClubPmLoading({ label = 'Loading' }) {
  return (
    <div className="clubpm-boot" role="status" aria-live="polite">
      <div className="clubpm-boot-ring" aria-hidden="true" />
      <span className="clubpm-boot-label">{label}</span>
    </div>
  );
}
