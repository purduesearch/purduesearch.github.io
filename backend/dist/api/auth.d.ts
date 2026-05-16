import { type Request, type Response, type NextFunction } from "express";
export declare const authRouter: import("express-serve-static-core").Router;
interface AuthenticatedRequest extends Request {
    member?: {
        id: string;
        slackId: string;
        displayName: string;
    };
}
export declare function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
export declare function attachMember(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void>;
export {};
//# sourceMappingURL=auth.d.ts.map