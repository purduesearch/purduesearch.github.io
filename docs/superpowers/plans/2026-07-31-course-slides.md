# Course Slides Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SLIDES` section kind — a deck imported from PDF, PowerPoint, or a Google Slides link, paged through by the learner, optionally driven by a narration track, with in-flow questions.

**Architecture:** All three ingest paths normalize to a **PDF on the server**, which the **browser** renders to per-page PNGs with `pdfjs-dist` and uploads one page at a time. Slides are `CourseSlide` rows; narration is one Drive file plus an author-recorded `startSec` per slide. Overlay questions reuse `CourseQuestion` with a new `slideIndex`, mirroring `videoTimestampSec`.

**Tech Stack:** Prisma + PostgreSQL, Express (ESM TypeScript — relative imports end in `.js`), `googleapis` Drive v3, multer, React 19, `pdfjs-dist` (new frontend dep).

**Spec:** `docs/superpowers/specs/2026-07-31-course-slides-design.md`
**Depends on:** `docs/superpowers/plans/2026-07-31-course-modules.md` having shipped.

## Global Constraints

- **One pipeline.** `.pdf`, `.pptx`, and a Google Slides link differ only in how a PDF is obtained. Everything downstream of "we have a PDF" is shared code. Do not add a second render path.
- **Never post images as base64 JSON.** `app.ts` runs `express.json()` at the default **100 kb** limit. Slide PNGs go up as multipart, **one request per page**.
- **`slideConfig` writers must spread the previous value** before saving, or a partial save drops keys it does not own. Same rule `videoConfig` already follows.
- **The slide clamp is monotonic-and-in-range only.** No wall-clock rule. Paging fast is reading fast, not cheating; video's time budget exists because watch time can be faked and has no slide analogue.
- **Locked sections stay withheld by omission.** `slides` and `slideConfig` are attached to a `LearnerSection` only when unlocked, exactly as `contentJson` and `videoConfig` already are.
- **`drive.readonly` gates only the link path.** `.pdf` and `.pptx` must work without it. When the scope is absent, disable the link tab with an explanation — never fail the whole workbench.
- **A re-import never deletes questions.** An out-of-range `slideIndex` clamps to the last slide and is flagged in the workbench.
- **Backend is ESM TypeScript:** every relative import ends in `.js`.
- **Run `npx prisma generate` in `backend/` after any schema change and before any `tsc` run.**
- **Verification gate after every phase:** `npm run build` at repo root **and** `npx tsc --noEmit` in `backend/`.
- **Font Awesome for icons, never emoji.** CSS appends to `public/clubpm-theme.css` only.

---

# Phase 1 — Schema, Drive conversion, and the PDF endpoint

## Task 1: Schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (the courses block, ~1892–2071)
- Create: `backend/prisma/migrations/<timestamp>_course_slides/migration.sql`

**Interfaces:**
- Consumes: `CourseSection`, `CourseQuestion`, `CourseSectionProgress` as the modules plan left them.
- Produces: `CourseSectionKind.SLIDES`; model `CourseSlide`; `CourseSection.slideConfig`; `CourseQuestion.slideIndex`; `CourseSectionProgress.maxSlideIndex`.

- [ ] **Step 1: Edit the schema**

Add `SLIDES` to the enum:

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
}
```

Add to `model CourseSection`, beside `videoConfig`:

```prisma
  // SLIDES: { sourceKind, sourceName, audioUrl, audioFileId, audioDurationSec, autoAdvance }
  // One JSON column, like videoConfig — every writer spreads the previous value
  // so a partial save cannot drop keys it does not own.
  slideConfig   Json?
```

and to its relations block:

```prisma
  slides    CourseSlide[]
```

Add to `model CourseQuestion`, beside `videoTimestampSec`:

```prisma
  // null → quiz/pop-up question; non-null → overlay on this slide of a SLIDES
  // section. A row has at most one of slideIndex / videoTimestampSec set.
  slideIndex        Int?
```

Add to `model CourseSectionProgress`:

```prisma
  // Server-clamped high-water mark for SLIDES sections.
  maxSlideIndex    Int                  @default(0)
```

Add the new model after `CourseAnswer`:

```prisma
model CourseSlide {
  id          String        @id @default(cuid())
  sectionId   String
  section     CourseSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  index       Int
  // Drive direct-view URL. Public-but-unguessable, like every blog image; the
  // gate protects sequencing by withholding the URL, not by ACL.
  imageUrl    String
  // Kept so a re-import can delete exactly what it replaces.
  imageFileId String
  text        String?
  notes       String?
  startSec    Int?
  width       Int?
  height      Int?

  @@index([sectionId, index])
}
```

- [ ] **Step 2: Generate and apply the migration**

```bash
cd backend && npx prisma migrate dev --name course_slides && npx prisma generate
```

Every change is additive (new enum value, new table, nullable/defaulted columns), so the generated SQL needs no hand-editing. Read it anyway and confirm there is no `DROP` and no un-defaulted `NOT NULL` on an existing table.

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean. Nothing reads the new fields yet.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(courses): SLIDES kind, CourseSlide table, slide progress column

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Drive conversion helpers and the OAuth scope

**Files:**
- Modify: `backend/src/services/driveService.ts` (append after `uploadStreamToDrive`, ~line 283)
- Modify: `backend/src/api/googleAuth.ts:13`

**Interfaces:**
- Consumes: `getBotDrive()` (module-private in `driveService.ts`).
- Produces:
  ```ts
  export async function convertUploadToPdf(
    stream: NodeJS.ReadableStream, mimeType: string, filename: string, folderId: string
  ): Promise<{ stream: NodeJS.ReadableStream; tempFileId: string } | null>;

  export async function exportDriveFileAsPdf(
    fileId: string
  ): Promise<{ stream: NodeJS.ReadableStream } | { error: "NOT_FOUND" | "FORBIDDEN" | "UNAVAILABLE" }>;

  export function hasDriveReadonlyScope(scope: string | null | undefined): boolean;
  ```
  Task 3 calls all three.

- [ ] **Step 1: Widen the OAuth scope**

In `backend/src/api/googleAuth.ts`, replace line 13:

```ts
// drive.readonly is needed ONLY to export a Google Slides deck the bot account
// did not create (drive.file covers files we upload ourselves). Adding it means
// an admin must RECONNECT the account — the stored refresh token does not carry
// a scope granted after it was issued.
const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "openid",
  "email",
];
```

The existing code already persists `tokens.scope` on the credential row (lines 139 and 145), which is what Step 3's detector reads. Do not change that.

- [ ] **Step 2: Add the conversion helpers**

Append to `backend/src/services/driveService.ts`:

```ts
const PDF_MIME = "application/pdf";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";

/**
 * Upload a .pptx and let Drive convert it to a Google Slides file, then export
 * that as PDF. Both halves are legal under `drive.file` because the app created
 * the file it is reading.
 *
 * Returns the PDF stream plus the temporary Drive file id — the caller MUST
 * delete it (see deleteDriveFile) or every import leaks a converted copy.
 */
export async function convertUploadToPdf(
  stream: NodeJS.ReadableStream,
  mimeType: string,
  filename: string,
  folderId: string
): Promise<{ stream: NodeJS.ReadableStream; tempFileId: string } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const created = await drive.files.create({
      requestBody: { name: filename, parents: [folderId], mimeType: GOOGLE_SLIDES_MIME },
      media: { mimeType, body: stream },
      fields: "id",
      supportsAllDrives: true,
    });
    const tempFileId = created.data.id;
    if (!tempFileId) return null;
    const exported = await drive.files.export(
      { fileId: tempFileId, mimeType: PDF_MIME },
      { responseType: "stream" }
    );
    return { stream: exported.data as unknown as NodeJS.ReadableStream, tempFileId };
  } catch (err) {
    console.error("[driveService] convertUploadToPdf error:", err);
    return null;
  }
}

/**
 * Export an existing Drive file (a Google Slides deck the bot account can see)
 * as PDF. Distinguishes not-found from forbidden so the caller can tell the
 * author to share the deck with the bot account rather than showing a bare 403.
 */
export async function exportDriveFileAsPdf(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream } | { error: "NOT_FOUND" | "FORBIDDEN" | "UNAVAILABLE" }> {
  const drive = await getBotDrive();
  if (!drive) return { error: "UNAVAILABLE" };
  try {
    const exported = await drive.files.export(
      { fileId, mimeType: PDF_MIME },
      { responseType: "stream" }
    );
    return { stream: exported.data as unknown as NodeJS.ReadableStream };
  } catch (err) {
    const status = (err as { code?: number; status?: number }).code
      ?? (err as { status?: number }).status;
    if (status === 404) return { error: "NOT_FOUND" };
    if (status === 403) return { error: "FORBIDDEN" };
    console.error("[driveService] exportDriveFileAsPdf error:", err);
    return { error: "UNAVAILABLE" };
  }
}

/**
 * Whether the stored credential was granted drive.readonly. Read from the
 * persisted `scope` string, because a token issued before the scope was added
 * keeps working for everything else — only the link import must be disabled.
 */
export function hasDriveReadonlyScope(scope: string | null | undefined): boolean {
  return (scope ?? "").includes("https://www.googleapis.com/auth/drive.readonly");
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/driveService.ts backend/src/api/googleAuth.ts
git commit -m "feat(drive): pptx/slides to PDF conversion and drive.readonly scope

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The PDF source endpoint

**Files:**
- Create: `backend/src/services/courseSlideService.ts`
- Modify: `backend/src/api/courses.ts` (new section after the Sections routes)

**Interfaces:**
- Consumes: `convertUploadToPdf`, `exportDriveFileAsPdf`, `hasDriveReadonlyScope`, `extractFileId`, `ensureClubPmRootFolder`, `deleteDriveFile`, `getBotAccountEmail` (all in `driveService.ts`).
- Produces: `POST /api/outreach/courses/sections/:sid/deck/source` → `application/pdf`; `GET /api/outreach/courses/slide-capabilities` → `{ canImportLink, botEmail }`. Task 7 calls both.

- [ ] **Step 1: Add the capabilities route**

In `backend/src/api/courses.ts`, add a `// ── Slides ───` banner after the Sections routes, and:

```ts
// GET /slide-capabilities — whether the bot account can export a linked Google
// Slides deck. MUST be registered above any /:id route or Express matches it as
// a course id (the same trap members.ts documents for /cosmetic-styles).
coursesRouter.get("/slide-capabilities", async (_req: Request, res: Response) => {
  try {
    const cred = await prisma.googleDriveCredential.findUnique({
      where: { id: "singleton" }, select: { scope: true },
    });
    const { hasDriveReadonlyScope, getBotAccountEmail } = await import("../services/driveService.js");
    res.json({
      canImportLink: hasDriveReadonlyScope(cred?.scope),
      botEmail: await getBotAccountEmail(),
    });
  } catch (error) {
    console.error("GET /outreach/courses/slide-capabilities error:", error);
    res.json({ canImportLink: false, botEmail: null });
  }
});
```

**Move this above the `GET /:id` handler** (currently line 130) — Express matches in registration order, so leaving it below makes `slide-capabilities` a course id lookup that 404s.

- [ ] **Step 2: Add the deck/source route**

Add near the top of `courses.ts`, beside the other imports:

```ts
import multer from "multer";

// Decks are streamed straight to Drive for conversion, so memory storage is
// fine and no temp directory is needed. 60 MB covers a large slide deck.
const deckUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
});
```

Then the route:

```ts
// POST /sections/:sid/deck/source — normalize any deck source to a PDF and
// stream it back. The ONLY place Drive's conversion machinery is touched;
// everything downstream of "we have a PDF" is shared browser code.
//
// Body is either multipart with a `deck` file (.pptx or .pdf) or JSON { url }.
coursesRouter.post(
  "/sections/:sid/deck/source",
  deckUpload.single("deck"),
  async (req: Request, res: Response) => {
    try {
      const sid = req.params.sid as string;
      if (!(await requireSectionAccess(req, res, sid))) return;

      const drive = await import("../services/driveService.js");

      // A .pdf never needs the server at all, but accepting it keeps the client
      // to one code path when the author does upload one here.
      if (req.file && req.file.mimetype === "application/pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.send(req.file.buffer);
        return;
      }

      if (req.file) {
        const folderId = await drive.ensureClubPmRootFolder();
        if (!folderId) {
          res.status(503).json({ error: "Google Drive is not connected" });
          return;
        }
        const { Readable } = await import("node:stream");
        const converted = await drive.convertUploadToPdf(
          Readable.from(req.file.buffer),
          req.file.mimetype,
          req.file.originalname || "deck.pptx",
          folderId
        );
        if (!converted) {
          res.status(502).json({ error: "Could not convert that presentation" });
          return;
        }
        res.setHeader("Content-Type", "application/pdf");
        converted.stream.pipe(res);
        // The converted Google Slides copy is scratch space; leaving it behind
        // leaks one Drive file per import.
        res.on("close", () => { void drive.deleteDriveFile(converted.tempFileId); });
        return;
      }

      const { url } = req.body as { url?: string };
      if (!url?.trim()) {
        res.status(400).json({ error: "Upload a file or provide a Google Slides link" });
        return;
      }
      const fileId = drive.extractFileId(url.trim());
      if (!fileId) {
        res.status(400).json({ error: "That does not look like a Google Slides link" });
        return;
      }
      const result = await drive.exportDriveFileAsPdf(fileId);
      if ("error" in result) {
        const botEmail = await drive.getBotAccountEmail();
        const message = result.error === "FORBIDDEN" || result.error === "NOT_FOUND"
          ? `Share that deck with ${botEmail ?? "the SEARCH bot account"} (view access is enough), then try again`
          : "Google Drive is not available right now";
        res.status(result.error === "UNAVAILABLE" ? 503 : 403).json({ error: message });
        return;
      }
      res.setHeader("Content-Type", "application/pdf");
      result.stream.pipe(res);
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/deck/source error:", error);
      if (!res.headersSent) res.status(500).json({ error: "Could not load that deck" });
    }
  }
);
```

- [ ] **Step 3: Verify and smoke test**

```bash
cd backend && npx tsc --noEmit && npm run dev
```

With the server up, `curl` the endpoint with a small `.pptx` and confirm the response is a PDF:

```bash
curl -s -o /tmp/out.pdf -w '%{content_type}\n' \
  -H "Authorization: Bearer $TOKEN" \
  -F deck=@sample.pptx \
  http://localhost:4000/api/outreach/courses/sections/$SID/deck/source
```

Expected: `application/pdf`, and `/tmp/out.pdf` opens.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/courses.ts
git commit -m "feat(courses): one endpoint normalizing any deck source to PDF

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 2 — Slide storage, progress, and the learner payload

## Task 4: Slide + audio service and routes

**Files:**
- Modify: `backend/src/services/courseSlideService.ts`
- Modify: `backend/src/api/courses.ts` (the Slides section from Task 3)

**Interfaces:**
- Consumes: `uploadImageToDrive`, `uploadStreamToDrive`, `makeDriveFilePublic`, `deleteDriveFile`, `ensureClubPmRootFolder`.
- Produces:
  ```ts
  export async function listSlides(sectionId: string);
  export async function addSlide(input: {
    sectionId: string; index: number; imageBase64: string;
    text?: string | null; width?: number | null; height?: number | null;
  });
  export async function updateSlideMeta(
    sectionId: string, rows: { id: string; notes?: string | null; startSec?: number | null }[]
  );
  export async function clearDeck(sectionId: string): Promise<void>;
  export async function setSlideConfig(sectionId: string, patch: Record<string, unknown>);
  export function clampSlideIndex(opts: {
    prevMaxIndex: number; index: number; slideCount: number
  }): number;
  ```
  Tasks 5 and 6 call these.

- [ ] **Step 1: Write the failing clamp test**

Create `backend/src/services/courseSlideService.test.ts`:

```ts
// Pure-logic tests for courseSlideService. No DB required.
// Run: cd backend && npx tsx src/services/courseSlideService.test.ts
import { clampSlideIndex, clampQuestionSlideIndex, isDeckComplete } from "./courseSlideService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

console.log("clampSlideIndex");
{
  eq("accepts a forward step", clampSlideIndex({ prevMaxIndex: 2, index: 3, slideCount: 10 }), 3);
  eq("accepts a jump forward — reading fast is not cheating",
    clampSlideIndex({ prevMaxIndex: 0, index: 7, slideCount: 10 }), 7);
  eq("never rolls back on a rewind", clampSlideIndex({ prevMaxIndex: 5, index: 1, slideCount: 10 }), 5);
  eq("clamps past the end of the deck",
    clampSlideIndex({ prevMaxIndex: 2, index: 99, slideCount: 10 }), 9);
  eq("a negative index is ignored", clampSlideIndex({ prevMaxIndex: 4, index: -3, slideCount: 10 }), 4);
  eq("an empty deck stays at 0", clampSlideIndex({ prevMaxIndex: 0, index: 5, slideCount: 0 }), 0);
}

console.log("clampQuestionSlideIndex");
{
  eq("in-range index is untouched", clampQuestionSlideIndex(3, 10), 3);
  eq("out-of-range clamps to the last slide — never dropped", clampQuestionSlideIndex(42, 10), 9);
  eq("null stays null", clampQuestionSlideIndex(null, 10), null);
}

console.log("isDeckComplete");
{
  const qs = [{ id: "q1", slideIndex: 2 }, { id: "q2", slideIndex: 5 }];
  check("false before the last slide", !isDeckComplete({
    maxSlideIndex: 4, slideCount: 8, questions: qs, answeredIds: ["q1", "q2"],
  }));
  check("false at the last slide with an unanswered question", !isDeckComplete({
    maxSlideIndex: 7, slideCount: 8, questions: qs, answeredIds: ["q1"],
  }));
  check("true at the last slide with everything answered", isDeckComplete({
    maxSlideIndex: 7, slideCount: 8, questions: qs, answeredIds: ["q1", "q2"],
  }));
  check("a deck with no questions completes on the last slide", isDeckComplete({
    maxSlideIndex: 3, slideCount: 4, questions: [], answeredIds: [],
  }));
  check("an empty deck never completes", !isDeckComplete({
    maxSlideIndex: 0, slideCount: 0, questions: [], answeredIds: [],
  }));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npx tsx src/services/courseSlideService.test.ts
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the service**

Create `backend/src/services/courseSlideService.ts`:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  uploadImageToDrive, uploadStreamToDrive, makeDriveFilePublic,
  deleteDriveFile, ensureClubPmRootFolder,
} from "./driveService.js";

// ── Pure helpers (unit-tested in courseSlideService.test.ts) ──

/**
 * The slide high-water mark. Monotonic and bounded by the deck, and nothing
 * else — deliberately simpler than clampVideoProgress. Video needs a wall-clock
 * budget because watch time can be fabricated; there is no slide analogue, and
 * a time rule here would only punish fast readers.
 */
export function clampSlideIndex(opts: {
  prevMaxIndex: number; index: number; slideCount: number;
}): number {
  const prev = Math.max(0, Math.floor(opts.prevMaxIndex));
  if (opts.slideCount <= 0) return prev;
  const next = Math.floor(opts.index);
  if (!Number.isFinite(next) || next <= prev) return prev;
  return Math.min(next, opts.slideCount - 1);
}

/**
 * Keep a question pointing at a real slide after a re-import shortened the deck.
 * Clamped, never dropped: silently deleting an author's questions is worse than
 * a stale pointer the workbench can flag.
 */
export function clampQuestionSlideIndex(slideIndex: number | null, slideCount: number): number | null {
  if (slideIndex == null) return null;
  if (slideCount <= 0) return 0;
  return Math.max(0, Math.min(slideIndex, slideCount - 1));
}

/** Last slide reached AND every overlay question answered. */
export function isDeckComplete(opts: {
  maxSlideIndex: number;
  slideCount: number;
  questions: { id: string; slideIndex: number | null }[];
  answeredIds: string[];
}): boolean {
  if (opts.slideCount <= 0) return false;
  if (opts.maxSlideIndex < opts.slideCount - 1) return false;
  const answered = new Set(opts.answeredIds);
  return opts.questions
    .filter((q) => q.slideIndex != null)
    .every((q) => answered.has(q.id));
}

// ── Persistence ──────────────────────────────────────────────

const slideSelect = {
  id: true, sectionId: true, index: true, imageUrl: true, imageFileId: true,
  text: true, notes: true, startSec: true, width: true, height: true,
} satisfies Prisma.CourseSlideSelect;

export async function listSlides(sectionId: string) {
  return prisma.courseSlide.findMany({
    where: { sectionId }, orderBy: { index: "asc" }, select: slideSelect,
  });
}

/** One rendered page → Drive → a row. Called once per page by the importer. */
export async function addSlide(input: {
  sectionId: string; index: number; imageBase64: string;
  text?: string | null; width?: number | null; height?: number | null;
}) {
  const uploaded = await uploadImageToDrive(
    input.imageBase64, "image/png", `slide-${input.sectionId}-${input.index}.png`
  );
  if (!uploaded) throw new Error("Could not store that slide image");
  return prisma.courseSlide.create({
    data: {
      sectionId: input.sectionId,
      index: input.index,
      imageUrl: uploaded.url,
      imageFileId: uploaded.fileId,
      text: input.text ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
    },
    select: slideSelect,
  });
}

/** Notes and start times only — a whole-set write that never touches images. */
export async function updateSlideMeta(
  sectionId: string,
  rows: { id: string; notes?: string | null; startSec?: number | null }[]
) {
  const known = new Set((await listSlides(sectionId)).map((s) => s.id));
  const writes = rows
    .filter((r) => known.has(r.id))
    .map((r) => prisma.courseSlide.update({
      where: { id: r.id },
      data: {
        ...(r.notes !== undefined ? { notes: r.notes } : {}),
        ...(r.startSec !== undefined ? { startSec: r.startSec } : {}),
      },
    }));
  if (writes.length) await prisma.$transaction(writes);
  return listSlides(sectionId);
}

/**
 * Drop the deck, or just the listed slides — rows AND their Drive files.
 *
 * The id-list form is what a re-import uses: the new pages are stored first,
 * then the OLD ids are deleted, so a failed import never destroys the deck it
 * was replacing.
 */
export async function clearDeck(sectionId: string, ids?: string[]): Promise<void> {
  const all = await listSlides(sectionId);
  const doomed = ids?.length ? all.filter((s) => ids.includes(s.id)) : all;
  if (!doomed.length) return;
  await prisma.courseSlide.deleteMany({ where: { id: { in: doomed.map((s) => s.id) } } });
  // Drive deletions are best-effort and deliberately not awaited as a batch —
  // a failed cleanup must not fail the import that triggered it.
  for (const s of doomed) void deleteDriveFile(s.imageFileId);
}

/**
 * Merge a patch into slideConfig. Spreading the previous value is mandatory:
 * the audio row and the source row both write this column and neither knows the
 * other's keys.
 */
export async function setSlideConfig(sectionId: string, patch: Record<string, unknown>) {
  const current = await prisma.courseSection.findUnique({
    where: { id: sectionId }, select: { slideConfig: true },
  });
  const merged = { ...((current?.slideConfig as Record<string, unknown>) ?? {}), ...patch };
  return prisma.courseSection.update({
    where: { id: sectionId },
    data: { slideConfig: merged as Prisma.InputJsonValue },
    select: { id: true, slideConfig: true },
  });
}

/** Narration upload. Made public so <audio src> works without a proxy route. */
export async function setAudio(
  sectionId: string, stream: NodeJS.ReadableStream, mimeType: string, filename: string
) {
  const folderId = await ensureClubPmRootFolder();
  if (!folderId) throw new Error("Google Drive is not connected");
  const uploaded = await uploadStreamToDrive(stream, mimeType, filename, folderId);
  if (!uploaded) throw new Error("Could not store that audio file");
  await makeDriveFilePublic(uploaded.fileId);
  return setSlideConfig(sectionId, {
    audioFileId: uploaded.fileId,
    audioUrl: `https://drive.google.com/uc?export=download&id=${uploaded.fileId}`,
  });
}

export async function clearAudio(sectionId: string) {
  const current = await prisma.courseSection.findUnique({
    where: { id: sectionId }, select: { slideConfig: true },
  });
  const cfg = (current?.slideConfig as Record<string, unknown>) ?? {};
  if (typeof cfg.audioFileId === "string") void deleteDriveFile(cfg.audioFileId);
  return setSlideConfig(sectionId, { audioFileId: null, audioUrl: null, audioDurationSec: null });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && npx tsx src/services/courseSlideService.test.ts
```

Expected: PASS, `0 failed`.

- [ ] **Step 5: Add the routes**

In `backend/src/api/courses.ts`, under the Slides banner, add a second multer instance and the five routes. Slide PNGs arrive as multipart **one per page** — never base64 JSON, which the 100 kb `express.json()` limit would reject.

```ts
const slideUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
});

coursesRouter.get("/sections/:sid/slides", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const slideService = await import("../services/courseSlideService.js");
    res.json(await slideService.listSlides(sid));
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/slides error:", error);
    res.status(500).json({ error: "Failed to list slides" });
  }
});

// One page per request. Fields: image (file), index, text, width, height.
coursesRouter.post(
  "/sections/:sid/slides",
  slideUpload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const sid = req.params.sid as string;
      if (!(await requireSectionAccess(req, res, sid))) return;
      if (!req.file) { res.status(400).json({ error: "image is required" }); return; }
      const index = Number.parseInt(String(req.body.index ?? ""), 10);
      if (!Number.isFinite(index) || index < 0) {
        res.status(400).json({ error: "index is required" });
        return;
      }
      const slideService = await import("../services/courseSlideService.js");
      const slide = await slideService.addSlide({
        sectionId: sid,
        index,
        imageBase64: req.file.buffer.toString("base64"),
        text: typeof req.body.text === "string" ? req.body.text.slice(0, 20000) : null,
        width: Number.parseInt(String(req.body.width ?? ""), 10) || null,
        height: Number.parseInt(String(req.body.height ?? ""), 10) || null,
      });
      res.status(201).json(slide);
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/slides error:", error);
      res.status(500).json({ error: "Failed to store that slide" });
    }
  }
);

coursesRouter.put("/sections/:sid/slides", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const { slides } = req.body as {
      slides?: { id: string; notes?: string | null; startSec?: number | null }[];
    };
    if (!Array.isArray(slides)) { res.status(400).json({ error: "slides must be an array" }); return; }
    const slideService = await import("../services/courseSlideService.js");
    res.json(await slideService.updateSlideMeta(sid, slides));
  } catch (error) {
    console.error("PUT /outreach/courses/sections/:sid/slides error:", error);
    res.status(500).json({ error: "Failed to save slide details" });
  }
});

// No body → clear the whole deck. { ids } → delete only those, which is how a
// re-import removes the OLD pages after the new ones are safely stored.
coursesRouter.delete("/sections/:sid/slides", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    const slideService = await import("../services/courseSlideService.js");
    await slideService.clearDeck(sid, Array.isArray(ids) ? ids : undefined);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/sections/:sid/slides error:", error);
    res.status(500).json({ error: "Failed to clear the deck" });
  }
});

coursesRouter.post(
  "/sections/:sid/audio",
  audioUpload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const sid = req.params.sid as string;
      if (!(await requireSectionAccess(req, res, sid))) return;
      if (!req.file) { res.status(400).json({ error: "audio is required" }); return; }
      const { Readable } = await import("node:stream");
      const slideService = await import("../services/courseSlideService.js");
      res.json(await slideService.setAudio(
        sid, Readable.from(req.file.buffer), req.file.mimetype,
        req.file.originalname || "narration.mp3"
      ));
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/audio error:", error);
      res.status(500).json({ error: "Failed to store that audio" });
    }
  }
);

coursesRouter.delete("/sections/:sid/audio", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const slideService = await import("../services/courseSlideService.js");
    res.json(await slideService.clearAudio(sid));
  } catch (error) {
    console.error("DELETE /outreach/courses/sections/:sid/audio error:", error);
    res.status(500).json({ error: "Failed to clear that audio" });
  }
});
```

Also extend the existing `POST /sections/:sid/questions` and `PUT /sections/:sid/questions` handlers to accept and persist `slideIndex` alongside `videoTimestampSec`, and add `slideIndex` to `UpsertQuestionInput` and the question `select` in `courseService.ts`.

- [ ] **Step 6: Verify and commit**

```bash
cd backend && npx tsc --noEmit && npx tsx src/services/courseSlideService.test.ts
```

```bash
git add backend/src/services/courseSlideService.ts backend/src/services/courseSlideService.test.ts backend/src/services/courseService.ts backend/src/api/courses.ts
git commit -m "feat(courses): slide + narration storage, per-page upload routes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Slide progress, completion, and the learner payload

**Files:**
- Modify: `backend/src/services/courseProgressService.ts` (`LearnerSection`, `getLearnerCourse`, `completeSection`)
- Modify: `backend/src/api/courses.ts` (one new route)

**Interfaces:**
- Consumes: `clampSlideIndex`, `isDeckComplete`, `listSlides` (Task 4).
- Produces: `recordSlideProgress(sectionId, memberId, index)`; `LearnerSection.slides` and `.slideConfig`; `POST /sections/:sid/slide-progress`.

- [ ] **Step 1: Add the fields to LearnerSection**

In `courseProgressService.ts`, add to the `LearnerSection` interface:

```ts
  maxSlideIndex: number;
  // Present ONLY when unlocked, exactly like contentJson / videoConfig.
  slides?: unknown;
  slideConfig?: unknown;
```

- [ ] **Step 2: Attach slides in getLearnerCourse**

Inside `getLearnerCourse`, load the decks for SLIDES sections once, before the `learnerSections` map:

```ts
  // One query for every SLIDES section in the course rather than one per
  // section — this runs on every learner page load.
  const slideRows = sections.some((s) => s.kind === "SLIDES")
    ? await prisma.courseSlide.findMany({
        where: { sectionId: { in: sections.filter((s) => s.kind === "SLIDES").map((s) => s.id) } },
        orderBy: { index: "asc" },
      })
    : [];
  const slidesBySection = new Map<string, typeof slideRows>();
  for (const row of slideRows) {
    const list = slidesBySection.get(row.sectionId) ?? [];
    list.push(row);
    slidesBySection.set(row.sectionId, list);
  }
```

Add `maxSlideIndex: progress?.maxSlideIndex ?? 0,` to the `out` object, and extend the existing `if (unlocked)` block:

```ts
    if (unlocked) {
      out.contentJson = s.contentJson;
      out.videoConfig = s.videoConfig ?? null;
      if (s.kind === "SLIDES") {
        // imageFileId is an internal Drive handle with no learner use — strip it
        // rather than hand every learner a delete target.
        out.slides = (slidesBySection.get(s.id) ?? []).map((sl) => ({
          id: sl.id, index: sl.index, imageUrl: sl.imageUrl, text: sl.text,
          notes: sl.notes, startSec: sl.startSec, width: sl.width, height: sl.height,
        }));
        out.slideConfig = s.slideConfig ?? null;
      }
    }
```

- [ ] **Step 3: Add recordSlideProgress**

Add beside `recordVideoProgress`:

```ts
/**
 * Persist a slide high-water mark. Mirrors recordVideoProgress but with the
 * simpler clamp — monotonic and in-range, no wall-clock budget.
 */
export async function recordSlideProgress(
  sectionId: string, memberId: string, index: number
) {
  if (!(await isSectionUnlockedForMember(sectionId, memberId))) return null;
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId }, select: { courseId: true },
  });
  if (!section) return null;
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_memberId: { courseId: section.courseId, memberId } },
    select: { id: true },
  });
  if (!enrollment) return null;

  const progress = await prisma.courseSectionProgress.findUnique({
    where: { enrollmentId_sectionId: { enrollmentId: enrollment.id, sectionId } },
  });
  const slideCount = await prisma.courseSlide.count({ where: { sectionId } });
  const { clampSlideIndex } = await import("./courseSlideService.js");
  const next = clampSlideIndex({
    prevMaxIndex: progress?.maxSlideIndex ?? 0, index, slideCount,
  });

  await prisma.courseSectionProgress.update({
    where: { enrollmentId_sectionId: { enrollmentId: enrollment.id, sectionId } },
    data: {
      maxSlideIndex: next,
      status: progress?.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
    },
  });
  return { maxSlideIndex: next };
}
```

- [ ] **Step 4: Gate completion**

In `completeSection`, alongside the existing VIDEO guard, refuse a premature SLIDES completion:

```ts
  if (section.kind === "SLIDES") {
    const { isDeckComplete } = await import("./courseSlideService.js");
    const [slideCount, questions] = await Promise.all([
      prisma.courseSlide.count({ where: { sectionId } }),
      prisma.courseQuestion.findMany({
        where: { sectionId, slideIndex: { not: null } },
        select: { id: true, slideIndex: true },
      }),
    ]);
    const ok = isDeckComplete({
      maxSlideIndex: progress?.maxSlideIndex ?? 0,
      slideCount,
      questions,
      answeredIds: progress?.answeredPopupIds ?? [],
    });
    if (!ok) {
      // Server-side, because the client's "Complete" button is not the gate.
      return { error: "Finish the deck and answer every question first" };
    }
  }
```

Match the surrounding code's actual error convention — read how the VIDEO guard reports refusal and mirror it exactly rather than inventing a second shape.

- [ ] **Step 5: Add the route**

```ts
coursesRouter.post("/sections/:sid/slide-progress", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    const index = Number.parseInt(String((req.body as { index?: unknown }).index ?? ""), 10);
    if (!Number.isFinite(index)) { res.status(400).json({ error: "index is required" }); return; }
    const result = await progressService.recordSlideProgress(sid, req.memberId!, index);
    if (!result) { res.status(403).json({ error: "Not available" }); return; }
    res.json(result);
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/slide-progress error:", error);
    res.status(500).json({ error: "Failed to record progress" });
  }
});
```

- [ ] **Step 6: Verify and commit**

```bash
cd backend && npx prisma generate && npx tsc --noEmit && npx tsx src/services/courseSlideService.test.ts
```

```bash
git add backend/src/services/courseProgressService.ts backend/src/api/courses.ts
git commit -m "feat(courses): slide progress, completion gate, learner payload

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 3 — The authoring workbench

## Task 6: The import module

**Files:**
- Create: `src/components/clubpm/courses/deckImport.js`
- Modify: `package.json` (add `pdfjs-dist`)

**Interfaces:**
- Consumes: `POST …/deck/source` (Task 3), `POST …/slides` (Task 4).
- Produces:
  ```js
  export async function importDeck({ sectionId, file, url, onProgress, signal })
  // → { slides: [], sourceKind: 'PDF'|'PPTX'|'GSLIDES', sourceName: string }
  ```
  Task 7 calls this.

- [ ] **Step 1: Add the dependency**

```bash
cd "c:/Users/Henry/Documents/Antigravity/purduesearch.github.io" && npm install pdfjs-dist@^4
```

- [ ] **Step 2: Write the importer**

Create `src/components/clubpm/courses/deckImport.js`:

```js
// Deck import: PDF in, CourseSlide rows out.
//
// The server normalizes .pptx and Google Slides links to a PDF; everything from
// there is this one path. Rendering here rather than on the backend avoids a
// native rasterizer dependency and yields each page's text in the same pass.
//
// pdfjs-dist is imported lazily so its ~1 MB never lands in a public-page bundle
// — this module is only reachable from /clubpm/*.

const RENDER_SCALE = 2; // ~1600px wide for a 4:3 deck; sharp on a retina stage

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  // The worker ships with the package; pointing at the bundled copy keeps this
  // self-contained (a CDN URL would break the CSP and offline dev).
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url').catch(() => null);
  if (worker?.default) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Ask the server to turn whatever the author gave us into a PDF. */
async function fetchSourcePdf({ sectionId, file, url, signal }) {
  const base = process.env.REACT_APP_API_URL || '';
  const token = localStorage.getItem('clubpm_auth_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const endpoint = `${base}/api/outreach/courses/sections/${sectionId}/deck/source`;

  let res;
  if (file) {
    const body = new FormData();
    body.append('deck', file);
    res = await fetch(endpoint, { method: 'POST', credentials: 'include', headers, body, signal });
  } else {
    res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    });
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || 'Could not load that deck');
  }
  return res.arrayBuffer();
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function uploadPage({ sectionId, index, blob, text, width, height, signal }) {
  const base = process.env.REACT_APP_API_URL || '';
  const token = localStorage.getItem('clubpm_auth_token');
  const body = new FormData();
  body.append('image', blob, `slide-${index}.png`);
  body.append('index', String(index));
  body.append('text', text ?? '');
  body.append('width', String(width));
  body.append('height', String(height));
  const res = await fetch(
    `${base}/api/outreach/courses/sections/${sectionId}/slides`,
    {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
      signal,
    }
  );
  if (!res.ok) throw new Error(`Slide ${index + 1} failed to upload`);
  return res.json();
}

/**
 * Import a deck end to end.
 *
 * The caller passes EITHER `file` (.pdf or .pptx) or `url` (Google Slides).
 * `onProgress({ done, total, label })` fires per page. `signal` aborts.
 *
 * The existing deck is NOT cleared here — the caller clears it only after this
 * resolves, so a failed or cancelled import leaves the previous deck intact.
 */
export async function importDeck({ sectionId, file, url, onProgress, signal }) {
  const sourceKind = url ? 'GSLIDES'
    : file?.type === 'application/pdf' ? 'PDF'
    : 'PPTX';
  const sourceName = file?.name || url || 'Deck';

  onProgress?.({ done: 0, total: 0, label: 'Converting…' });
  const buffer = await fetchSourcePdf({ sectionId, file, url, signal });

  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const total = doc.numPages;

  const slides = [];
  for (let pageNum = 1; pageNum <= total; pageNum += 1) {
    if (signal?.aborted) throw new Error('Import cancelled');
    onProgress?.({ done: pageNum - 1, total, label: `Rendering slide ${pageNum} of ${total}` });

    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const content = await page.getTextContent();
    const text = content.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();

    const blob = await canvasToBlob(canvas);
    // Free the bitmap immediately — a 60-slide deck at scale 2 will otherwise
    // hold ~60 full-size canvases alive until GC catches up.
    canvas.width = 0;
    canvas.height = 0;

    slides.push(await uploadPage({
      sectionId, index: pageNum - 1, blob, text,
      width: Math.round(viewport.width), height: Math.round(viewport.height), signal,
    }));
    onProgress?.({ done: pageNum, total, label: `Uploaded slide ${pageNum} of ${total}` });
  }

  return { slides, sourceKind, sourceName };
}
```

- [ ] **Step 3: Verify the build**

```bash
cd "c:/Users/Henry/Documents/Antigravity/purduesearch.github.io" && npm run build
```

Expected: PASS. If the `?url` worker import fails to resolve under react-scripts, fall back to `pdfjs.GlobalWorkerOptions.workerSrc = ''` plus `import 'pdfjs-dist/build/pdf.worker.min.mjs'` — but confirm rendering still works in Task 7's walkthrough before settling for it.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/clubpm/courses/deckImport.js
git commit -m "feat(courses): browser-side deck import via pdfjs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The slides workbench

**Files:**
- Create: `src/components/clubpm/courses/CourseSlidesWorkbench.jsx`
- Modify: `src/api/clubPmClient.js`, `src/components/clubpm/courses/CourseSectionRail.jsx` (`SECTION_KINDS`), `src/pages/ClubPM/CourseEditorPage.jsx`

**Interfaces:**
- Consumes: `importDeck` (Task 6); the routes from Tasks 3–4.
- Produces: `CourseSlidesWorkbench` with props `{ section, canEdit, onUpdateSection }`, matching `CourseVideoWorkbench`'s contract exactly.

- [ ] **Step 1: Add the client wrappers**

In `src/api/clubPmClient.js`, beside the other course helpers:

```js
export const getSlideCapabilities = ()            => get('/api/outreach/courses/slide-capabilities');
export const listCourseSlides   = (sectionId)     => get(`/api/outreach/courses/sections/${sectionId}/slides`);
export const saveCourseSlideMeta = (sectionId, slides) =>
  put(`/api/outreach/courses/sections/${sectionId}/slides`, { slides });
// No ids → clear the whole deck. With ids → delete only those (how a re-import
// removes the old pages once the new ones are stored). `del` must forward a
// body; if the helper in this file does not, use the fetch wrapper it is built
// on rather than adding a second delete helper.
export const clearCourseDeck    = (sectionId, ids) =>
  del(`/api/outreach/courses/sections/${sectionId}/slides`, ids ? { ids } : undefined);
export const clearCourseAudio   = (sectionId)     => del(`/api/outreach/courses/sections/${sectionId}/audio`);
export const recordCourseSlideProgress = (sectionId, index) =>
  post(`/api/outreach/courses/sections/${sectionId}/slide-progress`, { index });
```

Audio upload is multipart, so it needs an XHR wrapper rather than the JSON helpers. Copy `uploadVaultFile`'s shape:

```js
/** Multipart narration upload with progress. Mirrors uploadVaultFile. */
export function uploadCourseAudio(sectionId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('audio', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/outreach/courses/sections/${sectionId}/audio`);
    xhr.withCredentials = true;
    const token = localStorage.getItem('clubpm_auth_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve(JSON.parse(xhr.responseText || '{}'))
      : reject(new Error('Audio upload failed')));
    xhr.onerror = () => reject(new Error('Audio upload failed'));
    xhr.send(form);
  });
}
```

Use whatever the file already calls its base-URL constant — read the top of `clubPmClient.js` and match it rather than introducing `API_BASE` if that name is not already there.

- [ ] **Step 2: Register the kind**

In `CourseSectionRail.jsx`, add to `SECTION_KINDS`:

```js
  SLIDES:  { label: 'Slides',  icon: 'fas fa-file-powerpoint' },
```

This one edit makes the kind appear in the add menu, the rail badge, and the learner rail, because all three read this map.

- [ ] **Step 3: Write the workbench**

Create `src/components/clubpm/courses/CourseSlidesWorkbench.jsx` with these regions, top to bottom, matching `CourseVideoWorkbench`'s structure:

1. **Source row** — three tabs. `Upload PDF` and `Upload PowerPoint` are file inputs; `Google Slides link` is a URL field, disabled with `title={`Ask an admin to reconnect Google Drive — ${botEmail} needs read access`}` when `getSlideCapabilities()` returns `canImportLink: false`. A deck already present shows its `sourceName`, slide count, and a "Replace deck" button behind a confirm.
2. **Import progress** — a `cpm-progress-bar` driven by `onProgress`, plus Cancel wired to an `AbortController`. On success, call `clearCourseDeck` for the *previous* deck **before** setting the new slides in state, then `onUpdateSection(section.id, { slideConfig: { ...section.slideConfig, sourceKind, sourceName } })`.
3. **Slide grid** — thumbnails from `imageUrl`, click to select. The selected slide gets a notes `<textarea>` and a `startSec` number input; both commit on blur through a debounced `saveCourseSlideMeta` whole-set write.
4. **Narration** — file input → `uploadCourseAudio` with a progress bar; an `<audio>` element; a **"Slide starts here"** button (also bound to `Space` while the panel has focus) that writes `audioRef.current.currentTime` into the selected slide's `startSec` and advances the selection to the next slide. Persist `audioDurationSec` from the audio element's `loadedmetadata` event via `onUpdateSection`.
5. **Overlay questions** — reuse `QuestionForm` and the existing per-question `saveCourseQuestion`, with an "Add question on this slide" button seeding `slideIndex` from the selected slide. Flag any question whose `slideIndex >= slides.length` with a warning row.

Two rules the implementation must not get wrong.

**Replacement order.** The previous deck is removed only *after* the new one is fully stored, so a
cancelled or failed import leaves the author's existing deck intact. Capture the old ids first and
delete exactly those — never `clearCourseDeck`, which is section-scoped and would take the new pages
with it:

```jsx
// Old rows are deleted by id AFTER the import succeeds. A section-wide clear
// would delete the pages this import just stored.
const previousIds = slides.map((s) => s.id);
const result = await importDeck({ sectionId: section.id, file, url, onProgress, signal });
if (previousIds.length) await clearCourseDeck(section.id, previousIds);
setSlides(result.slides);
onUpdateSection(section.id, {
  slideConfig: { ...(section.slideConfig ?? {}), sourceKind: result.sourceKind, sourceName: result.sourceName },
});
```

The new pages are written at indices `0…N-1` while the old ones still occupy `0…M-1`, so for the
duration of the import the section holds two overlapping decks. That window is seconds long, on a
course the author is actively editing, and it closes the moment the delete lands — but a learner who
loaded the section mid-import would see an interleaved deck. Accepted deliberately: the alternative
is a staging column and a commit endpoint, which is a lot of schema for a race nobody will hit on a
draft course.

This needs `DELETE /sections/:sid/slides` to take an **optional** id list. Update the route from Task
4 Step 5 so an empty/absent body clears the whole deck and `{ ids: [...] }` deletes only those, and
update `clearDeck` in `courseSlideService.ts` to match:

```ts
/** Drop the deck, or just the listed slides. Removes Drive files either way. */
export async function clearDeck(sectionId: string, ids?: string[]): Promise<void> {
  const all = await listSlides(sectionId);
  const doomed = ids?.length ? all.filter((s) => ids.includes(s.id)) : all;
  if (!doomed.length) return;
  await prisma.courseSlide.deleteMany({ where: { id: { in: doomed.map((s) => s.id) } } });
  for (const s of doomed) void deleteDriveFile(s.imageFileId);
}
```

and the client wrapper becomes `clearCourseDeck(sectionId, ids)` posting `{ ids }`.

**`slideConfig` is one shared column.** The source row and the audio row both write it and neither
knows the other's keys, so every write spreads the current value:

```jsx
onUpdateSection(section.id, {
  slideConfig: { ...(section.slideConfig ?? {}), audioDurationSec: Math.round(duration) },
});
```

- [ ] **Step 4: Wire it into the editor**

In `CourseEditorPage.jsx`, import the workbench and add the branch beside `sectionKind === 'VIDEO'`:

```jsx
              {sectionKind === 'SLIDES' && (
                <CourseSlidesWorkbench
                  key={selectedSection.id}
                  section={selectedSection}
                  canEdit={canEditDoc}
                  onUpdateSection={handleUpdateSection}
                />
              )}
```

`hasDocument` already covers SLIDES (it excludes only `QUIZ`), so the prose body and AI panel come along automatically — which is what spec 3's generated slide outlines land in. Collapse the prose the same way VIDEO does by extending the `collapsible` test:

```jsx
                <CourseDocument collapsible={sectionKind === 'VIDEO' || sectionKind === 'SLIDES'}>
```

and update `CourseDocument`'s summary text to read "Notes shown under the deck" when the kind is SLIDES — pass the label in as a prop rather than branching inside it.

- [ ] **Step 5: Verify the build and walk it through**

```bash
cd "c:/Users/Henry/Documents/Antigravity/purduesearch.github.io" && npm run build
```

Then with `npm start` + `cd backend && npm run dev`:
1. Add a SLIDES section; confirm the empty state.
2. Import a 10-page PDF; watch the progress bar reach 10/10; confirm ten thumbnails.
3. Import a `.pptx`; confirm the page count matches the deck.
4. Confirm the link tab is disabled before the bot account is reconnected. Reconnect it, paste a Slides URL not shared with the bot, confirm the error names the bot email, share it, confirm success.
5. Type notes on slide 3, reload, confirm they persisted.
6. Upload narration, sync four slides by tapping, reload, confirm the times.
7. Re-import a shorter deck; confirm the old thumbnails are gone and an out-of-range question is flagged.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/courses/CourseSlidesWorkbench.jsx src/api/clubPmClient.js src/components/clubpm/courses/CourseSectionRail.jsx src/pages/ClubPM/CourseEditorPage.jsx backend/src/api/courses.ts
git commit -m "feat(courses): slides authoring workbench with import and audio sync

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 4 — The learner player

## Task 8: CourseSlidePlayer

**Files:**
- Create: `src/components/clubpm/courses/CourseSlidePlayer.jsx`
- Modify: `src/pages/ClubPM/CoursePlayerPage.jsx`

**Interfaces:**
- Consumes: `LearnerSection.slides` / `.slideConfig` / `.maxSlideIndex` (Task 5); `recordCourseSlideProgress`, `answerCoursePopup`, `listCourseQuestions` (existing + Task 7).
- Produces: `CourseSlidePlayer` with props `{ sectionId, slides, slideConfig, initialMaxSlideIndex, questions, answeredPopupIds, preview, onComplete }` — deliberately parallel to `LockedVideoPlayer`.

- [ ] **Step 1: Write the player**

Create `src/components/clubpm/courses/CourseSlidePlayer.jsx`. Structure it as:

```jsx
// The learner's deck. Structurally parallel to LockedVideoPlayer: a stage, a
// progress ping, and question overlays that block forward movement — but with
// slide indices where that component has timestamps.
//
// There is no seek lock. A deck has no watch time to fabricate, so the server's
// clamp is monotonic-and-in-range and nothing here needs to police scrubbing.
```

Required behavior:

- **Stage** — `<img src={slides[index].imageUrl}>` sized from `width`/`height` so the box does not jump while loading; prev/next buttons; `n / total`; `ArrowLeft` / `ArrowRight` bound while the stage has focus; the current slide's `notes` beneath it; `text` in a visually-hidden element so screen readers and in-page search reach the slide's words.
- **Preload** — set `<link rel="prefetch">` or construct an `Image()` for `index + 1` when the index changes. A deck whose next slide loads on click feels broken.
- **Audio** — when `slideConfig.audioUrl` exists, an `<audio controls>` plus an auto-advance toggle (default on). On `timeupdate`, pick the last slide whose `startSec != null && startSec <= currentTime`; only call `setIndex` when it differs, or the render loops. Slides with a null `startSec` are never auto-selected, so a partially-synced deck degrades to manual paging rather than jumping.
- **Questions** — on entering slide `i`, if a question has `slideIndex === i` and its id is not in `answeredPopupIds`, render it over the stage and disable next. Answer posts through `answerCoursePopup(sectionId, questionId, answerIds)` — unchanged from the video path — and on success adds the id to local answered state. Pause the audio while a question is open and resume after.
- **Progress** — `recordCourseSlideProgress(sectionId, index)` on each new maximum index, skipped entirely when `preview` is true (there is no enrollment to write against).
- **Completion** — when the last slide is reached and no unanswered questions remain, call `onComplete()` once, guarded by a ref so a re-render cannot fire it twice.

The two subtle pieces, written out because both fail in ways that look like something else:

```jsx
// Audio-driven advance. Only setIndex when the target CHANGES — assigning the
// same index on every timeupdate re-renders ~4x a second and makes manual paging
// impossible, because each tick snaps the learner back.
const onTimeUpdate = useCallback(() => {
  if (!autoAdvance || !audioRef.current) return;
  const t = audioRef.current.currentTime;
  let target = -1;
  for (let i = 0; i < slides.length; i += 1) {
    const start = slides[i].startSec;
    // Unsynced slides are never auto-selected, so a partially-synced deck
    // degrades to manual paging rather than jumping to slide 0.
    if (start != null && start <= t) target = i;
  }
  if (target >= 0 && target !== indexRef.current) setIndex(target);
}, [autoAdvance, slides]);
```

```jsx
// Fire completion exactly once. Without the ref this re-fires on every render
// after the last slide, and each call is a POST that grants XP-adjacent side
// effects server-side.
const completedRef = useRef(false);
useEffect(() => {
  if (preview || completedRef.current || !slides.length) return;
  const atEnd = maxIndex >= slides.length - 1;
  const allAnswered = questions
    .filter((q) => q.slideIndex != null)
    .every((q) => answered.includes(q.id));
  if (atEnd && allAnswered) {
    completedRef.current = true;
    onComplete?.();
  }
}, [maxIndex, slides.length, questions, answered, preview, onComplete]);
```

- [ ] **Step 2: Wire it into the player page**

In `CoursePlayerPage.jsx`:

Extend the popup-loading effect so it also runs for SLIDES:

```jsx
    if (!selected || selected.locked) { setPopups([]); return undefined; }
    if (selected.kind !== 'VIDEO' && selected.kind !== 'SLIDES') { setPopups([]); return undefined; }
    // …then filter on the field that matters for this kind:
        setPopups((Array.isArray(rows) ? rows : []).filter((q) => (
          selected.kind === 'VIDEO' ? q.videoTimestampSec != null : q.slideIndex != null
        )));
```

Add the render branch beside the VIDEO one:

```jsx
              {selected.kind === 'SLIDES' && (
                <CourseSlidePlayer
                  key={selected.id}
                  sectionId={selected.id}
                  slides={selected.slides ?? []}
                  slideConfig={selected.slideConfig}
                  initialMaxSlideIndex={selected.maxSlideIndex ?? 0}
                  questions={popups}
                  answeredPopupIds={selected.answeredPopupIds}
                  preview={course.preview}
                  onComplete={() => handleComplete(selected.id)}
                />
              )}
```

The existing `selected.kind !== 'QUIZ' && selected.contentJson` block already renders the prose beneath the deck — no change needed. Add SLIDES to the completed-badge condition beside VIDEO.

- [ ] **Step 3: Verify and walk through**

```bash
npm run build
```

As a learner:
1. Page through a deck manually; confirm the counter, notes, and that the section will not complete early.
2. With narration, confirm slides advance on their recorded times and that toggling auto-advance off stops it.
3. Confirm a question on slide 3 blocks advancing until answered, and that the audio pauses while it is open.
4. Reach the last slide with everything answered; confirm the section completes and the rail advances.
5. Open devtools on a course with a **locked** SLIDES section and confirm the payload has no `slides` and no `slideConfig` for it.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubpm/courses/CourseSlidePlayer.jsx src/pages/ClubPM/CoursePlayerPage.jsx
git commit -m "feat(courses): learner slide player with audio sync and overlays

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Styling

**Files:**
- Modify: `public/clubpm-theme.css` (append)

- [ ] **Step 1: Append the styles**

Grep an existing `pm-course-video-*` block first and match its tokens and idiom. New blocks needed:

- `pm-course-slides-source` — the three-tab source row, with a disabled state for the link tab
- `pm-course-slides-progress` — import progress
- `pm-course-slide-grid` / `pm-course-slide-thumb` — a responsive `grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))` with a selected outline in `--pm-accent-teal`
- `pm-course-slide-stage` — the learner stage; the image is `max-width: 100%; height: auto` and the wrapper holds an `aspect-ratio` derived inline from the slide's `width`/`height`
- `pm-course-slide-overlay` — the question overlay, absolutely positioned over the stage, which therefore needs `position: relative`
- `pm-course-slide-notes`, `pm-course-slide-sync`

Every rule goes in `clubpm-theme.css` — a SLIDES section never renders outside `/clubpm/*`.

- [ ] **Step 2: Final verification gate**

```bash
cd backend && npx prisma generate && npx tsc --noEmit && npx tsx src/services/courseSlideService.test.ts
cd .. && npm run build
```

Then re-run the full manual list in the spec's Verification section — all nine items.

- [ ] **Step 3: Commit**

```bash
git add public/clubpm-theme.css
git commit -m "style(courses): slides workbench, grid and learner stage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
