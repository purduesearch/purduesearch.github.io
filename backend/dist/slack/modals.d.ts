import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
export declare function openStandupModal(client: WebClient, triggerId: string, channelId: string): Promise<void>;
export declare function openNewTaskModal(client: WebClient, triggerId: string, channelId: string, initialTitle?: string, initialDescription?: string, initialDueDate?: string, // ISO "YYYY-MM-DD"
initialAssignees?: string[], // Slack user IDs
initialParentTaskId?: string, isAdminUser?: boolean): Promise<void>;
export declare function openNewProjectModal(client: WebClient, triggerId: string, channelId?: string, userId?: string): Promise<void>;
export declare function openAddNoteModal(client: WebClient, triggerId: string, taskId: string): Promise<void>;
export declare function openReportModal(client: WebClient, triggerId: string): Promise<void>;
export declare function openHealthModal(client: WebClient, triggerId: string): Promise<void>;
export declare function openMilestonesModal(client: WebClient, triggerId: string): Promise<void>;
export declare function registerModals(app: App): void;
export declare function openSubtaskModal(client: WebClient, triggerId: string, channelId: string): Promise<void>;
export declare function openNotifyModal(client: WebClient, triggerId: string, member: {
    notificationPrefs: string[];
}): Promise<void>;
export declare function openSnoozeModal(client: WebClient, triggerId: string, taskId: string): Promise<void>;
export declare function openTaskDoneModal(client: WebClient, triggerId: string, userId: string): Promise<void>;
export declare function openStatusModal(client: WebClient, triggerId: string): Promise<void>;
export declare function openMilestoneModal(client: WebClient, triggerId: string, channelId: string): Promise<void>;
export declare function openDriveParseModal(client: WebClient, triggerId: string, channelId: string, prefillUrl?: string): Promise<void>;
export declare function openMeetingNotesModal(client: WebClient, triggerId: string, channelId: string): Promise<void>;
export declare function openSprintPlanModal(client: WebClient, triggerId: string, projectId: string): Promise<void>;
export declare function openImageTaskModal(client: WebClient, triggerId: string, channelId: string, fileUrl: string, userNote: string): Promise<void>;
export declare function registerAiModals(app: App): void;
export declare function openEventCreateModal(client: WebClient, triggerId: string, channelId: string): Promise<void>;
export declare function openOutreachSubmitModal(client: WebClient, triggerId: string, _slackUserId: string): Promise<void>;
//# sourceMappingURL=modals.d.ts.map