import type { Member } from "@prisma/client";
import type { WebClient } from "@slack/web-api";
import type { App } from "@slack/bolt";
type SlackClient = WebClient;
export declare function resolveSlackMember(slackUserId: string, client?: WebClient): Promise<Member>;
export declare function updateMemberProfile(memberId: string, data: {
    team?: string;
    bio?: string;
    email?: string;
}): Promise<Member>;
export declare function getLeadershipChannelId(client: SlackClient): Promise<string | null>;
export declare function syncAdminStatus(app: App): Promise<void>;
export declare function isAdminBySlackId(slackId: string): Promise<boolean>;
export declare function getBotUserId(client: SlackClient): Promise<string | null>;
export {};
//# sourceMappingURL=memberService.d.ts.map