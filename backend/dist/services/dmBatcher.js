// ── DM Batcher Service ────────────────────────────────────────
// In-memory 3-minute debounce batching for Slack DMs.
// Queues messages per user and sends one combined DM after 3 minutes of no new messages.
const BATCH_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
let slackApp = null;
const queues = new Map();
/**
 * Initialize the DM batcher with a Slack App instance.
 * Must be called once at startup before any queueDm calls.
 */
export function initDmBatcher(app) {
    slackApp = app;
    console.log("✅ DM Batcher initialized");
}
/**
 * Queue a DM for a Slack user. Resets their 3-minute timer.
 * @param slackId - The Slack user ID (U123ABC, not @username)
 * @param message - The message text to queue
 */
export function queueDm(slackId, message) {
    if (!slackApp) {
        console.warn("⚠️  DM Batcher not initialized. Call initDmBatcher() at startup.");
        return;
    }
    // Get or create queue entry
    let entry = queues.get(slackId);
    if (entry) {
        // Clear existing timer
        clearTimeout(entry.timer);
    }
    else {
        // Create new entry
        entry = { messages: [], timer: null };
        queues.set(slackId, entry);
    }
    // Add message to queue
    entry.messages.push(message);
    // Set new timer
    entry.timer = setTimeout(async () => {
        await flushDm(slackId);
    }, BATCH_TIMEOUT_MS);
}
/**
 * Immediately flush all queued messages for a Slack user.
 * @param slackId - The Slack user ID
 */
export async function flushDm(slackId) {
    if (!slackApp) {
        console.warn("⚠️  DM Batcher not initialized. Call initDmBatcher() at startup.");
        return;
    }
    const entry = queues.get(slackId);
    if (!entry || entry.messages.length === 0) {
        // Nothing to flush
        return;
    }
    // Clear timer
    clearTimeout(entry.timer);
    const messages = entry.messages;
    queues.delete(slackId);
    try {
        // Format message based on count
        let text;
        let blocks = [];
        if (messages.length === 1) {
            // Single message: send as-is
            text = messages[0];
        }
        else {
            // Multiple messages: send with header and numbered list
            text = `🔔 *You have ${messages.length} notifications:*`;
            const bulletList = messages
                .map((msg, idx) => `${idx + 1}. ${msg}`)
                .join("\n");
            blocks = [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `${text}\n\n${bulletList}`,
                    },
                },
            ];
        }
        // Send DM
        await slackApp.client.chat.postMessage({
            channel: slackId,
            text,
            blocks: blocks.length > 0 ? blocks : undefined,
        });
        console.log(`✉️  Sent batched DM to ${slackId} (${messages.length} message${messages.length === 1 ? "" : "s"})`);
    }
    catch (error) {
        console.error(`❌ Failed to send batched DM to ${slackId}:`, error instanceof Error ? error.message : error);
        // Never throw — log and continue
    }
}
//# sourceMappingURL=dmBatcher.js.map