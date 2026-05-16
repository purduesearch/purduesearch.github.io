export declare function driveToTasksPrompt(projectName: string, projectDescription: string, existingTaskTitles: string[], today: string, suggestedTaskCount?: number): string;
export declare function meetingNotesToTasksPrompt(projectName: string, attendees: string[], today: string, suggestedTaskCount?: number): string;
export declare function imageToTaskPrompt(projectName: string, userNote: string): string;
export declare function duplicateDetectionPrompt(newTitle: string, newDescription: string, existingTasks: Array<{
    id: string;
    title: string;
    description?: string | null;
}>): string;
export declare function enrichTaskPrompt(title: string, description: string, projectType: string): string;
export declare function deadlineSuggestionPrompt(title: string, description: string, storyPoints: number | null, teamVelocityPointsPerWeek: number, projectDeadline: string | null, today: string): string;
export declare function riskAnalysisPrompt(project: {
    name: string;
    targetDate?: string;
}, tasks: Array<{
    title: string;
    status: string;
    dueDate?: string | null;
    priority: string;
    assignees: string[];
}>, today: string): string;
export declare function sprintPlanPrompt(tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    storyPoints?: number | null;
    assignees: string[];
    dueDate?: string | null;
}>, teamCapacityPoints: number, sprintLengthDays: number, today: string): string;
export declare function projectBriefPrompt(project: {
    name: string;
    description?: string | null;
    type: string;
    targetDate?: string | null;
}, tasks: Array<{
    title: string;
    status: string;
    priority: string;
}>, milestones: Array<{
    name: string;
    targetDate?: string | null;
    status: string;
}>, recentUpdates: string[]): string;
export declare function standupSynthesisPrompt(standups: Array<{
    memberName: string;
    yesterday: string;
    today: string;
    blockers: string;
}>, projectName: string): string;
export declare function standupSentimentPrompt(standups: Array<{
    memberName: string;
    text: string;
}>): string;
export declare function inferDependenciesPrompt(tasks: Array<{
    id: string;
    title: string;
    description?: string | null;
}>): string;
export declare function capacityAnalysisPrompt(members: Array<{
    name: string;
    taskCount: number;
    highPriorityCount: number;
    totalEstimatedHours: number | null;
}>, sprintDays: number): string;
export declare function nlToTaskPrompt(input: string, projectName: string, members: string[], today: string): string;
export declare function stakeholderEmailPrompt(project: {
    name: string;
    targetDate?: string | null;
}, completedThisWeek: string[], inProgress: string[], blockers: string[], overallHealthScore: number): string;
export declare function projectQaPrompt(question: string, project: {
    name: string;
    description?: string | null;
    type: string;
    targetDate?: string | null;
}, tasks: Array<{
    title: string;
    status: string;
    priority: string;
    assignees: string[];
    dueDate?: string | null;
}>, members: string[], milestones: Array<{
    title: string;
    status: string;
    targetDate?: string | null;
}>, recentUpdates: string[]): string;
//# sourceMappingURL=aiPrompts.d.ts.map