// Pure permission-predicate tests for blog review threads.
// Run: cd backend && npx tsx src/services/blogThreadService.test.ts
import { canSetThreadStatus, canDeleteComment } from "./blogThreadService.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

// Accepting or rejecting a suggestion changes the document — editors only.
check("editor may accept",
  canSetThreadStatus({ status: "ACCEPTED", isDocEditor: true, isThreadCreator: false }) === true);
check("editor may reject",
  canSetThreadStatus({ status: "REJECTED", isDocEditor: true, isThreadCreator: false }) === true);
check("non-editor may NOT accept",
  canSetThreadStatus({ status: "ACCEPTED", isDocEditor: false, isThreadCreator: true }) === false);
check("non-editor may NOT reject",
  canSetThreadStatus({ status: "REJECTED", isDocEditor: false, isThreadCreator: true }) === false);

// Resolving is bookkeeping — editors on any thread, others on their own.
check("editor may resolve anyone's thread",
  canSetThreadStatus({ status: "RESOLVED", isDocEditor: true, isThreadCreator: false }) === true);
check("author may resolve their own thread",
  canSetThreadStatus({ status: "RESOLVED", isDocEditor: false, isThreadCreator: true }) === true);
check("non-editor may NOT resolve someone else's thread",
  canSetThreadStatus({ status: "RESOLVED", isDocEditor: false, isThreadCreator: false }) === false);
check("thread creator may reopen their own",
  canSetThreadStatus({ status: "OPEN", isDocEditor: false, isThreadCreator: true }) === true);
check("unknown status is refused",
  canSetThreadStatus({ status: "BANANA", isDocEditor: true, isThreadCreator: true }) === false);

check("author may delete own comment",
  canDeleteComment({ isDocEditor: false, isCommentAuthor: true }) === true);
check("editor may delete another's comment",
  canDeleteComment({ isDocEditor: true, isCommentAuthor: false }) === true);
check("outsider may not delete another's comment",
  canDeleteComment({ isDocEditor: false, isCommentAuthor: false }) === false);

console.log(`\nblogThreadService: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
