import type { Request, Response, NextFunction } from "express";

// Per-member sliding-window rate limit for AI routes.
// Limits each authenticated member to MAX_AI_REQUESTS per WINDOW_MS.

const WINDOW_MS = 60_000;
const MAX_AI_REQUESTS = parseInt(process.env.AI_MEMBER_RATE_LIMIT ?? "10", 10);

const memberLog = new Map<string, number[]>();

export function aiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const memberId = req.memberId;
  if (!memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const now = Date.now();
  const log = memberLog.get(memberId) ?? [];
  const recent = log.filter(t => now - t < WINDOW_MS);

  if (recent.length >= MAX_AI_REQUESTS) {
    res.status(429).json({ error: "AI rate limit exceeded — try again in a minute" });
    return;
  }

  recent.push(now);
  memberLog.set(memberId, recent);
  next();
}
