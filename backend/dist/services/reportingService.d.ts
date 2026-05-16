export declare function getProjectBurndown(projectId: string): Promise<{
    date: string;
    remaining: number;
    completed: number;
    total: number;
}[]>;
export declare function getProjectStatusCounts(projectId: string): Promise<Record<string, number>>;
export declare function getOverdueCount(projectId: string): Promise<number>;
export declare function getProjectReport(projectId: string): Promise<{
    burndown: {
        date: string;
        remaining: number;
        completed: number;
        total: number;
    }[];
    statusCounts: Record<string, number>;
    overdueCount: number;
}>;
//# sourceMappingURL=reportingService.d.ts.map