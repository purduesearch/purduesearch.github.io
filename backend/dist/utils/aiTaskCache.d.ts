export interface CachedAiTask {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    parentTaskId?: string;
    suggestedAssigneeSlackIds: string[];
    channelId: string;
}
export declare function storeAiTask(data: CachedAiTask): string;
export declare function retrieveAiTask(key: string): CachedAiTask | null;
//# sourceMappingURL=aiTaskCache.d.ts.map