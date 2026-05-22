import type { EventType } from "@prisma/client";
interface CreateEventInput {
    title: string;
    description?: string;
    type?: EventType;
    startTime: Date;
    endTime?: Date;
    location?: string;
    isVirtual?: boolean;
    projectId?: string;
    priorityTaskIds?: string[];
    organizerId?: string;
    attendeeIds?: string[];
    notes?: string;
    isRecurring?: boolean;
    recurrencePattern?: string;
    recurrenceEndDate?: Date;
}
interface UpdateEventInput {
    title?: string;
    description?: string;
    type?: EventType;
    startTime?: Date;
    endTime?: Date;
    location?: string;
    isVirtual?: boolean;
    projectId?: string;
    priorityTaskIds?: string[];
    organizerId?: string;
    attendeeIds?: string[];
    notes?: string;
    isRecurring?: boolean;
    recurrencePattern?: string;
    recurrenceEndDate?: Date;
}
interface EventFilters {
    from?: Date;
    to?: Date;
    projectId?: string;
    type?: EventType;
}
export declare function createEvent(data: CreateEventInput): Promise<{
    project: {
        name: string;
        id: string;
    } | null;
    _count: {
        attendees: number;
        priorityTasks: number;
    };
    attendees: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    }[];
    organizer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    description: string | null;
    projectId: string | null;
    isRecurring: boolean;
    recurrencePattern: string | null;
    recurrenceEndDate: Date | null;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.EventType;
    startTime: Date;
    endTime: Date | null;
    location: string | null;
    isVirtual: boolean;
    organizerId: string | null;
    notes: string | null;
}>;
export declare function updateEvent(id: string, data: UpdateEventInput): Promise<{
    project: {
        name: string;
        id: string;
    } | null;
    _count: {
        attendees: number;
        priorityTasks: number;
    };
    attendees: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    }[];
    organizer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    description: string | null;
    projectId: string | null;
    isRecurring: boolean;
    recurrencePattern: string | null;
    recurrenceEndDate: Date | null;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.EventType;
    startTime: Date;
    endTime: Date | null;
    location: string | null;
    isVirtual: boolean;
    organizerId: string | null;
    notes: string | null;
}>;
export declare function deleteEvent(id: string): Promise<{
    id: string;
    title: string;
    createdAt: Date;
    description: string | null;
    projectId: string | null;
    isRecurring: boolean;
    recurrencePattern: string | null;
    recurrenceEndDate: Date | null;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.EventType;
    startTime: Date;
    endTime: Date | null;
    location: string | null;
    isVirtual: boolean;
    organizerId: string | null;
    notes: string | null;
}>;
export declare function getEvents(filters?: EventFilters): Promise<({
    project: {
        name: string;
        id: string;
    } | null;
    _count: {
        attendees: number;
        priorityTasks: number;
    };
    attendees: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    }[];
    organizer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    description: string | null;
    projectId: string | null;
    isRecurring: boolean;
    recurrencePattern: string | null;
    recurrenceEndDate: Date | null;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.EventType;
    startTime: Date;
    endTime: Date | null;
    location: string | null;
    isVirtual: boolean;
    organizerId: string | null;
    notes: string | null;
})[]>;
export declare function getUpcomingEvents(days: number): Promise<({
    project: {
        name: string;
        id: string;
    } | null;
    _count: {
        attendees: number;
        priorityTasks: number;
    };
    attendees: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    }[];
    priorityTasks: {
        id: string;
        title: string;
        status: import("@prisma/client").$Enums.TaskStatus;
    }[];
    organizer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    description: string | null;
    projectId: string | null;
    isRecurring: boolean;
    recurrencePattern: string | null;
    recurrenceEndDate: Date | null;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.EventType;
    startTime: Date;
    endTime: Date | null;
    location: string | null;
    isVirtual: boolean;
    organizerId: string | null;
    notes: string | null;
})[]>;
export declare function getProjectEvents(projectId: string): Promise<({
    project: {
        name: string;
        id: string;
    } | null;
    _count: {
        attendees: number;
        priorityTasks: number;
    };
    attendees: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    }[];
    organizer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    description: string | null;
    projectId: string | null;
    isRecurring: boolean;
    recurrencePattern: string | null;
    recurrenceEndDate: Date | null;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.EventType;
    startTime: Date;
    endTime: Date | null;
    location: string | null;
    isVirtual: boolean;
    organizerId: string | null;
    notes: string | null;
})[]>;
export declare function getEvent(id: string): Promise<({
    project: {
        name: string;
        id: string;
    } | null;
    _count: {
        attendees: number;
        priorityTasks: number;
    };
    attendees: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    }[];
    priorityTasks: {
        id: string;
        title: string;
        status: import("@prisma/client").$Enums.TaskStatus;
        priority: import("@prisma/client").$Enums.Priority;
    }[];
    organizer: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    title: string;
    createdAt: Date;
    description: string | null;
    projectId: string | null;
    isRecurring: boolean;
    recurrencePattern: string | null;
    recurrenceEndDate: Date | null;
    updatedAt: Date;
    type: import("@prisma/client").$Enums.EventType;
    startTime: Date;
    endTime: Date | null;
    location: string | null;
    isVirtual: boolean;
    organizerId: string | null;
    notes: string | null;
}) | null>;
export type { CreateEventInput, UpdateEventInput, EventFilters };
//# sourceMappingURL=eventService.d.ts.map