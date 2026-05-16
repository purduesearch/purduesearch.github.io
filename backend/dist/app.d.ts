import "dotenv/config";
declare const app: import("express-serve-static-core").Express;
declare module "express-session" {
    interface SessionData {
        memberId: string;
        slackAccessToken: string;
    }
}
export { app };
//# sourceMappingURL=app.d.ts.map