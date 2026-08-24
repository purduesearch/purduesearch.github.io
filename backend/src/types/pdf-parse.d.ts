/**
 * `pdf-parse` ships no types, and the only path we may import is the deep one:
 * the package root runs a bundled debug harness that reads a test PDF off disk
 * and throws in production. `@types/pdf-parse` declares the root module only,
 * so it would not cover this specifier even if it were installed.
 *
 * Declared narrowly — `text` is the one field documentTextService reads.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
