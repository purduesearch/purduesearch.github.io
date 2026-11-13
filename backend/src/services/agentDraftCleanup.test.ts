// Offline check: db is injected, no database or network.
import assert from 'node:assert/strict';
import { cleanupAgentDrafts, runAgentDraftCleanup } from './agentDraftCleanup.js';

let passed = 0;
const ok = (name: string) => { passed++; console.log(`ok - ${name}`); };

const now = new Date('2026-11-13T12:00:00Z');
const calls: any[] = [];
const fake: any = {
  agentPlanDraft: { deleteMany: async (a: any) => { calls.push(['draft', a]); return { count: 3 }; } },
  agentRecommendationDismissal: { deleteMany: async (a: any) => { calls.push(['dismissal', a]); return { count: 5 }; } },
};

const origLog = console.log;
const logs: any[][] = [];
console.log = (...a: any[]) => { logs.push(a); };
const res = await cleanupAgentDrafts({ db: fake, now: () => now });
console.log = origLog;

assert.equal(calls.length, 2);
assert.deepEqual(calls[0][1], { where: { expiresAt: { lt: new Date('2026-11-12T12:00:00Z') } } });
ok('draft cutoff is now - 24h');
assert.deepEqual(calls[1][1], { where: { until: { lt: now } } });
ok('dismissal cutoff is now');
assert.deepEqual(res, { drafts: 3, dismissals: 5 });
ok('returns counts');
assert.equal(logs.length, 1);
assert.deepEqual(logs[0], ['[agent-drafts] pruned', { drafts: 3, dismissals: 5 }]);
ok('logs counts only');

const zero: any = {
  agentPlanDraft: { deleteMany: async () => ({ count: 0 }) },
  agentRecommendationDismissal: { deleteMany: async () => ({ count: 0 }) },
};
const logs2: any[][] = [];
console.log = (...a: any[]) => { logs2.push(a); };
await cleanupAgentDrafts({ db: zero, now: () => now });
console.log = origLog;
assert.equal(logs2.length, 0);
ok('silent when nothing pruned');

const boom: any = {
  agentPlanDraft: { deleteMany: async () => { throw new Error('db down'); } },
  agentRecommendationDismissal: { deleteMany: async () => ({ count: 0 }) },
};
const origErr = console.error;
const errs: any[][] = [];
console.error = (...a: any[]) => { errs.push(a); };
await runAgentDraftCleanup({ db: boom, now: () => now });
console.error = origErr;
assert.equal(errs.length, 1);
assert.equal(errs[0][0], '[agent-drafts] cleanup error:');
ok('runAgentDraftCleanup swallows db errors');

console.log(`${passed} passed`);
