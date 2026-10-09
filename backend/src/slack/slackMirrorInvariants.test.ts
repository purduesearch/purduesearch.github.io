// Run: cd backend && npx tsx src/slack/slackMirrorInvariants.test.ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(file, "utf8");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}
function source(text: string) { return ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS); }
function withoutCanUnlink(text: string): string {
  const parsed = source(text);
  // Only this named, top-level permission helper is exempt. Do not drop neighboring access checks.
  const helper = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "canUnlink");
  return helper ? text.slice(0, helper.getStart(parsed)) + text.slice(helper.end) : text;
}
const forbiddenWrite = /\bprisma\s*\.\s*(?:task\s*\.\s*(?:update|create)(?:Many)?|vaultItem\s*\.\s*update(?:Many)?)\b|\bqueueDm\s*\(/;

// Empty today: all mirror handlers open loading views. A future instant modal needs a named entry here.
const instantModals = new Set<string>();
function loadingViolations(text: string, file: string): number[] {
  const parsed = source(text);
  const violations: number[] = [];
  const lines = text.split(/\r?\n/);
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "open" && ts.isPropertyAccessExpression(node.expression.expression)
      && node.expression.expression.name.text === "views") {
      const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line;
      let owner: ts.Node | undefined = node.parent;
      while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
      const name = owner && ts.isFunctionDeclaration(owner) ? owner.name?.text ?? "anonymous" : "anonymous";
      if (!instantModals.has(`${file}:${name}`) && !/\bloadingView\s*\(/.test(lines.slice(line, line + 6).join("\n"))) violations.push(line + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return violations;
}

let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`); }

check("source guards recognize spaced writes and only exclude the unlink helper", () => {
  for (const text of ["prisma.task.update({})", "prisma . task . create ({})", "prisma.vaultItem.updateMany({})", "queueDm ('user', 'ping')"]) {
    // updateMany is a write too, even though the plan spells its prefix as update.
    assert.ok(forbiddenWrite.test(text), text);
  }
  assert.doesNotMatch("prisma.task.findUnique({})", forbiddenWrite);
  assert.doesNotMatch(withoutCanUnlink("async function canUnlink() { const isAdmin = true; return isAdmin; }"), /isAdmin/);
  assert.match(withoutCanUnlink("function canUnlink() { return isAdmin; } function listBacklinks() { return isAdmin; }"), /isAdmin/);
});
check("handlers and builders delegate protected writes and DM routing", () => {
  for (const file of [...files(join(root, "handlers")), ...files(join(root, "views"))]) {
    if (!file.endsWith(".test.ts")) assert.doesNotMatch(read(file), forbiddenWrite, relative(root, file));
  }
});
check("mentions and backlink reads have no admin bypass", () => {
  assert.doesNotMatch(read(join(root, "handlers/mentions.ts")), /\bisAdmin\b/);
  const service = read(join(root, "../services/slackItemLinkService.ts"));
  assert.match(service, /\bfunction\s+canUnlink\s*\(/);
  assert.doesNotMatch(withoutCanUnlink(service), /\bisAdmin\b/);
});
check("loading guard rejects slow opens and accepts a loading view within five lines", () => {
  assert.deepEqual(loadingViolations("client.views.open({view: buildModal()});", "fixture.ts"), [1]);
  assert.deepEqual(loadingViolations("client.views.open({\nview: loadingView('Task')\n});", "fixture.ts"), []);
  assert.deepEqual(loadingViolations("client.views.open({\n\n\n\n\n\nview: loadingView('Task')\n});", "fixture.ts"), [1]);
});
check("every mirror modal opens a loading view promptly", () => {
  for (const file of files(join(root, "handlers")).filter(file => !file.endsWith(".test.ts"))) {
    const label = relative(root, file).replaceAll("\\", "/");
    assert.deepEqual(loadingViolations(read(file), label), [], label);
  }
});
check("every view module has block-budget test coverage", () => {
  const viewFiles = files(join(root, "views"));
  const tests = viewFiles.filter(file => file.endsWith(".test.ts")).map(file => ({ file, text: read(file) }));
  for (const file of viewFiles.filter(file => !file.endsWith(".test.ts"))) {
    const module = basename(file).replace(/\.ts$/, ".js");
    const coverage = tests.some(test => {
      const parsed = source(test.text);
      const importsModule = parsed.statements.some(statement => ts.isImportDeclaration(statement)
        && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === `./${module}`);
      return importsModule && /\bassertBlockBudget\s*\(/.test(test.text);
    });
    assert.ok(coverage, `${relative(root, file)} needs a test importing it and calling assertBlockBudget`);
  }
});
console.log(`slackMirrorInvariants: ${passed} passed, 0 failed`);
