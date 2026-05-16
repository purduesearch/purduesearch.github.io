import type { Request, Response, NextFunction } from "express";
/**
 * Rejects mutations if the current user is not a member of the project's linked Slack channel.
 * Attach after requireAuth. Reads projectId from:
 *   - req.params.id   (for PATCH /api/projects/:id)
 *   - task → projectId  (for PATCH/DELETE /api/tasks/:id)
 */
export declare function channelAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=channelAuth.d.ts.map