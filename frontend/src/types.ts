// ── Shared Types ─────────────────────────────────────────────

export type Role = "ADMIN" | "LEAD" | "MEMBER";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type ProjectType = "ENGINEERING" | "RESEARCH" | "HYBRID";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Member {
  id: string;
  slackId: string;
  slackHandle: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  slackChannel: string | null;
  status: ProjectStatus;
  type: ProjectType;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
  tasks: Task[];
  updates?: ProjectUpdate[];
  // Aggregated fields from API
  totalTasks?: number;
  doneTasks?: number;
  completionPercent?: number;
}

export interface ProjectMember {
  projectId: string;
  memberId: string;
  projectRole: string;
  joinedAt: string;
  member: Member;
  project?: Project;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  projectId: string;
  assigneeId: string | null;
  assignee: Member | null;
  project?: Project;
  slackMsgTs: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectUpdate {
  id: string;
  projectId: string;
  authorId: string;
  content: string;
  postedAt: string;
}

export interface MemberWithDetails extends Member {
  tasks: Task[];
  projects: ProjectMember[];
}
