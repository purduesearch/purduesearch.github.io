import { Router, type Request, type Response } from "express";
import express from "express";
import { Webhooks } from "@octokit/webhooks";
import {
  handleIssueEvent,
  handlePullRequestEvent,
  handlePullRequestReviewEvent,
  handlePushEvent,
  handleCheckEvent,
} from "../services/githubSyncService.js";

// Webhook receiver for the GitHub App. Mounted BEFORE express.json() in
// app.ts so the raw body is available for HMAC verification.
//
// Local dev: forward github → http://localhost:3001/api/github/webhook via
// smee.io:
//   npx smee-client -u https://smee.io/<your-channel> \
//                   -t http://localhost:3001/api/github/webhook
// In your GitHub App webhook config, set the URL to the smee channel and
// the secret to GITHUB_WEBHOOK_SECRET.

export const githubWebhookRouter = Router();

// Raw body capture — required for signature verification. Only this route
// uses it; the rest of the app continues to use express.json().
githubWebhookRouter.use(express.raw({ type: "application/json", limit: "10mb" }));

let webhooks: Webhooks | null = null;
function getVerifier(): Webhooks | null {
  if (webhooks) return webhooks;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return null;
  webhooks = new Webhooks({ secret });
  return webhooks;
}

githubWebhookRouter.post("/", async (req: Request, res: Response) => {
  const verifier = getVerifier();
  if (!verifier) {
    res.status(500).json({ error: "GITHUB_WEBHOOK_SECRET not configured" });
    return;
  }

  const signature = req.headers["x-hub-signature-256"];
  const event = req.headers["x-github-event"];
  const delivery = req.headers["x-github-delivery"];

  if (typeof signature !== "string" || typeof event !== "string") {
    res.status(400).json({ error: "Missing signature or event header" });
    return;
  }

  // req.body is a Buffer because of express.raw above
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!rawBody) {
    res.status(400).json({ error: "Empty body" });
    return;
  }

  const valid = await verifier.verify(rawBody, signature);
  if (!valid) {
    console.warn(`[github-webhook] invalid signature event=${event} delivery=${delivery}`);
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { res.status(400).json({ error: "Invalid JSON" }); return; }

  // ACK fast — handlers run async; GitHub retries on 5xx but ours are fire-and-forget.
  res.status(202).json({ ok: true });

  // Dispatch — wrapped so any thrown handler doesn't crash the process.
  Promise.resolve().then(async () => {
    try {
      switch (event) {
        case "issues":               await handleIssueEvent(payload);              break;
        case "pull_request":         await handlePullRequestEvent(payload);         break;
        case "pull_request_review":  await handlePullRequestReviewEvent(payload);   break;
        case "push":                 await handlePushEvent(payload);               break;
        case "check_suite":
        case "check_run":            await handleCheckEvent(payload);              break;
        case "ping":
          console.log(`[github-webhook] ping ok delivery=${delivery}`);
          break;
        default:
          // Unhandled event type — ignore silently to avoid log noise.
          break;
      }
    } catch (err) {
      console.error(`[github-webhook] dispatch failed event=${event}:`, err);
    }
  });
});
