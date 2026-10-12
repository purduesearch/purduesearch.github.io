// Run the skills pipeline by hand.
//   npm run skills:run                                  # same as the Sunday cron (incremental)
//   npm run skills:run -- --dry-run                     # collect + estimate tokens/cost, no model calls or writes
//   npm run skills:run -- --member <id> [--member <id>] # scoped check; never moves the global watermarks
//   npm run skills:run -- --since 2026-01-01 [--until 2026-06-01] [--chunk-days 14]
//                                                       # backfill in chunks; never moves the watermarks
//   npm run skills:run -- --embed-missing               # embed evidence written while embeddings were down
//   npm run skills:run -- --recompute                   # rebuild every AI assessment from stored evidence (no model calls)
// Safe to re-run: artifacts already analysed under the current prompt version are skipped.
import "dotenv/config";
import { prisma } from "../src/db/prisma.js";
import { recomputeAll } from "../src/services/skillAssessmentService.js";
import { chunkWindows } from "../src/services/skillPipelineCore.js";
import { embedMissingEvidence } from "../src/services/skillSearchService.js";
import { runWeeklySkillRun, type PipelineSummary } from "../src/services/skillPipelineService.js";

function values(args: string[], flag: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => { if (a === flag) { const v = args[i + 1]; if (!v || v.startsWith("--")) throw new Error(`${flag} needs a value`); out.push(v); } });
  return out;
}
function date(v: string | undefined, flag: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`${flag}: not a date: ${v}`);
  return d;
}
const line = (s: PipelineSummary) =>
  `${s.status}${s.reason ? ` (${s.reason})` : ""} run=${s.runId ?? "-"} counts=${JSON.stringify(s.counts)} tokens=${s.tokensIn}/${s.tokensOut} embed=${s.embedTokens} est=$${s.estCostUsd.toFixed(4)} errors=${s.errors.length}`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--recompute")) {
    console.log("Recomputed:", JSON.stringify(await recomputeAll()));
    return;
  }
  if (args.includes("--embed-missing")) {
    console.log("Embedded:", JSON.stringify(await embedMissingEvidence({ limit: 5000 })));
    return;
  }
  const dryRun = args.includes("--dry-run");
  const memberIds = values(args, "--member");
  const since = date(values(args, "--since")[0], "--since");
  const until = date(values(args, "--until")[0], "--until");
  const chunkDays = Number(values(args, "--chunk-days")[0] ?? 14);
  if (!(chunkDays >= 1)) throw new Error("--chunk-days must be at least 1");

  if (since) {
    const windows = chunkWindows(since, until ?? new Date(), chunkDays);
    console.log(`Backfill: ${windows.length} window(s) of up to ${chunkDays} day(s)`);
    for (const w of windows) {
      const s = await runWeeklySkillRun({ trigger: "BACKFILL", since: w.since, until: w.until, memberIds: memberIds.length ? memberIds : undefined, dryRun });
      console.log(`${w.since.toISOString().slice(0, 10)}..${w.until.toISOString().slice(0, 10)} ${line(s)}`);
      for (const e of s.errors.slice(0, 5)) console.log(`  ! ${e.stage}: ${e.message}`);
      if (s.status === "SKIPPED") { process.exitCode = 2; break; }
    }
    return;
  }
  const s = await runWeeklySkillRun({ trigger: memberIds.length ? "MANUAL" : "CRON", memberIds: memberIds.length ? memberIds : undefined, until, dryRun });
  console.log(line(s));
  for (const e of s.errors.slice(0, 10)) console.log(`  ! ${e.stage}: ${e.message}`);
  if (s.status === "FAILED") process.exitCode = 1;
  if (s.status === "SKIPPED") process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
