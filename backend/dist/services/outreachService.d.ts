import type { SubmissionStatus, SubmissionType } from "@prisma/client";
interface CreateSubmissionInput {
    title: string;
    type: SubmissionType;
    status?: SubmissionStatus;
    content?: string;
    mediaUrls?: string[];
    platform?: string[];
    projectId?: string;
    eventId?: string;
    authorId: string;
    scheduledAt?: Date;
}
interface UpdateSubmissionInput {
    title?: string;
    type?: SubmissionType;
    status?: SubmissionStatus;
    content?: string;
    mediaUrls?: string[];
    platform?: string[];
    projectId?: string | null;
    eventId?: string | null;
    reviewerId?: string | null;
    reviewNote?: string | null;
    scheduledAt?: Date | null;
    publishedAt?: Date | null;
}
interface ListSubmissionsFilters {
    status?: SubmissionStatus;
    type?: SubmissionType;
    projectId?: string;
    authorId?: string;
    from?: Date;
    to?: Date;
}
export declare function createSubmission(data: CreateSubmissionInput): Promise<{
    project: {
        name: string;
        id: string;
    } | null;
    event: {
        id: string;
        title: string;
        type: import("@prisma/client").$Enums.EventType;
        startTime: Date;
    } | null;
    author: {
        id: string;
        slackId: string;
        slackHandle: string;
        displayName: string;
        avatarUrl: string | null;
        title: string | null;
        email: string | null;
        timezone: string | null;
        team: string | null;
        bio: string | null;
        role: import("@prisma/client").$Enums.Role;
        isAdmin: boolean;
        isBot: boolean;
        kanbanColumnOrder: string[];
        notificationPrefs: string[];
        notificationChannels: import("@prisma/client/runtime/library").JsonValue | null;
        quietHoursStart: number | null;
        quietHoursEnd: number | null;
        mutedProjectIds: string[];
        createdAt: Date;
    };
    reviewer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.SubmissionStatus;
    projectId: string | null;
    updatedAt: Date;
    content: string | null;
    authorId: string;
    type: import("@prisma/client").$Enums.SubmissionType;
    mediaUrls: string[];
    platform: string[];
    eventId: string | null;
    reviewerId: string | null;
    reviewNote: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
}>;
export declare function updateSubmission(id: string, data: UpdateSubmissionInput): Promise<{
    project: {
        name: string;
        id: string;
    } | null;
    event: {
        id: string;
        title: string;
        type: import("@prisma/client").$Enums.EventType;
        startTime: Date;
    } | null;
    author: {
        id: string;
        slackId: string;
        slackHandle: string;
        displayName: string;
        avatarUrl: string | null;
        title: string | null;
        email: string | null;
        timezone: string | null;
        team: string | null;
        bio: string | null;
        role: import("@prisma/client").$Enums.Role;
        isAdmin: boolean;
        isBot: boolean;
        kanbanColumnOrder: string[];
        notificationPrefs: string[];
        notificationChannels: import("@prisma/client/runtime/library").JsonValue | null;
        quietHoursStart: number | null;
        quietHoursEnd: number | null;
        mutedProjectIds: string[];
        createdAt: Date;
    };
    reviewer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.SubmissionStatus;
    projectId: string | null;
    updatedAt: Date;
    content: string | null;
    authorId: string;
    type: import("@prisma/client").$Enums.SubmissionType;
    mediaUrls: string[];
    platform: string[];
    eventId: string | null;
    reviewerId: string | null;
    reviewNote: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
}>;
export declare function deleteSubmission(id: string): Promise<{
    id: string;
    title: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.SubmissionStatus;
    projectId: string | null;
    updatedAt: Date;
    content: string | null;
    authorId: string;
    type: import("@prisma/client").$Enums.SubmissionType;
    mediaUrls: string[];
    platform: string[];
    eventId: string | null;
    reviewerId: string | null;
    reviewNote: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
}>;
export declare function listSubmissions(filters: ListSubmissionsFilters): Promise<({
    project: {
        name: string;
        id: string;
    } | null;
    event: {
        id: string;
        title: string;
        startTime: Date;
    } | null;
    author: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    };
} & {
    id: string;
    title: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.SubmissionStatus;
    projectId: string | null;
    updatedAt: Date;
    content: string | null;
    authorId: string;
    type: import("@prisma/client").$Enums.SubmissionType;
    mediaUrls: string[];
    platform: string[];
    eventId: string | null;
    reviewerId: string | null;
    reviewNote: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
})[]>;
export declare function getSubmission(id: string): Promise<({
    project: {
        name: string;
        id: string;
    } | null;
    event: {
        id: string;
        title: string;
        type: import("@prisma/client").$Enums.EventType;
        startTime: Date;
    } | null;
    author: {
        id: string;
        slackId: string;
        slackHandle: string;
        displayName: string;
        avatarUrl: string | null;
        title: string | null;
        email: string | null;
        timezone: string | null;
        team: string | null;
        bio: string | null;
        role: import("@prisma/client").$Enums.Role;
        isAdmin: boolean;
        isBot: boolean;
        kanbanColumnOrder: string[];
        notificationPrefs: string[];
        notificationChannels: import("@prisma/client/runtime/library").JsonValue | null;
        quietHoursStart: number | null;
        quietHoursEnd: number | null;
        mutedProjectIds: string[];
        createdAt: Date;
    };
    reviewer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.SubmissionStatus;
    projectId: string | null;
    updatedAt: Date;
    content: string | null;
    authorId: string;
    type: import("@prisma/client").$Enums.SubmissionType;
    mediaUrls: string[];
    platform: string[];
    eventId: string | null;
    reviewerId: string | null;
    reviewNote: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
}) | null>;
export declare function reviewSubmission(id: string, reviewerId: string, status: "APPROVED" | "REJECTED" | "IN_REVIEW", note?: string): Promise<{
    project: {
        name: string;
        id: string;
    } | null;
    event: {
        id: string;
        title: string;
        type: import("@prisma/client").$Enums.EventType;
        startTime: Date;
    } | null;
    author: {
        id: string;
        slackId: string;
        slackHandle: string;
        displayName: string;
        avatarUrl: string | null;
        title: string | null;
        email: string | null;
        timezone: string | null;
        team: string | null;
        bio: string | null;
        role: import("@prisma/client").$Enums.Role;
        isAdmin: boolean;
        isBot: boolean;
        kanbanColumnOrder: string[];
        notificationPrefs: string[];
        notificationChannels: import("@prisma/client/runtime/library").JsonValue | null;
        quietHoursStart: number | null;
        quietHoursEnd: number | null;
        mutedProjectIds: string[];
        createdAt: Date;
    };
    reviewer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.SubmissionStatus;
    projectId: string | null;
    updatedAt: Date;
    content: string | null;
    authorId: string;
    type: import("@prisma/client").$Enums.SubmissionType;
    mediaUrls: string[];
    platform: string[];
    eventId: string | null;
    reviewerId: string | null;
    reviewNote: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
}>;
export declare function getOutreachDigest(): Promise<{
    recentMilestones: {
        projectName: string;
        milestoneTitle: string;
        completedAt: string;
    }[];
    upcomingEvents: {
        id: string;
        title: string;
        startTime: string;
        type: import("@prisma/client").$Enums.EventType;
    }[];
    pendingSubmissions: number;
    approvedSubmissions: number;
}>;
export declare function getContentCalendar(from: Date, to: Date): Promise<({
    project: {
        name: string;
        id: string;
    } | null;
    event: {
        id: string;
        title: string;
        startTime: Date;
    } | null;
    author: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    };
} & {
    id: string;
    title: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.SubmissionStatus;
    projectId: string | null;
    updatedAt: Date;
    content: string | null;
    authorId: string;
    type: import("@prisma/client").$Enums.SubmissionType;
    mediaUrls: string[];
    platform: string[];
    eventId: string | null;
    reviewerId: string | null;
    reviewNote: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
})[]>;
export type { CreateSubmissionInput, UpdateSubmissionInput, ListSubmissionsFilters };
//# sourceMappingURL=outreachService.d.ts.map