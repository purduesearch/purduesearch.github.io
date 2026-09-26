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
import { prisma } from "../db/prisma.js";
import { reconcileVaultRepository } from "../services/vaultCutoverService.js";
import { syncLinkedPrs } from "../services/vaultPrReviewService.js";
import { indexPushPayload } from "../services/vaultSearchService.js";

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
      const vaultReviewEvent = ["pull_request", "pull_request_review", "check_run", "check_suite"].includes(event);
      let processVaultReview = vaultReviewEvent;
      if (vaultReviewEvent && typeof delivery === "string") {
        try { await prisma.vaultWebhookDelivery.create({ data: { id: delivery, event } }); }
        catch (err: any) { if (err?.code === "P2002") processVaultReview = false; else throw err; }
      }
      // A delivery id is claimed before syncing so a duplicate delivery is a no-op.
      // If the sync fails, release the claim so a manual redelivery can retry it;
      // the scheduler's PR reconcile covers deliveries nobody redelivers.
      const syncVaultReview = async (number?: number) => {
        if (!processVaultReview) return;
        const failed = await syncLinkedPrs(payload.repository?.full_name || "", number);
        if (failed && typeof delivery === "string") await prisma.vaultWebhookDelivery.deleteMany({ where: { id: delivery } });
      };
      switch (event) {
        case "issues":               await handleIssueEvent(payload);              break;
        case "pull_request":         await handlePullRequestEvent(payload); await syncVaultReview(payload.pull_request?.number); break;
        case "pull_request_review":  await handlePullRequestReviewEvent(payload); await syncVaultReview(payload.pull_request?.number); break;
        case "push":
          await handlePushEvent(payload);
          if (payload.repository?.full_name && payload.ref) {
            const branch = String(payload.ref).replace(/^refs\/heads\//, "");
            const repos = await prisma.vaultRepository.findMany({ where: { repoSlug: String(payload.repository.full_name).toLowerCase(), branch }, select: { projectId: true } });
            for (const repo of repos) await reconcileVaultRepository(repo.projectId, payload.after);
            // Search: commits are keyed by SHA, so a redelivered push rewrites the same rows.
            if (repos.length) await indexPushPayload(payload).catch((err) => console.error("[github-webhook] vault search index failed:", err?.message || err));
          }
          break;
        case "installation":
        case "installation_repositories": {
          const repos = await prisma.vaultRepository.findMany({ where: { installId: payload.installation?.id }, select: { projectId: true } });
          for (const repo of repos) await reconcileVaultRepository(repo.projectId);
          const linked = await prisma.projectRepo.findMany({ where: { installId: payload.installation?.id }, select: { slug: true } });
          for (const repo of linked) await syncLinkedPrs(repo.slug);
          break;
        }
        case "check_suite":          await handleCheckEvent(payload); await syncVaultReview(); break;
        case "check_run":            await handleCheckEvent(payload); await syncVaultReview(); break;
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
