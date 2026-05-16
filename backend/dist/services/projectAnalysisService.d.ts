export declare function analyzeProjectRisks(projectId: string): Promise<unknown>;
export declare function generateSprintPlan(projectId: string, capacityPoints?: number, sprintDays?: number): Promise<unknown>;
export declare function generateProjectBrief(projectId: string): Promise<unknown>;
export declare function synthesizeStandups(responses: Array<{
    memberName: string;
    yesterday: string;
    today: string;
    blockers: string;
}>, projectName: string): Promise<unknown>;
export declare function analyzeStandupSentiment(responses: Array<{
    memberName: string;
    text: string;
}>): Promise<unknown>;
export declare function inferTaskDependencies(projectId: string): Promise<unknown>;
export declare function analyzeTeamCapacity(projectId: string, sprintDays?: number): Promise<unknown>;
export declare function generateStakeholderEmail(projectId: string): Promise<unknown>;
//# sourceMappingURL=projectAnalysisService.d.ts.map