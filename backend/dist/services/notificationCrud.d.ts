import type { Notification, NotificationType } from "@prisma/client";
export declare function createNotification(data: {
    type: NotificationType;
    recipientId: string;
    actorId?: string;
    projectId?: string;
    taskId?: string;
    commentId?: string;
    message: string;
    metadata?: Record<string, any>;
}): Promise<Notification>;
export declare function batchCreateNotifications(notifications: Array<{
    type: NotificationType;
    recipientId: string;
    actorId?: string;
    projectId?: string;
    taskId?: string;
    commentId?: string;
    message: string;
    metadata?: Record<string, any>;
}>): Promise<void>;
export declare function getNotificationsForMember(memberId: string, opts?: {
    limit?: number;
    cursor?: string;
    unreadOnly?: boolean;
}): Promise<{
    notifications: Notification[];
    nextCursor: string | null;
}>;
export declare function getUnreadCount(memberId: string): Promise<number>;
export declare function markRead(notifId: string, memberId: string): Promise<void>;
export declare function markAllRead(memberId: string): Promise<void>;
export declare function deleteNotification(notifId: string, memberId: string): Promise<void>;
export declare function deleteOldNotifications(olderThanDays: number): Promise<number>;
//# sourceMappingURL=notificationCrud.d.ts.map