/**
 * Turn an uploaded document into plain text for AI grading.
 *
 * One responsibility, no DB access. Every failure is a typed result rather than
 * a throw, because the caller has to turn each one into a message a learner can
 * act on — "we couldn't read that" is useless when the real answer is "your PDF
 * is a scan".
 */

/** Anything longer is clamped before it reaches a prompt. */
export const MAX_EXTRACTED_CHARS = 60_000;

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "UNSUPPORTED" | "EMPTY" | "FAILED"; message: string };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/**
 * Browsers are unreliable about MIME types for .md and .txt — Chrome sends
 * application/octet-stream for .md on some platforms. Trust the extension when
 * the MIME type is generic, or real submissions get rejected as unsupported.
 */
function kindOf(mimeType: string, fileName: string): "pdf" | "docx" | "text" | null {
  const ext = extensionOf(fileName);
  if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
  if (mimeType === DOCX_MIME || ext === ".docx") return "docx";
  if (mimeType.startsWith("text/") || ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return "text";
  }
  return null;
}

function clamp(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXTRACTED_CHARS ? trimmed.slice(0, MAX_EXTRACTED_CHARS) : trimmed;
}

/**
 * The message for a file that parsed but yielded nothing. Names the likely cause
 * and both ways out, because under a score gate this is otherwise a learner
 * blocked by a file format they cannot diagnose.
 */
const EMPTY_MESSAGE =
  "We could not read any text from that file. If it is a scan or a photo of a " +
  "page, the text is an image — export a text-based PDF, or paste your answer instead.";

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractResult> {
  const kind = kindOf(mimeType ?? "", fileName ?? "");
  if (!kind) {
    return {
      ok: false,
      reason: "UNSUPPORTED",
      message:
        `We cannot read "${fileName}". Submit a PDF, a Word .docx, or a plain-text ` +
        `.txt / .md file — or paste your answer instead. (Legacy .doc files are not ` +
        `supported: open it in Word and "Save As" .docx or PDF.)`,
    };
  }

  let raw = "";
  try {
    if (kind === "text") {
      raw = buffer.toString("utf8");
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      raw = (await mammoth.extractRawText({ buffer })).value ?? "";
    } else {
      // MUST be the deep path. Importing the package root runs a bundled debug
      // harness that reads a test PDF off disk and throws in production.
      const mod = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
      raw = (await pdfParse(buffer)).text ?? "";
    }
  } catch (err) {
    console.error(`[documentText] ${kind} parse failed for "${fileName}":`, err);
    return {
      ok: false,
      reason: "FAILED",
      message:
        "That file could not be opened — it may be password-protected or corrupt. " +
        "Try re-exporting it, or paste your answer instead.",
    };
  }

  const text = clamp(raw);
  if (!text) return { ok: false, reason: "EMPTY", message: EMPTY_MESSAGE };
  return { ok: true, text };
}
