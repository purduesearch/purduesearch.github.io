import React, { useEffect, useState } from "react";
import { listTourBreakages } from "../../../api/clubPmClient";

/**
 * The authoring view of a WALKTHROUGH section — deliberately read-only.
 *
 * Steps are repo files, not database rows, so there is nothing here to edit.
 * What an author does need is the same two things a step file cannot show them:
 * the steps as a learner will meet them, and whether any of them have recently
 * failed to find their anchor in the live product.
 */
export default function WalkthroughSectionPanel({ section }) {
  const [breakages, setBreakages] = useState([]);
  const cfg = section.tourConfig ?? {};
  const steps = section.tourSteps ?? [];

  useEffect(() => {
    listTourBreakages(section.id).then(setBreakages).catch(() => setBreakages([]));
  }, [section.id]);

  return (
    <div className="pm-tour-editor">
      <div className="cpm-card">
        <h3><i className="fas fa-code" aria-hidden="true" /> Steps are repo files</h3>
        <p>
          This tour is <code>docs/courses/…/walkthroughs/{cfg.tourId ?? "?"}.steps.json</code>. Steps
          target UI elements by anchor id, so they live beside the code that provides those anchors — a
          rename fails the build instead of silently breaking a live tour. Editing one means a pull
          request.
        </p>
      </div>

      {steps.length === 0 ? (
        <p className="pm-tour-editor-empty">
          No steps loaded for this section. Either <code>tourConfig.tourId</code> is unset, or the
          steps file is missing from <code>docs/courses/</code>.
        </p>
      ) : (
        <ol className="pm-tour-editor-steps">
          {steps.map((s, i) => (
            <li key={s.id}>
              <span className="pm-tour-editor-num">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.body}</p>
                <span className="cpm-tag">{s.anchor}</span>
                <span className="cpm-tag">{s.advance?.on}</span>
                {s.optional && <span className="cpm-tag">optional</span>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {breakages.length > 0 && (
        <div className="cpm-card pm-tour-editor-breakages">
          <h3>
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
            {breakages.length} step(s) failed to find their anchor
          </h3>
          <ul>
            {breakages.map((b) => (
              <li key={b.id}>
                <code>{b.payload?.anchor}</code> on <code>{b.payload?.pathname}</code>{" "}
                — {new Date(b.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
