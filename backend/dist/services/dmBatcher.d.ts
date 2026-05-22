import type { App } from "@slack/bolt";
/**
 * Initialize the DM batcher with a Slack App instance.
 * Must be called once at startup before any queueDm calls.
 */
export declare function initDmBatcher(app: App): void;
/**
 * Queue a DM for a Slack user. Resets their 3-minute timer.
 * @param slackId - The Slack user ID (U123ABC, not @username)
 * @param message - The message text to queue
 */
export declare function queueDm(slackId: string, message: string): void;
/**
 * Immediately flush all queued messages for a Slack user.
 * @param slackId - The Slack user ID
 */
export declare function flushDm(slackId: string): Promise<void>;
//# sourceMappingURL=dmBatcher.d.ts.map