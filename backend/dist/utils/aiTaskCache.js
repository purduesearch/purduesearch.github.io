// Short-lived in-memory store for AI-parsed task data.
// Keyed by a random 8-char ID that fits in a Slack button value alongside
// the channel ID. Entries expire after 15 minutes.
const TTL_MS = 15 * 60 * 1000;
const cache = new Map();
export function storeAiTask(data) {
    const key = Math.random().toString(36).slice(2, 10);
    cache.set(key, { ...data, expiresAt: Date.now() + TTL_MS });
    // Prune expired entries when the cache grows large
    if (cache.size > 200) {
        const now = Date.now();
        for (const [k, v] of cache) {
            if (v.expiresAt < now)
                cache.delete(k);
        }
    }
    return key;
}
export function retrieveAiTask(key) {
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (entry.expiresAt < Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry;
}
//# sourceMappingURL=aiTaskCache.js.map