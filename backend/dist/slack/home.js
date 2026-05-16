import { resolveSlackMember } from "../services/memberService.js";
import { getTasksForMember } from "../services/taskService.js";
import { buildAppHome } from "../utils/blockKit.js";
export function registerHome(app) {
    app.event("app_home_opened", async ({ event, client }) => {
        if (event.tab !== "home")
            return;
        try {
            const slackUserId = event.user;
            const member = await resolveSlackMember(slackUserId, client);
            const tasks = await getTasksForMember(member.id);
            const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
            await client.views.publish({
                user_id: slackUserId,
                view: {
                    type: "home",
                    blocks: buildAppHome(member, tasks, frontendUrl),
                },
            });
        }
        catch (error) {
            console.error("app_home_opened error:", error);
        }
    });
}
export async function refreshAppHome(client, slackUserId) {
    try {
        const member = await resolveSlackMember(slackUserId);
        const tasks = await getTasksForMember(member.id);
        const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
        await client.views.publish({
            user_id: slackUserId,
            view: {
                type: "home",
                blocks: buildAppHome(member, tasks, frontendUrl),
            },
        });
    }
    catch (error) {
        console.error("refreshAppHome error:", error);
    }
}
//# sourceMappingURL=home.js.map