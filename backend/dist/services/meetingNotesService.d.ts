interface ProjectSummary {
    id: string;
    name: string;
    tasksCreated: number;
    tasksCompleted: number;
    tasksBlocked: number;
    tasksOverdue: number;
    milestonesCompleted: string[];
    milestoneStatusChanges: Array<{
        title: string;
        from: string;
        to: string;
    }>;
    keyChanges: Array<{
        description: string;
        timestamp: string;
    }>;
}
interface MeetingTemplate {
    generatedAt: string;
    weekRange: {
        start: string;
        end: string;
    };
    projects: ProjectSummary[];
    clubWide: {
        totalTasksCompleted: number;
        totalNewTasks: number;
        velocityDelta: string;
        membersActive: number;
    };
    agendaTemplate: string;
}
export declare function generateWeeklyMeetingTemplate(weekEndDate?: Date): Promise<MeetingTemplate>;
export {};
//# sourceMappingURL=meetingNotesService.d.ts.map