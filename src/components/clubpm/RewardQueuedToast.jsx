// Listens for `clubpm:reward-queued` — fired by clubPmClient.js when a task
// PATCH response has queued: true (admin-gated approval flow). Surfaces a
// "Submitted for review" toast so the user gets confirmation that the action
// registered, even though XP/DB will arrive only after admin approval.

import { useEffect } from 'react';
import toast from 'react-hot-toast';

export default function RewardQueuedToast() {
  useEffect(() => {
    const onQueued = (e) => {
      const taskTitle = e?.detail?.taskTitle;
      const label = taskTitle
        ? `Reward for "${taskTitle}" submitted for review`
        : 'Reward submitted for review';
      toast(label, {
        icon: '📬',
        duration: 4000,
        style: {
          background: 'rgba(26,32,46,0.96)',
          border: '1px solid rgba(0,229,195,0.25)',
          color: '#f0f2f7',
          fontSize: 13,
          fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        },
      });
    };
    window.addEventListener('clubpm:reward-queued', onQueued);
    return () => window.removeEventListener('clubpm:reward-queued', onQueued);
  }, []);

  return null;
}
