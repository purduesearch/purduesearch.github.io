import type { Project, ProjectStatus, ProjectType } from "@prisma/client";
interface CreateProjectInput {
    name: string;
    description?: string;
    driveLink?: string;
    slackChannel?: string;
    type: ProjectType;
    startDate?: Date;
    targetDate?: Date;
}
interface UpdateProjectInput {
    name?: string;
    description?: string;
    driveLink?: string;
    slackChannel?: string;
    slackChannelId?: string | null;
    slackChannelName?: string | null;
    status?: ProjectStatus;
    startDate?: Date;
    targetDate?: Date;
}
export declare function getChannelMemberSlackIds(channelId: string): Promise<string[]>;
export declare function listProjects(): Promise<Project[]>;
export declare function getProject(id: string): Promise<({
    tasks: ({
        milestone: {
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
        } | null;
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
        tags: {
            name: string;
            id: string;
            createdAt: Date;
            projectId: string;
            color: string;
        }[];
        subtasks: ({
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
        blockedBy: ({
            blockingTask: {
                id: string;
                title: string;
                status: import("@prisma/client").$Enums.TaskStatus;
            };
        } & {
            blockingTaskId: string;
            blockedTaskId: string;
        })[];
        blocks: ({
            blockedTask: {
                id: string;
                title: string;
                status: import("@prisma/client").$Enums.TaskStatus;
            };
        } & {
            blockingTaskId: string;
            blockedTaskId: string;
        })[];
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
    members: ({
        member: {
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
        };
    } & {
        projectId: string;
        memberId: string;
        projectRole: string;
        joinedAt: Date;
    })[];
    milestones: {
        id: string;
        title: string;
        status: import("@prisma/client").$Enums.MilestoneStatus;
        dueDate: Date | null;
    }[];
    updates: {
        id: string;
        projectId: string;
        content: string;
        authorId: string | null;
        postedAt: Date;
    }[];
} & {
    name: string;
    id: string;
    createdAt: Date;
    description: string | null;
    status: import("@prisma/client").$Enums.ProjectStatus;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.ProjectType;
    driveLink: string | null;
    slackChannel: string | null;
    slackChannelId: string | null;
    slackChannelName: string | null;
    startDate: Date | null;
    targetDate: Date | null;
}) | null>;
export declare function getProjectsForChannel(channelId: string): Promise<({
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
    members: ({
        member: {
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
        };
    } & {
        projectId: string;
        memberId: string;
        projectRole: string;
        joinedAt: Date;
    })[];
} & {
    name: string;
    id: string;
    createdAt: Date;
    description: string | null;
    status: import("@prisma/client").$Enums.ProjectStatus;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.ProjectType;
    driveLink: string | null;
    slackChannel: string | null;
    slackChannelId: string | null;
    slackChannelName: string | null;
    startDate: Date | null;
    targetDate: Date | null;
})[]>;
export declare function getProjectByChannel(channelId: string): Promise<{
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
    members: ({
        member: {
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
        };
    } & {
        projectId: string;
        memberId: string;
        projectRole: string;
        joinedAt: Date;
    })[];
} & {
    name: string;
    id: string;
    createdAt: Date;
    description: string | null;
    status: import("@prisma/client").$Enums.ProjectStatus;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.ProjectType;
    driveLink: string | null;
    slackChannel: string | null;
    slackChannelId: string | null;
    slackChannelName: string | null;
    startDate: Date | null;
    targetDate: Date | null;
}>;
export declare function createProject(data: CreateProjectInput): Promise<Project>;
export declare function updateProject(id: string, data: UpdateProjectInput): Promise<Project>;
export declare function addMemberToProject(projectId: string, memberId: string, projectRole?: string): Promise<{
    projectId: string;
    memberId: string;
    projectRole: string;
    joinedAt: Date;
}>;
export declare function removeMemberFromProject(projectId: string, memberId: string): Promise<{
    projectId: string;
    memberId: string;
    projectRole: string;
    joinedAt: Date;
}>;
export declare function getProjectsWithTaskStats(): Promise<{
    totalTasks: number;
    doneTasks: number;
    completionPercent: number;
    tasks: {
        status: import("@prisma/client").$Enums.TaskStatus;
    }[];
    members: ({
        member: {
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
        };
    } & {
        projectId: string;
        memberId: string;
        projectRole: string;
        joinedAt: Date;
    })[];
    name: string;
    id: string;
    createdAt: Date;
    description: string | null;
    status: import("@prisma/client").$Enums.ProjectStatus;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.ProjectType;
    driveLink: string | null;
    slackChannel: string | null;
    slackChannelId: string | null;
    slackChannelName: string | null;
    startDate: Date | null;
    targetDate: Date | null;
}[]>;
export declare function findProjectByName(name: string): Promise<({
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
    members: ({
        member: {
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
        };
    } & {
        projectId: string;
        memberId: string;
        projectRole: string;
        joinedAt: Date;
    })[];
} & {
    name: string;
    id: string;
    createdAt: Date;
    description: string | null;
    status: import("@prisma/client").$Enums.ProjectStatus;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.ProjectType;
    driveLink: string | null;
    slackChannel: string | null;
    slackChannelId: string | null;
    slackChannelName: string | null;
    startDate: Date | null;
    targetDate: Date | null;
}) | null>;
export {};
//# sourceMappingURL=projectService.d.ts.map