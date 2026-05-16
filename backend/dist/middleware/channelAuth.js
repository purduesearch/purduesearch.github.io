import { prisma } from "../db/prisma.js";
import { getChannelMemberSlackIds } from "../services/projectService.js";
/**
 * Rejects mutations if the current user is not a member of the project's linked Slack channel.
 * Attach after requireAuth. Reads projectId from:
 *   - req.params.id   (for PATCH /api/projects/:id)
 *   - task → projectId  (for PATCH/DELETE /api/tasks/:id)
 */
export async function channelAuth(req, res, next) {
    try {
        let projectId = null;
        const paramId = req.params.id;
        if (req.baseUrl.includes("/tasks")) {
            const task = await prisma.task.findUnique({
                where: { id: paramId },
                select: { projectId: true },
            });
            projectId = task?.projectId ?? null;
        }
        else {
            projectId = paramId;
        }
        if (!projectId) {
            next();
            return;
        }
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { slackChannelId: true },
        });
        if (!project?.slackChannelId) {
            next();
            return;
        }
        // Look up the current user's slackId from the session
        const memberId = req.session.memberId;
        if (!memberId) {
            res.status(401).json({ error: "Not authenticated" });
            return;
        }
        const member = await prisma.member.findUnique({
            where: { id: memberId },
            select: { slackId: true },
        });
        const memberSlackIds = await getChannelMemberSlackIds(project.slackChannelId);
        if (!member?.slackId || !memberSlackIds.includes(member.slackId)) {
            res.status(403).json({
                error: "You must be a member of the linked Slack channel to edit this project.",
            });
            return;
        }
        next();
    }
    catch (err) {
        console.error("channelAuth middleware error:", err);
        // Fail-open on Slack API errors to avoid blocking legitimate users
        next();
    }
}
//# sourceMappingURL=channelAuth.js.map