import type { App } from "@slack/bolt";
import type { Task, Member, Project, NotificationTargetType } from "@prisma/client";
type TaskWithRelations = Task & {
    assignees: Member[];
    project: Project;
};
export declare function addNotificationTarget(projectId: string, type: NotificationTargetType, slackChannelId: string, eventTypes?: string[]): Promise<{
    id: string;
    createdAt: Date;
    projectId: string;
    type: import("@prisma/client").$Enums.NotificationTargetType;
    slackChannelId: string;
    eventTypes: string[];
}>;
export declare function removeNotificationTarget(id: string): Promise<{
    id: string;
    createdAt: Date;
    projectId: string;
    type: import("@prisma/client").$Enums.NotificationTargetType;
    slackChannelId: string;
    eventTypes: string[];
}>;
export declare function getNotificationTargetsForProject(projectId: string): Promise<{
    id: string;
    createdAt: Date;
    projectId: string;
    type: import("@prisma/client").$Enums.NotificationTargetType;
    slackChannelId: string;
    eventTypes: string[];
}[]>;
export declare function sendWeeklyDigest(app: App, member: Member): Promise<void>;
export declare function sendDueDateReminder(app: App, task: TaskWithRelations): Promise<void>;
export declare function postProjectHealthSummary(app: App, project: Project & {
    tasks: (Task & {
        assignees: Member[];
    })[];
}): Promise<void>;
export declare function postWeekAheadSummary(app: App, project: Project & {
    tasks: (Task & {
        assignees: Member[];
    })[];
}): Promise<void>;
export declare function sendAllDueDateReminders(app: App): Promise<void>;
export declare function sendAllWeeklyDigests(app: App): Promise<void>;
export declare function postAllProjectHealthSummaries(app: App): Promise<void>;
export declare function postAllWeekAheadSummaries(app: App): Promise<void>;
export declare function postEscalationNotice(app: App, task: TaskWithRelations): Promise<void>;
export declare function sendAllEscalations(app: App): Promise<void>;
export declare function postTaskAnnouncement(app: App, task: TaskWithRelations, channelId: string): Promise<void>;
export declare function postTaskThreadUpdate(app: App, task: TaskWithRelations, updateText: string): Promise<void>;
export declare function sendStandupPrompts(app: App): Promise<void>;
export declare function sendMilestoneAlerts(app: App, changed: {
    id: string;
    title: string;
    projectId: string;
    status: string;
    prevStatus: string;
}[]): Promise<void>;
export declare function sendCombinedMondayDigest(app: App): Promise<void>;
export declare function sendAllStaleTaskWarnings(app: App): Promise<void>;
export {};
//# sourceMappingURL=notificationService.d.ts.map