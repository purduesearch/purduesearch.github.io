export interface ParsedTask {
    title: string;
    description?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    dueDate?: string;
    parentTaskId?: string;
}
export interface TaskContext {
    projectName?: string;
    projectDescription?: string;
    projectType?: string;
    existingTasks: {
        id: string;
        title: string;
        description?: string | null;
    }[];
}
export declare function parseTaskFromMessage(text: string, todayDate?: string, context?: TaskContext): Promise<ParsedTask | null>;
//# sourceMappingURL=aiService.d.ts.map