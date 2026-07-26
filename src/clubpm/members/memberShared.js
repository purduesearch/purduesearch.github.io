// Shared helpers for Members + Profile surfaces. Extracted from
// MembersView.jsx so Profile.jsx can show the same contact / activity sections.

export function tzOffset(tz) {
  if (!tz) return null;
  try {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const diff = Math.round((local - now) / 60000);
    const sign = diff >= 0 ? '+' : '-';
    const h = Math.floor(Math.abs(diff) / 60);
    const m = Math.abs(diff) % 60;
    return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
  } catch {
    return null;
  }
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export const activityLabels = {
  TASK_CREATED: 'created a task',
  TASK_UPDATED: 'updated a task',
  TASK_COMPLETED: 'completed a task',
  TASK_ASSIGNED: 'was assigned a task',
  TASK_REASSIGNED: 'task reassigned',
  PROJECT_UPDATED: 'updated project',
  STANDUP_POSTED: 'posted standup',
};
