import type { Member } from "@prisma/client";
import type { WebClient } from "@slack/web-api";
import type { App } from "@slack/bolt";
type SlackClient = WebClient;
export declare function resolveSlackMember(slackUserId: string, client?: WebClient): Promise<Member>;
export declare function getLeadershipChannelId(client: SlackClient): Promise<string | null>;
export declare function syncAdminStatus(app: App): Promise<void>;
export declare function isAdminBySlackId(slackId: string): Promise<boolean>;
export {};
//# sourceMappingURL=memberService.d.ts.map