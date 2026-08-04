import React, { useState } from 'react';
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

  const launch = async () => {
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
        returnTo: `/clubpm/outreach/courses/${courseSlug}/learn`,
        resumeAt: section.maxStepIndex ?? 0,
      });
    } catch (err) {
      toast.error(err.message ?? 'Could not start that walkthrough');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pm-tour-launch">
      <h3><i className="fas fa-hand-pointer" aria-hidden="true" /> {steps.length} steps</h3>
      <p>
        You&apos;re about to leave this page and drive Constellation itself. We&apos;ll dim everything
        that isn&apos;t relevant and point at exactly where to go — and bring you back here at the end.
      </p>
      {cfg.requiresTrainingProject && (
        <p className="pm-tour-launch-sandbox">
          <i className="fas fa-shield-halved" aria-hidden="true" /> Anything you do happens in your own
          private training project. It touches no real club data and earns no XP.
        </p>
      )}
      <button type="button" className="clubpm-btn-primary" onClick={launch} disabled={busy}>
        {busy ? 'Setting up…' : done ? 'Run it again' : 'Start walkthrough'}
      </button>
      {done && (
        <span className="cpm-tag">
          <i className="fas fa-circle-check" aria-hidden="true" /> Completed
        </span>
      )}
    </div>
  );
}
