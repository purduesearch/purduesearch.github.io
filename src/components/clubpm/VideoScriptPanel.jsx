import React, { useState, useEffect } from 'react';
import { post, patch } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

/**
 * VideoScriptPanel — generate + display a shot list for VIDEO submissions.
 *
 * Props:
 *   submissionId — for autosave (null until first save)
 *   initialScript — { shots, caption } | null
 *   topic — fallback prompt text (e.g. submission title)
 *   onScriptGenerated — (script) => void
 *   onCaptionInsert — (caption) => void — append generated caption to baseContent
 */
export default function VideoScriptPanel({ submissionId, initialScript, topic, onScriptGenerated, onCaptionInsert }) {
  const [script, setScript]       = useState(initialScript ?? null);
  const [topicInput, setTopicInput] = useState(topic ?? '');
  const [duration, setDuration]   = useState(30);
  const [platform, setPlatform]   = useState('instagram');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(() => new Set());

  useEffect(() => { setScript(initialScript ?? null); }, [initialScript]);
  useEffect(() => { setTopicInput(topic ?? ''); }, [topic]);

  async function generate() {
    if (!topicInput.trim()) { toast.error('Topic is required.'); return; }
    setLoading(true);
    try {
      const result = await post('/api/outreach/ai/video-script', {
        topic:        topicInput.trim(),
        durationSec:  Number(duration) || 30,
        platform,
        submissionId,
      });
      setScript(result);
      onScriptGenerated?.(result);
      toast.success('Shot list generated');
    } catch (err) {
      toast.error(err.message ?? 'Failed to generate script');
    } finally {
      setLoading(false);
    }
  }

  function toggleDone(shotNumber) {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(shotNumber)) next.delete(shotNumber);
      else next.add(shotNumber);
      return next;
    });
  }

  async function saveCheckedState() {
    // Persist the script + done state (encoded onto each shot for simplicity)
    if (!submissionId || !script) return;
    const persisted = {
      ...script,
      shots: script.shots.map(s => ({ ...s, done: done.has(s.shotNumber) })),
    };
    try {
      await patch(`/api/outreach/submissions/${submissionId}/video-script`, { script: persisted });
    } catch {
      /* silent */
    }
  }

  useEffect(() => {
    if (initialScript?.shots) {
      const checkedInitial = new Set(
        initialScript.shots.filter(s => s.done).map(s => s.shotNumber)
      );
      setDone(checkedInitial);
    }
  }, [initialScript]);

  useEffect(() => {
    saveCheckedState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const totalDuration = (script?.shots ?? []).reduce((sum, s) => sum + (Number(s.durationSec) || 0), 0);

  return (
    <div className="pm-video-script">
      <div className="pm-video-script-header">
        <span className="pm-video-script-title">
          <i className="fas fa-film" aria-hidden="true" style={{ marginRight: 6, color: 'var(--pm-accent-teal)' }} />
          Video / Reel Shot List
        </span>
      </div>

      <div className="pm-video-script-controls">
        <input
          type="text"
          className="cpm-form-input"
          placeholder="Topic — what is this video about?"
          value={topicInput}
          onChange={e => setTopicInput(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <input
          type="number"
          className="cpm-form-input"
          min={10}
          max={180}
          value={duration}
          onChange={e => setDuration(e.target.value)}
          title="Duration (sec)"
          style={{ width: 80 }}
        />
        <select
          className="cpm-form-select"
          value={platform}
          onChange={e => setPlatform(e.target.value)}
          style={{ width: 130 }}
        >
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <button
          type="button"
          className="cpm-btn cpm-btn--primary"
          onClick={generate}
          disabled={loading}
        >
          {loading
            ? <><span className="pm-bulk-spinner" /> Generating…</>
            : <><i className="fas fa-magic" aria-hidden="true" /> {script ? 'Regenerate' : 'Generate shot list'}</>}
        </button>
      </div>

      {script?.shots?.length > 0 && (
        <div className="pm-video-script-body">
          <div className="pm-video-script-summary">
            <span><i className="fas fa-clock" aria-hidden="true" /> ~{totalDuration}s total · {script.shots.length} shots · {done.size}/{script.shots.length} filmed</span>
          </div>

          <ol className="pm-video-script-shots">
            {script.shots.map(s => (
              <li key={s.shotNumber} className={`pm-video-shot${done.has(s.shotNumber) ? ' done' : ''}`}>
                <label className="pm-video-shot-check">
                  <input
                    type="checkbox"
                    checked={done.has(s.shotNumber)}
                    onChange={() => toggleDone(s.shotNumber)}
                  />
                </label>
                <div className="pm-video-shot-body">
                  <div className="pm-video-shot-header">
                    <span className="pm-video-shot-num">Shot {s.shotNumber}</span>
                    <span className="pm-video-shot-dur">{s.durationSec}s</span>
                  </div>
                  <div className="pm-video-shot-desc">{s.description}</div>
                  {s.voiceover && (
                    <div className="pm-video-shot-vo">
                      <i className="fas fa-microphone" aria-hidden="true" /> {s.voiceover}
                    </div>
                  )}
                  {s.onScreenText && (
                    <div className="pm-video-shot-text">
                      <i className="fas fa-font" aria-hidden="true" /> "{s.onScreenText}"
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {script.caption && (
            <div className="pm-video-script-caption">
              <div className="pm-video-script-caption-label">
                <i className="fas fa-quote-left" aria-hidden="true" /> Suggested caption
                <button
                  type="button"
                  className="pm-video-script-caption-insert"
                  onClick={() => onCaptionInsert?.(script.caption)}
                >
                  <i className="fas fa-arrow-up" aria-hidden="true" /> Use as content
                </button>
              </div>
              <p>{script.caption}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
