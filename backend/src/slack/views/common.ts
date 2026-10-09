import type { KnownBlock, ModalView } from "@slack/types";
import type { Priority, TaskStatus } from "@prisma/client";

export const LIMITS = Object.freeze({
  messageBlocks: 50, viewBlocks: 100, sectionText: 3000, headerText: 150,
  buttonText: 75, optionText: 75, optionDescription: 75, sectionFields: 10,
  buttonValue: 2000, privateMetadata: 3000, modalTitle: 24, modalSubmit: 24,
  modalClose: 24, staticSelectOptions: 100, checkboxOptions: 10,
  radioOptions: 10, overflowMin: 2, overflowMax: 5,
});

export function trunc(s: string, n: number): string {
  if (n <= 0) return "";
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function assertBlockBudget(blocks: readonly unknown[], max: number): void {
  if (blocks.length > max) throw new Error(`Block budget exceeded: ${blocks.length} > ${max}`);
}

export function statusPill(status: TaskStatus | string): string {
  const pills: Record<string, string> = {
    TODO: ":white_circle: To do", IN_PROGRESS: ":large_blue_circle: In progress",
    BLOCKED: ":red_circle: Blocked", DONE: ":large_green_circle: Done",
  };
  return pills[status] ?? status;
}

export function priorityDot(priority: Priority | string): string {
  return ({ LOW: ":large_green_circle:", MEDIUM: ":large_yellow_circle:",
    HIGH: ":large_orange_circle:", CRITICAL: ":red_circle:" } as Record<string, string>)[priority] ?? ":white_circle:";
}

export function relativeDue(due: Date | string, now: Date = new Date()): string {
  const date = new Date(due);
  const calendarDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((calendarDay(date) - calendarDay(now)) / 86_400_000);
  if (!Number.isFinite(days)) return "";
  if (days === 0) return "today";
  return days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : `${-days} day${days === -1 ? "" : "s"} overdue`;
}

export function progressBar(done: number, total: number, width = 6): string {
  const size = Math.max(0, Math.floor(width));
  const count = total > 0 ? Math.round(Math.min(1, Math.max(0, done / total)) * size) : 0;
  return `${"■".repeat(count)}${"□".repeat(size - count)} ${done} of ${total}`;
}

export function escapeMrkdwn(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function memberRef(m: { slackId?: string | null; displayName: string }): string {
  return m.slackId ? `<@${m.slackId}>` : escapeMrkdwn(m.displayName);
}

function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
export function projectUrl(id: string): string {
  return `${frontendUrl()}/clubpm/projects/${encodeURIComponent(id)}`;
}
export function taskUrl(projectId: string, taskId: string): string {
  return `${projectUrl(projectId)}?task=${encodeURIComponent(taskId)}`;
}

export function loadingView(title: string): ModalView {
  const blocks: KnownBlock[] = [{ type: "section", text: { type: "mrkdwn", text: ":hourglass_flowing_sand: Working on it…" } }];
  return { type: "modal", title: { type: "plain_text", text: trunc(title, LIMITS.modalTitle) || "Working" },
    close: { type: "plain_text", text: "Close" }, blocks };
}
