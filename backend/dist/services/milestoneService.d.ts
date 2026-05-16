import type { MilestoneStatus } from "@prisma/client";
export declare function createMilestone(data: {
    title: string;
    projectId: string;
    dueDate?: Date;
}): Promise<{
    tasks: {
        id: string;
        status: import("@prisma/client").$Enums.TaskStatus;
    }[];
} & {
    id: string;
    createdAt: Date;
    title: string;
    description: string | null;
    status: import("@prisma/client").$Enums.MilestoneStatus;
    dueDate: Date | null;
    projectId: string;
    slackMsgTs: string | null;
    updatedAt: Date;
    ownerId: string | null;
    completedAt: Date | null;
}>;
export declare function updateMilestone(id: string, data: {
    title?: string;
    dueDate?: Date | null;
}): Promise<{
    tasks: {
        id: string;
        status: import("@prisma/client").$Enums.TaskStatus;
    }[];
} & {
    id: string;
    createdAt: Date;
    title: string;
    description: string | null;
    status: import("@prisma/client").$Enums.MilestoneStatus;
    dueDate: Date | null;
    projectId: string;
    slackMsgTs: string | null;
    updatedAt: Date;
    ownerId: string | null;
    completedAt: Date | null;
}>;
export declare function deleteMilestone(id: string): Promise<{
    id: string;
    createdAt: Date;
    title: string;
    description: string | null;
    status: import("@prisma/client").$Enums.MilestoneStatus;
    dueDate: Date | null;
    projectId: string;
    slackMsgTs: string | null;
    updatedAt: Date;
    ownerId: string | null;
    completedAt: Date | null;
}>;
export declare function getMilestone(id: string): Promise<({
    tasks: ({
        assignees: {
            id: string;
            slackId: string;
            slackHandle: string;
            displayName: string;
            avatarUrl: string | null;
            role: import("@prisma/client").$Enums.Role;
            isAdmin: boolean;
            kanbanColumnOrder: string[];
            notificationPrefs: string[];
            createdAt: Date;
        }[];
    } & {
        id: string;
        createdAt: Date;
        title: string;
        description: string | null;
        status: import("@prisma/client").$Enums.TaskStatus;
        priority: import("@prisma/client").$Enums.Priority;
        dueDate: Date | null;
        projectId: string;
        slackMsgTs: string | null;
        attachments: string[];
        parentTaskId: string | null;
        progress: import("@prisma/client").$Enums.TaskProgress;
        estimatedHours: number | null;
        storyPoints: number | null;
        recurringInterval: import("@prisma/client").$Enums.RecurringInterval | null;
        lastSpawnedAt: Date | null;
        escalatedAt: Date | null;
        sourceTaskId: string | null;
        isRecurring: boolean;
        recurrencePattern: string | null;
        recurrenceEndDate: Date | null;
        recurringParentId: string | null;
        milestoneId: string | null;
        updatedAt: Date;
    })[];
} & {
    id: string;
    createdAt: Date;
    title: string;
    description: string | null;
    status: import("@prisma/client").$Enums.MilestoneStatus;
    dueDate: Date | null;
    projectId: string;
    slackMsgTs: string | null;
    updatedAt: Date;
    ownerId: string | null;
    completedAt: Date | null;
}) | null>;
export declare function getMilestonesForProject(projectId: string): Promise<{
    completionPct: number;
    taskCounts: {
        total: number;
        done: number;
    };
    tasks: {
        id: string;
        status: import("@prisma/client").$Enums.TaskStatus;
    }[];
    id: string;
    createdAt: Date;
    title: string;
    description: string | null;
    status: import("@prisma/client").$Enums.MilestoneStatus;
    dueDate: Date | null;
    projectId: string;
    slackMsgTs: string | null;
    updatedAt: Date;
    ownerId: string | null;
    completedAt: Date | null;
}[]>;
export declare function computeHealth(tasks: {
    status: string;
}[], dueDate: Date, currentStatus: MilestoneStatus): MilestoneStatus;
export declare function refreshMilestoneHealth(milestoneId: string): Promise<void>;
export declare function refreshAllMilestoneHealth(): Promise<{
    id: string;
    title: string;
    projectId: string;
    status: MilestoneStatus;
    prevStatus: MilestoneStatus;
}[]>;
export declare function getMilestoneWithProgress(milestoneId: string): Promise<{
    progress: number;
    taskCount: number;
    tasks: {
        id: string;
        title: string;
        status: import("@prisma/client").$Enums.TaskStatus;
        priority: import("@prisma/client").$Enums.Priority;
        assignees: {
            id: string;
            displayName: string;
        }[];
    }[];
    owner: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
    id: string;
    createdAt: Date;
    title: string;
    description: string | null;
    status: import("@prisma/client").$Enums.MilestoneStatus;
    dueDate: Date | null;
    projectId: string;
    slackMsgTs: string | null;
    updatedAt: Date;
    ownerId: string | null;
    completedAt: Date | null;
} | null>;
//# sourceMappingURL=milestoneService.d.ts.map