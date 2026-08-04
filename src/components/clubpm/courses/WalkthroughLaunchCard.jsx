import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTour } from '../../../clubpm/tour/TourProvider';
import { ensureTrainingProject } from '../../../api/clubPmClient';

/**
 * The hand-off between reading about Constellation and driving it.
 *
 * Two things have to be true before the tour starts, or the learner ends up
 * stranded on a screen with nothing to point at:
 *  - an admin-gated tour is never launched by a non-admin (it visits routes
 *    their account cannot open), so it renders an explanation instead;
 *  - a tour that needs a sandbox has one provisioned first, because its
 *    entryRoute and steps interpolate `:trainingProjectId`.
 */
export default function WalkthroughLaunchCard({ section, courseSlug, preview, isAdmin }) {
  const { startTour } = useTour();
  // Where to put the learner back. Captured from the live location rather than
  // rebuilt from `courseSlug`, because a rebuilt path silently drops the query
  // string — and `?preview=1` is the difference between an author checking their
  // own course and an author being enrolled in it.
  const { pathname, search } = useLocation();
  const [busy, setBusy] = useState(false);
  const cfg = section.tourConfig;
  const steps = section.tourSteps ?? [];
  const done = section.status === 'COMPLETED';

  // A locked section carries no tourConfig at all — the server withholds it the
  // same way it withholds contentJson, so there is nothing to launch.
  if (!cfg?.tourId) {
    return (
      <div className="pm-tour-launch is-locked">
        <h3><i className="fas fa-hand-pointer" aria-hidden="true" /> Walkthrough unavailable</h3>
        <p>This walkthrough has not been configured yet.</p>
      </div>
    );
  }

  if (cfg.requiresAdmin && !isAdmin) {
    return (
      <div className="pm-tour-launch is-locked">
        <h3><i className="fas fa-lock" aria-hidden="true" /> Officers only</h3>
        <p>
          This walkthrough visits admin screens your account can&apos;t open. Ask an officer
          if you think that&apos;s wrong.
        </p>
      </div>
    );
  }

  // A completed section's maxStepIndex is the last step, so resuming from it
  // would drop "Run it again" straight onto the ending. Mid-tour progress is
  // still worth resuming from — only a finished run restarts.
  const savedIndex = done ? 0 : (section.maxStepIndex ?? 0);
  const resumable = savedIndex > 0 && savedIndex < steps.length;

  const launch = async (fromStart = false) => {
    setBusy(true);
    try {
      let projectId = null;
      if (cfg.requiresTrainingProject) {
        const res = await ensureTrainingProject();
        projectId = res?.projectId ?? null;
        if (!projectId) throw new Error('Could not set up your training project');
      }
      const entryRoute = cfg.entryRoute
        ? cfg.entryRoute.replace(':trainingProjectId', projectId ?? '')
        : null;
      startTour({
        sectionId: section.id,
        tourId: cfg.tourId,
        steps,
        entryRoute,
        projectId,
        preview,
        returnTo: `${pathname}${search}` || `/clubpm/courses/${courseSlug}/learn`,
        resumeAt: fromStart ? 0 : savedIndex,
      });
    } catch (err) {
      toast.error(err.message ?? 'Could not start that walkthrough');
    } finally {
      setBusy(false);
    }
  };

  // Roughly 25 s a step: enough to answer "do I have time for this right now",
  // which is the question that actually decides whether they press the button.
  const minutes = Math.max(1, Math.round((steps.length * 25) / 60));

  return (
    <div className="pm-tour-launch">
      <div className="pm-tour-launch-head">
        <span className="pm-tour-launch-icon" aria-hidden="true">
          <i className="fas fa-hand-pointer" />
        </span>
        <div>
          <h3>Hands-on walkthrough</h3>
          <p className="pm-tour-launch-facts">
            <span><i className="fas fa-list-ol" aria-hidden="true" /> {steps.length} steps</span>
            <span><i className="fas fa-clock" aria-hidden="true" /> about {minutes} min</span>
            {done && (
              <span className="is-done">
                <i className="fas fa-circle-check" aria-hidden="true" /> Completed
              </span>
            )}
          </p>
        </div>
      </div>

      <p>
        You&apos;re about to leave this page and drive Constellation itself. We&apos;ll dim everything
        that isn&apos;t relevant and point at exactly where to go — and bring you back here at the end.
        You can pause at any point with <kbd>Esc</kbd> and pick up where you stopped.
      </p>

      {cfg.requiresTrainingProject && (
        <p className="pm-tour-launch-sandbox">
          <i className="fas fa-shield-halved" aria-hidden="true" /> Anything you do happens in your own
          private training project. It touches no real club data and earns no XP.
        </p>
      )}

      <div className="pm-tour-launch-actions">
        <button
          type="button"
          className="clubpm-btn-primary"
          onClick={() => launch(false)}
          disabled={busy}
        >
          {busy
            ? 'Setting up…'
            : resumable
              ? `Resume at step ${savedIndex + 1}`
              : done ? 'Run it again' : 'Start walkthrough'}
          <i className="fas fa-arrow-right" aria-hidden="true" />
        </button>
        {resumable && (
          <button
            type="button"
            className="clubpm-btn-secondary"
            onClick={() => launch(true)}
            disabled={busy}
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}
