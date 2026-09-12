import React, { useEffect, useId, useState } from "react";
import toast from "react-hot-toast";

// Where "Plan with Claude" sends people in step 2. A plain link, not an
// integration — the whole point of this lane is that the club holds no key.
const CLAUDE_URL = "https://claude.ai/new";

// The build → run → paste-back procedure shared by every "Plan with Claude"
// lane (project action plans, blog drafts). The caller owns the prompt and the
// pasted text; this owns the layout, clipboard, and locked/stale states so the
// lanes can't drift in how the procedure reads.
export default function ClaudePromptSteps({
  help,
  step1,
  promptText,
  stale = false,
  pasteText,
  onPasteChange,
  onImport,
  importing = false,
  importLabel = "Load plan",
  onStartOver,
  pastePlaceholder = "Paste the whole reply, prose and all — the JSON block is found for you.",
}) {
  const [copied, setCopied] = useState(false);
  const id = useId();
  const promptId = `${id}-prompt`;
  const pasteId = `${id}-paste`;
  const stepsUnlocked = Boolean(promptText);

  // A rebuilt prompt hasn't been copied yet, whatever the last one said.
  useEffect(() => { setCopied(false); }, [promptText]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // navigator.clipboard is undefined outside a secure context, and the
      // permission can be denied outright — both land here.
      toast.error("Couldn't copy. Select the prompt text and copy it manually.");
    }
  }

  return (
    <div className="cpm-actionplan-manual">
      {/* <div>, not <p>: `.clubpm-app p, .clubpm-app span { color: inherit
          !important }` (clubpm-theme.css ~969) makes a colour set on any p
          or span inside ClubPM a dead declaration, whatever its specificity. */}
      {help && (
        <div className="cpm-actionplan-manual-help">
          <i className="fas fa-circle-info" aria-hidden="true" />
          <span>{help}</span>
        </div>
      )}

      <ol className="cpm-actionplan-steps">
        <li className="cpm-actionplan-step">
          <span className="cpm-actionplan-step-num" aria-hidden="true">1</span>
          <div className="cpm-actionplan-step-body">
            <div className="cpm-actionplan-step-title">Build the prompt</div>
            {step1}
          </div>
        </li>

        <li className={`cpm-actionplan-step${stepsUnlocked ? "" : " is-locked"}`}>
          <span className="cpm-actionplan-step-num" aria-hidden="true">2</span>
          <div className="cpm-actionplan-step-body">
            <div className="cpm-actionplan-step-head">
              <label className="cpm-actionplan-step-title" htmlFor={promptId}>
                Run it in your chat
              </label>
              {stepsUnlocked && (
                <div className="cpm-actionplan-step-actions">
                  <button type="button" className="clubpm-btn-secondary" onClick={handleCopy} disabled={stale}>
                    {copied
                      ? <><i className="fas fa-check" aria-hidden="true" /> Copied</>
                      : <><i className="fas fa-copy" aria-hidden="true" /> Copy prompt</>}
                  </button>
                  <a className="clubpm-btn-secondary" href={CLAUDE_URL} target="_blank" rel="noopener noreferrer">
                    <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /> Open Claude
                  </a>
                </div>
              )}
            </div>
            <textarea
              id={promptId}
              className={`cpm-actionplan-prompt-box${stale ? " is-stale" : ""}`}
              readOnly
              spellCheck={false}
              value={promptText}
              onFocus={e => e.target.select()}
              rows={stepsUnlocked ? 7 : 2}
              placeholder="Your prompt appears here once you build it."
            />
          </div>
        </li>

        <li className={`cpm-actionplan-step${stepsUnlocked ? "" : " is-locked"}`}>
          <span className="cpm-actionplan-step-num" aria-hidden="true">3</span>
          <div className="cpm-actionplan-step-body">
            <label className="cpm-actionplan-step-title" htmlFor={pasteId}>
              Paste the reply back
            </label>
            <textarea
              id={pasteId}
              className="cpm-actionplan-paste-box"
              value={pasteText}
              spellCheck={false}
              onChange={e => onPasteChange(e.target.value)}
              rows={stepsUnlocked ? 5 : 2}
              disabled={!stepsUnlocked}
              placeholder={pastePlaceholder}
            />
            <div className="cpm-actionplan-step-actions">
              <button
                type="button"
                className="clubpm-btn-primary"
                disabled={importing || !pasteText.trim()}
                onClick={onImport}
              >
                {importing
                  ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Reading…</>
                  : <><i className="fas fa-download" aria-hidden="true" /> {importLabel}</>}
              </button>
              {stepsUnlocked && onStartOver && (
                <button type="button" className="clubpm-btn-secondary" onClick={onStartOver}>
                  <i className="fas fa-rotate-left" aria-hidden="true" /> Start over
                </button>
              )}
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}
