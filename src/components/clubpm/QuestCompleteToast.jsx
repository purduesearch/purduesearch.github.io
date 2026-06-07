// Progress milestone toast + challenge completion popup.
//
// Listens for `clubpm:challenge-progress` (dispatched by clubPmClient.js
// whenever an API response includes a `progressMilestones` array).
//
// Event detail shape: { challengeId, challengeName?, pct, xpReward?, doubloonReward? }

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

function milestoneEmoji(pct) {
  if (pct >= 100) return '🏆';
  if (pct >= 75)  return '🔥';
  if (pct >= 50)  return '⚡';
  return '🎯';
}

function milestoneLabel(pct) {
  if (pct >= 100) return 'Quest Complete!';
  return `${pct}% Progress`;
}

export default function QuestCompleteToast() {
  useEffect(() => {
    const onProgress = (e) => {
      const { pct, challengeName } = e.detail ?? {};
      if (typeof pct !== 'number') return;

      const emoji = milestoneEmoji(pct);
      const label = milestoneLabel(pct);
      const name  = challengeName ? `"${challengeName}"` : 'a quest';

      toast(
        `${emoji} ${label} on ${name}`,
        {
          icon:      emoji,
          duration:  pct >= 100 ? 5000 : 3500,
          className: pct >= 100 ? 'pm-toast-celebrate' : undefined,
          style: {
            background: pct >= 100
              ? 'linear-gradient(120deg,rgba(38,212,154,0.18),rgba(38,212,154,0.06))'
              : 'rgba(26,32,46,0.96)',
            border: pct >= 100
              ? '1px solid rgba(38,212,154,0.45)'
              : '1px solid rgba(255,255,255,0.1)',
            color: '#f0f2f7',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: pct >= 100 ? '0 10px 32px rgba(0,229,195,0.22)' : '0 8px 24px rgba(0,0,0,0.4)',
          },
        }
      );
    };

    window.addEventListener('clubpm:challenge-progress', onProgress);
    return () => window.removeEventListener('clubpm:challenge-progress', onProgress);
  }, []);

  // This component only registers the listener; toast library handles rendering.
  return null;
}
