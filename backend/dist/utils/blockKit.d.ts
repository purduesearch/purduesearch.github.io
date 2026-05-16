import type { KnownBlock, Block } from "@slack/types";
import type { Task, Member, Project } from "@prisma/client";
type TaskWithAssignees = Task & {
    assignees: Member[];
};
type TaskWithRelations = Task & {
    assignees: Member[];
    project: Project;
};
type TaskForCard = Task & {
    assignees: Member[];
    subtasks?: {
        id: string;
        title: string;
        status: string;
    }[];
    blockedBy?: {
        blockingTask: {
            id: string;
            title: string;
            status: string;
        };
    }[];
    parentTask?: {
        id: string;
        title: string;
    } | null;
};
export declare function buildTaskCard(task: TaskForCard, project: Project, options?: {
    showSubtasks?: boolean;
}): (KnownBlock | Block)[];
export declare function buildProjectStatusCard(project: Project, tasks: (Task & {
    assignees: Member[];
})[]): (KnownBlock | Block)[];
export declare function buildWeeklyDigest(member: Member, tasks: TaskWithRelations[]): (KnownBlock | Block)[];
export declare function buildTaskReminderCard(task: TaskWithRelations): (KnownBlock | Block)[];
export declare function buildWeekAheadCard(project: Project, tasks: TaskWithAssignees[]): (KnownBlock | Block)[];
export declare function buildStandupMessage(authorSlackId: string, responses: {
    yesterday: string;
    today: string;
    blockers: string;
}): (KnownBlock | Block)[];
export declare function buildHelpCard(): (KnownBlock | Block)[];
export declare function buildTodoPrompt(messageText: string): (KnownBlock | Block)[];
export declare function buildBatchedReminderDigest(member: Member, overdueTasks: TaskWithRelations[], dueTodayTasks: TaskWithRelations[]): (KnownBlock | Block)[];
export declare function buildEscalationCard(task: TaskWithRelations): (KnownBlock | Block)[];
export declare function buildAppHome(member: Member, tasks: (Task & {
    project: Project;
    assignees: Member[];
})[], frontendUrl: string): (KnownBlock | Block)[];
export declare function buildAiTaskSuggestion(parsed: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
}, channelId: string, cacheKey: string, suggestedAssigneeSlackIds?: string[]): (KnownBlock | Block)[];
export declare function buildStandupDmPrompt(displayName: string, projectChannels: {
    name: string;
    channelId: string;
}[]): (KnownBlock | Block)[];
export declare function buildStaleTasksCard(project: {
    name: string;
}, staleTasks: {
    id: string;
    title: string;
    status: string;
    updatedAt: Date;
    assignees: {
        displayName: string;
    }[];
}[]): (KnownBlock | Block)[];
type MilestoneStub = {
    title: string;
    dueDate: Date | null;
    completionPct: number;
    taskCounts: {
        total: number;
        done: number;
    };
};
export declare function buildProjectReport(project: Project, tasks: (Task & {
    assignees: Member[];
})[], milestones: MilestoneStub[], statusCounts: Record<string, number>, overdueCount: number): (KnownBlock | Block)[];
export declare function buildProjectHealth(project: Project, tasks: (Task & {
    assignees: Member[];
})[], milestones: MilestoneStub[], statusCounts: Record<string, number>, overdueCount: number): (KnownBlock | Block)[];
export declare function buildMilestoneView(project: Project, milestones: MilestoneStub[]): (KnownBlock | Block)[];
export declare function buildMilestoneCelebrationCard(title: string, projectName: string): (KnownBlock | Block)[];
export declare function buildMilestoneAlertCard(m: {
    title: string;
    status: string;
}): (KnownBlock | Block)[];
export declare function buildMarkDoneFromReactionCard(task: {
    id: string;
    title: string;
}): (KnownBlock | Block)[];
export declare function buildRiskReport(project: {
    name: string;
}, risks: {
    overallRisk: string;
    riskScore: number;
    risks: Array<{
        category: string;
        description: string;
        affectedTasks: string[];
        severity: string;
    }>;
    topRecommendation: string;
}): (KnownBlock | Block)[];
export declare function buildCapacityReport(project: {
    name: string;
}, cap: {
    overloaded: Array<{
        member: string;
        recommendation: string;
    }>;
    underloaded: Array<{
        member: string;
        suggestion: string;
    }>;
    balanceScore: number;
    summary: string;
}): (KnownBlock | Block)[];
export declare function buildDriveTaskPreview(tasks: Array<{
    title: string;
    description?: string | null;
    priority?: string | null;
    dueDate?: string | null;
    suggestedAssigneeName?: string | null;
    sourceContext?: string | null;
}>, channelId: string): (KnownBlock | Block)[];
export declare function buildDependencySuggestionsBlocks(dependencies: Array<{
    blockedTaskId: string;
    blockingTaskId: string;
    confidence: number;
    reason: string;
}>, _projectId: string): (KnownBlock | Block)[];
export declare function buildStandupDigestBlocks(synthesis: {
    digest: string;
    blockers: Array<{
        member: string;
        issue: string;
    }>;
    momentum: string;
    callout: string;
}, projectName: string): (KnownBlock | Block)[];
export {};
//# sourceMappingURL=blockKit.d.ts.map