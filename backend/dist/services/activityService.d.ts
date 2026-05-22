import { EventEmitter } from "events";
import type { ActivityType, ActivitySource, ActivityEventType } from "@prisma/client";
export declare const activityBus: EventEmitter<[never]>;
export declare function logActivity(data: {
    type: ActivityType;
    entityId: string;
    entityType: "Task" | "Project" | "Milestone";
    projectId?: string;
    memberId?: string;
    metadata?: Record<string, unknown>;
}): Promise<{
    member: {
        id: string;
        slackId: string;
        slackHandle: string;
        displayName: string;
        avatarUrl: string | null;
        role: import("@prisma/client").$Enums.Role;
        isAdmin: boolean;
        isBot: boolean;
        kanbanColumnOrder: string[];
        notificationPrefs: string[];
        createdAt: Date;
    } | null;
} & {
    id: string;
    createdAt: Date;
    projectId: string | null;
    memberId: string | null;
    type: import("@prisma/client").$Enums.ActivityType;
    entityId: string;
    entityType: string;
    metadata: import("@prisma/client/runtime/library").JsonValue | null;
}>;
export declare function getProjectActivities(projectId: string, take?: number, cursor?: string): Promise<({
    member: {
        id: string;
        slackId: string;
        slackHandle: string;
        displayName: string;
        avatarUrl: string | null;
        role: import("@prisma/client").$Enums.Role;
        isAdmin: boolean;
        isBot: boolean;
        kanbanColumnOrder: string[];
        notificationPrefs: string[];
        createdAt: Date;
    } | null;
} & {
    id: string;
    createdAt: Date;
    projectId: string | null;
    memberId: string | null;
    type: import("@prisma/client").$Enums.ActivityType;
    entityId: string;
    entityType: string;
    metadata: import("@prisma/client/runtime/library").JsonValue | null;
})[]>;
export declare function getEntityActivities(entityId: string, take?: number): Promise<({
    member: {
        id: string;
        slackId: string;
        slackHandle: string;
        displayName: string;
        avatarUrl: string | null;
        role: import("@prisma/client").$Enums.Role;
        isAdmin: boolean;
        isBot: boolean;
        kanbanColumnOrder: string[];
        notificationPrefs: string[];
        createdAt: Date;
    } | null;
} & {
    id: string;
    createdAt: Date;
    projectId: string | null;
    memberId: string | null;
    type: import("@prisma/client").$Enums.ActivityType;
    entityId: string;
    entityType: string;
    metadata: import("@prisma/client/runtime/library").JsonValue | null;
})[]>;
interface LogAuditEventParams {
    projectId?: string;
    taskId?: string;
    memberId?: string | null;
    source: ActivitySource;
    eventType: ActivityEventType;
    payload: Record<string, unknown>;
}
export declare function logAuditEvent(params: LogAuditEventParams): Promise<void>;
export declare function diffObjects(before: Record<string, unknown>, after: Record<string, unknown>, watchFields: string[]): {
    field: string;
    from: unknown;
    to: unknown;
}[];
export declare function getProjectAuditLog(projectId: string, cursor?: string, limit?: number, eventType?: ActivityEventType): Promise<{
    items: ({
        member: {
            id: string;
            displayName: string;
            avatarUrl: string | null;
        } | null;
        task: {
            id: string;
            title: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        projectId: string;
        memberId: string | null;
        taskId: string | null;
        source: import("@prisma/client").$Enums.ActivitySource;
        eventType: import("@prisma/client").$Enums.ActivityEventType;
        payload: import("@prisma/client/runtime/library").JsonValue;
    })[];
    nextCursor: string | null;
}>;
export {};
//# sourceMappingURL=activityService.d.ts.map