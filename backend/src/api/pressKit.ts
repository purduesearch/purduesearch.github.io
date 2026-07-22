import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import {
  DEFAULT_PRESS_KIT_CONFIG, normalizePressKitConfig, generatePressKitContent,
  renderPressKitInnerHtml, ensurePressKitToken, buildPressKitHtml,
} from "../services/pressKitService.js";
import type { PMDoc } from "../services/blogRender.js";
import { replacePressKitDocContent } from "../collab/pressKitCollab.js";
import type { Prisma } from "@prisma/client";
import puppeteer, { type Browser } from "puppeteer";
import { existsSync } from "node:fs";
// @ts-ignore — html-to-docx ships CommonJS with a default export
import * as htmlToDocxNS from "html-to-docx";
const htmlToDocx = (htmlToDocxNS as any).default ?? htmlToDocxNS;
import { pmDocToMarkdown } from "../services/docToMarkdown.js";

// Deploys set PUPPETEER_SKIP_DOWNLOAD=true (see .github/workflows/deploy-backend.yml)
// because unpacking puppeteer's bundled Chrome needs `unzip`, which the server does
// not have — that postinstall failure aborted a whole deploy. So drive a system
// browser: an explicit env var wins, otherwise probe where distro packages land.
// Keep this list in sync with the advisory check in deploy-backend.yml.
const SYSTEM_BROWSER_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/snap/bin/chromium",
];

// undefined → puppeteer falls back to its own downloaded browser, which is what
// dev machines (where the postinstall runs normally) should use.
function resolveExecutablePath(): string | undefined {
  return process.env.PUPPETEER_EXECUTABLE_PATH || SYSTEM_BROWSER_PATHS.find((p) => existsSync(p));
}

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  const cached = browserPromise;
  if (cached) {
    try {
      const browser = await cached;
      if (browser.connected) return browser;
    } catch {
      // Fall through and relaunch. Caching a rejected promise would make every
      // later export fail forever — including after a browser is installed.
    }
    if (browserPromise === cached) browserPromise = null;
  }
  // Resolved per launch, so installing a browser takes effect on the next
  // request without restarting the backend.
  const launching = puppeteer.launch({
    headless: true,
    executablePath: resolveExecutablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  browserPromise = launching;
  try {
    return await launching;
  } catch (e) {
    if (browserPromise === launching) browserPromise = null;
    throw e;
  }
}

export const pressKitRouter = Router();
pressKitRouter.use(requireAuth);

// Project access: member of the project, or admin. Leads implicitly satisfy membership.
async function hasProjectAccess(memberId: string, projectId: string): Promise<boolean> {
  const [membership, me] = await Promise.all([
    prisma.projectMember.findUnique({ where: { projectId_memberId: { projectId, memberId } }, select: { memberId: true } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
  ]);
  return !!membership || !!me?.isAdmin;
}

async function getOrCreateKit(projectId: string, memberId: string) {
  return prisma.projectPressKit.upsert({
    where: { projectId },
    update: {},
    create: { projectId, createdById: memberId, config: DEFAULT_PRESS_KIT_CONFIG as unknown as Prisma.InputJsonValue },
  });
}

// GET /api/projects/:projectId/press-kit — fetch (lazily create) the kit
pressKitRouter.get("/projects/:projectId/press-kit", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const token = await ensurePressKitToken(projectId);
    res.json({
      id: kit.id, projectId, status: kit.status, config: normalizePressKitConfig(kit.config),
      contentJson: kit.contentJson, generatedAt: kit.generatedAt, token, theme: kit.theme,
    });
  } catch (e) { console.error("GET press-kit error:", e); res.status(500).json({ error: "Failed to load press kit" }); }
});

// POST /api/projects/:projectId/press-kit/generate — snapshot-then-replace
pressKitRouter.post("/projects/:projectId/press-kit/generate", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const config = normalizePressKitConfig({ ...normalizePressKitConfig(kit.config), ...(req.body ?? {}) });

    const doc = await generatePressKitContent(projectId, config);
    if (!doc) { res.status(404).json({ error: "Project not found" }); return; }

    // Snapshot the prior doc before overwriting (only after we know we have a new one).
    if (kit.contentJson) {
      await prisma.pressKitRevision.create({
        data: { pressKitId: kit.id, contentJson: kit.contentJson as Prisma.InputJsonValue, authorId: req.memberId! },
      });
    }

    const updated = await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: {
        contentJson: doc as unknown as Prisma.InputJsonValue,
        contentYjs: null,               // force collab to re-seed from the new contentJson
        config: config as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
        status: "DRAFT",
      },
    });
    // Push the new body into the live collab doc so connected editors see it
    // immediately — nulling contentYjs above only re-seeds on a fresh load,
    // which never happens while an editor is holding the doc open. Best-effort:
    // the DB row is the durable copy, so a collab hiccup mustn't fail generate.
    try { await replacePressKitDocContent(kit.id, doc); }
    catch (e) { console.error("press-kit generate live-doc seed failed:", e); }
    res.json({ id: updated.id, config, contentJson: updated.contentJson, generatedAt: updated.generatedAt, status: updated.status });
  } catch (e) { console.error("POST press-kit/generate error:", e); res.status(500).json({ error: "Failed to generate press kit" }); }
});

// PATCH /api/projects/:projectId/press-kit — update config only
pressKitRouter.patch("/projects/:projectId/press-kit", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const config = normalizePressKitConfig({ ...normalizePressKitConfig(kit.config), ...(req.body ?? {}) });
    const theme = (req.body ?? {}).theme;
    await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: { config: config as unknown as Prisma.InputJsonValue, ...(theme !== undefined ? { theme: theme as Prisma.InputJsonValue } : {}) },
    });
    res.json({ config, theme: theme ?? kit.theme });
  } catch (e) { console.error("PATCH press-kit error:", e); res.status(500).json({ error: "Failed to update press kit" }); }
});

// PATCH /api/projects/:projectId/press-kit/content — save edited body.
// REST fallback for persistence when the realtime collab server is unreachable
// (WS blocked / proxy misconfigured). Writes contentJson only — never
// contentYjs — so it can't corrupt a live CRDT, and onLoadDocument prefers
// contentYjs when present, keeping collab authoritative whenever it is up.
pressKitRouter.patch("/projects/:projectId/press-kit/content", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const contentJson = (req.body ?? {}).contentJson;
    if (!contentJson || typeof contentJson !== "object") { res.status(400).json({ error: "contentJson (object) required" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: { contentJson: contentJson as Prisma.InputJsonValue },
    });
    res.json({ ok: true });
  } catch (e) { console.error("PATCH press-kit/content error:", e); res.status(500).json({ error: "Failed to save press kit" }); }
});

// POST /api/projects/:projectId/press-kit/publish — snapshot rendered HTML, mark PUBLISHED
pressKitRouter.post("/projects/:projectId/press-kit/publish", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId } });
    if (!kit || !kit.contentJson) { res.status(400).json({ error: "Nothing to publish — generate first" }); return; }
    const html = renderPressKitInnerHtml(kit.contentJson as unknown as PMDoc);
    await prisma.projectPressKit.update({ where: { id: kit.id }, data: { renderedHtml: html, status: "PUBLISHED" } });
    const token = await ensurePressKitToken(projectId);
    const url = `${req.protocol}://${req.get("host")}/api/public/press-kit/${projectId}/${token}`;
    res.json({ status: "PUBLISHED", token, url });
  } catch (e) { console.error("POST press-kit/publish error:", e); res.status(500).json({ error: "Failed to publish press kit" }); }
});

// GET revisions
pressKitRouter.get("/projects/:projectId/press-kit/revisions", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId }, select: { id: true } });
    if (!kit) { res.json([]); return; }
    const revs = await prisma.pressKitRevision.findMany({
      where: { pressKitId: kit.id }, orderBy: { createdAt: "desc" }, take: 30,
      include: { author: { select: { displayName: true } } },
    });
    res.json(revs.map((r) => ({ id: r.id, createdAt: r.createdAt, author: r.author.displayName })));
  } catch (e) { console.error("GET press-kit/revisions error:", e); res.status(500).json({ error: "Failed to load revisions" }); }
});

// POST restore a revision (snapshots current first)
pressKitRouter.post("/projects/:projectId/press-kit/revisions/:revId/restore", async (req: Request, res: Response) => {
  try {
    const { projectId, revId } = req.params as { projectId: string; revId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId } });
    const rev = await prisma.pressKitRevision.findUnique({ where: { id: revId } });
    if (!kit || !rev || rev.pressKitId !== kit.id) { res.status(404).json({ error: "Revision not found" }); return; }
    if (kit.contentJson) {
      await prisma.pressKitRevision.create({
        data: { pressKitId: kit.id, contentJson: kit.contentJson as Prisma.InputJsonValue, authorId: req.memberId! },
      });
    }
    const updated = await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: { contentJson: rev.contentJson as Prisma.InputJsonValue, contentYjs: null, status: "DRAFT" },
    });
    try { await replacePressKitDocContent(kit.id, updated.contentJson as unknown as PMDoc); }
    catch (e) { console.error("press-kit restore live-doc seed failed:", e); }
    res.json({ contentJson: updated.contentJson });
  } catch (e) { console.error("POST press-kit restore error:", e); res.status(500).json({ error: "Failed to restore revision" }); }
});

// GET /api/projects/:projectId/press-kit/export?format=pdf|docx|md|html
pressKitRouter.get("/projects/:projectId/press-kit/export", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const format = String((req.query as { format?: string }).format ?? "html");

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
    const base = (project?.name ?? "press-kit").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "press-kit";

    if (format === "md") {
      const kit = await prisma.projectPressKit.findUnique({ where: { projectId }, select: { contentJson: true } });
      const md = pmDocToMarkdown(kit?.contentJson as unknown as PMDoc | null);
      if (!md.trim()) { res.status(400).json({ error: "Nothing to export — generate first" }); return; }
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.md"`);
      res.send(md);
      return;
    }

    const html = await buildPressKitHtml(projectId);
    if (!html) { res.status(400).json({ error: "Nothing to export — generate first" }); return; }

    if (format === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.html"`);
      res.send(html);
      return;
    }
    if (format === "docx") {
      const buffer = (await htmlToDocx(html)) as Buffer | ArrayBuffer;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.docx"`);
      res.send(Buffer.from(buffer as ArrayBuffer));
      return;
    }
    if (format === "pdf") {
      let browser: Browser;
      try {
        browser = await getBrowser();
      } catch (e) {
        // Distinguish "this server has no browser" from a genuine render failure:
        // the other formats still work, so say so rather than returning a bare 500.
        // The response text lands in a toast, so keep it short and put the
        // operator detail in the log.
        console.error(
          "press-kit PDF export: browser launch failed. Install a system browser with the " +
          "'Provision PDF Export' workflow, or set PUPPETEER_EXECUTABLE_PATH. Cause:", e,
        );
        res.status(503).json({
          error: "PDF export is unavailable on this server — try DOCX or HTML.",
        });
        return;
      }
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "load" });
        const pdf = await page.pdf({
          format: "Letter", printBackground: true,
          margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${base}.pdf"`);
        res.send(Buffer.from(pdf));
      } finally { await page.close(); }
      return;
    }
    res.status(400).json({ error: "Unknown format" });
  } catch (e) { console.error("GET press-kit/export error:", e); res.status(500).json({ error: "Export failed" }); }
});

// DELETE /api/projects/:projectId/press-kit — remove the kit + revisions, clear token
pressKitRouter.delete("/projects/:projectId/press-kit", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId }, select: { id: true } });
    if (kit) await prisma.projectPressKit.delete({ where: { id: kit.id } }); // cascades PressKitRevision
    await prisma.project.update({ where: { id: projectId }, data: { pressKitToken: null } });
    res.json({ ok: true });
  } catch (e) { console.error("DELETE press-kit error:", e); res.status(500).json({ error: "Failed to delete press kit" }); }
});
