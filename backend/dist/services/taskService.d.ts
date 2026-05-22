import type { Task, TaskStatus, TaskProgress, Priority, Member, Project, RecurringInterval, Tag } from "@prisma/client";
interface CreateTaskInput {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: Priority;
    dueDate?: Date;
    projectId: string;
    assigneeIds?: string[];
    slackMsgTs?: string;
    parentTaskId?: string;
    milestoneId?: string;
    recurringInterval?: RecurringInterval;
    tagIds?: string[];
    estimatedHours?: number;
    storyPoints?: number;
    isRecurring?: boolean;
    recurrencePattern?: string;
    recurrenceEndDate?: Date;
    recurringParentId?: string;
}
interface UpdateTaskInput {
    title?: string;
    description?: string;
    status?: TaskStatus;
    progress?: TaskProgress;
    priority?: Priority;
    dueDate?: Date | null;
    assigneeIds?: string[];
    tags?: string[];
    attachments?: (string | {
        url: string;
        label?: string;
    })[];
    parentTaskId?: string | null;
    milestoneId?: string | null;
    blockedByIds?: string[];
    blockingIds?: string[];
    recurringInterval?: RecurringInterval | null;
    estimatedHours?: number | null;
    storyPoints?: number | null;
    isRecurring?: boolean;
    recurrencePattern?: string | null;
    recurrenceEndDate?: Date | null;
    recurringParentId?: string | null;
}
interface TaskFilters {
    status?: TaskStatus;
    assigneeId?: string;
    priority?: Priority;
}
export declare function createTask(data: CreateTaskInput): Promise<Task & {
    assignees: Member[];
    project: Project;
}>;
export declare function updateTask(id: string, data: UpdateTaskInput): Promise<Task & {
    assignees: Member[];
    project: Project;
}>;
export declare function deleteTask(id: string): Promise<Task>;
export declare function getTask(id: string): Promise<({
    project: {
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
    };
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
        isBot: boolean;
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
    comments: ({
        author: {
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
        };
    } & {
        id: string;
        createdAt: Date;
        content: string;
        taskId: string;
        authorId: string;
    })[];
    parentTask: {
        id: string;
        title: string;
    } | null;
    subtasks: ({
        assignees: {
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
    timeLogs: ({
        member: {
            id: string;
            displayName: string;
        };
    } & {
        id: string;
        memberId: string;
        taskId: string;
        minutes: number;
        note: string | null;
        loggedAt: Date;
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
}) | null>;
export declare function getTasksForProject(projectId: string, filters?: TaskFilters): Promise<({
    assignees: {
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
    }[];
    tags: {
        name: string;
        id: string;
        createdAt: Date;
        projectId: string;
        color: string;
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
})[]>;
export declare function getTasksForMember(memberId: string): Promise<({
    project: {
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
    };
    assignees: {
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
    }[];
    tags: {
        name: string;
        id: string;
        createdAt: Date;
        projectId: string;
        color: string;
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
})[]>;
export declare function getOverdueTasks(): Promise<({
    project: {
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
    };
    assignees: {
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
})[]>;
export declare function getTasksDueToday(): Promise<({
    project: {
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
    };
    assignees: {
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
})[]>;
export declare function getTasksDueThisWeek(memberId?: string): Promise<({
    project: {
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
    };
    assignees: {
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
})[]>;
export declare function getSubtasks(taskId: string): Promise<({
    assignees: {
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
})[]>;
export declare function createSubtask(parentTaskId: string, data: {
    title: string;
    assigneeIds?: string[];
}): Promise<{
    project: {
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
    };
    assignees: {
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
}>;
export declare function addDependency(taskId: string, blockedById: string): Promise<({
    blockedBy: ({
        blockingTask: {
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
        };
    } & {
        blockingTaskId: string;
        blockedTaskId: string;
    })[];
    blocks: ({
        blockedTask: {
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
}) | null>;
export declare function removeDependency(taskId: string, blockedById: string): Promise<({
    blockedBy: ({
        blockingTask: {
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
        };
    } & {
        blockingTaskId: string;
        blockedTaskId: string;
    })[];
    blocks: ({
        blockedTask: {
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
}) | null>;
export declare function logTime(taskId: string, memberId: string, minutes: number, note?: string): Promise<{
    id: string;
    memberId: string;
    taskId: string;
    minutes: number;
    note: string | null;
    loggedAt: Date;
}>;
export declare function spawnNextOccurrence(task: Task & {
    assignees: Member[];
    tags: Tag[];
}): Promise<void>;
export declare function completeTaskFromSlack(taskId: string): Promise<Task & {
    assignees: Member[];
    project: Project;
}>;
export declare function claimTaskFromSlack(taskId: string, memberId: string): Promise<Task & {
    assignees: Member[];
    project: Project;
}>;
export declare function createTaskFromSlackMessage(data: {
    title: string;
    projectId: string;
    assigneeIds?: string[];
    slackMsgTs?: string;
}): Promise<Task & {
    assignees: Member[];
    project: Project;
}>;
export declare function reassignTaskFromSlack(taskId: string, memberId: string): Promise<Task & {
    assignees: Member[];
    project: Project;
}>;
export type { CreateTaskInput, UpdateTaskInput, TaskFilters };
//# sourceMappingURL=taskService.d.ts.map