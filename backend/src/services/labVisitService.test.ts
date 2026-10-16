// Offline service boundary checks: no database, credentials, Slack, or AI calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as core from './labVisitCore.js';
import * as schedule from './labScheduleCore.js';

// Transpile the actual service with injected module boundaries, preventing its
// notification imports from bootstrapping Slack Bolt in an offline test.
const prisma: any = { labVisit: {}, task: {}, workspaceProject: {}, workspace: {}, member: {} };
const exports: any = {};
const source = readFileSync(new URL('./labVisitService.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
runInNewContext(compiled.outputText, { exports, console, require: (id: string) => {
  if (id.includes('db/prisma')) return { prisma };
  if (id.includes('labVisitCore')) return core;
  if (id.includes('labScheduleCore')) return schedule;
  if (id.includes('timeLogService')) return { recordTimeLog: (opts: any) => writeLog(opts) };
  if (id.includes('workspaceService')) return { getWorkspace: async () => ({ id: 'lab', name: 'Design lab' }) };
  if (id.includes('notificationCrud')) return {};
  throw new Error(`Unexpected service dependency: ${id}`);
} });
const { checkOut, closeVisit, getMyVisits, getLabTimeSummary } = exports;

const start = new Date('2026-10-15T15:00:00Z');
const end = new Date('2026-10-15T16:01:00Z');
const visit = { id: 'visit', memberId: 'me', workspaceId: 'lab', checkedInAt: start, status: 'OPEN', autoClosed: false } as any;
const tasks = [{ id: 'a', title: 'Not started', projectId: 'p1' }, { id: 'b', title: 'Blocked work', projectId: 'p2' }];
const saved: Array<() => void> = [];
function stub(target: any, key: string, fn: any) {
  const original = target[key]; saved.push(() => { target[key] = original; }); target[key] = fn;
}
let taskQuery: any;
let update: any;
let claimed = 1;
const logs: any[] = [];
const writeLog = async (opts: any) => { logs.push(opts); return {} as any; };

try {
  stub(prisma.labVisit, 'updateMany', async (args: any) => { update = args; return { count: claimed }; });
  stub(prisma.labVisit, 'update', async ({ data }: any) => ({ ...visit, ...data }));
  stub(prisma.task, 'findMany', async (args: any) => {
    taskQuery = args;
    if (args.where.status === 'TODO') return [];
    return args.where.id ? tasks.filter(t => args.where.id.in.includes(t.id)) : tasks;
  });
  stub(prisma.workspaceProject, 'findMany', async () => [{ projectId: 'p1' }]);
  stub(prisma.workspace, 'findUnique', async () => ({ name: 'Design lab' }));

  const manual = await closeVisit(visit, end, 'WEB', { taskIds: ['a', 'b'], recap: 'Reviewed and tested' });
  assert.deepEqual(manual.allocations.map(a => [a.taskId, a.minutes]), [['a', 31], ['b', 30]]);
  assert.equal(taskQuery.where.status, undefined, 'TODO and BLOCKED are eligible for explicitly selected work');
  assert.equal(taskQuery.where.assignees.some.id, 'me');
  assert.equal(update.data.recap, 'Reviewed and tested');
  assert.equal(logs[0].note, 'Lab: Design lab — Reviewed and tested');
  assert.equal(logs[0].labVisitId, visit.id);
  assert.equal(update.data.totalMinutes, 61, 'the session counts once, not once per selected task');
  assert.equal(update.data.otherMinutes, 0);

  logs.length = 0;
  const none = await closeVisit(visit, end, 'WEB', { taskIds: [], recap: 'Lab cleanup' });
  assert.equal(none.unallocatedMinutes, 61, 'an explicit empty selection never falls back to in-progress work');
  assert.equal(logs.length, 0);
  assert.equal(update.data.recap, 'Lab cleanup', 'recaps persist even without task allocations');

  const other = await closeVisit(visit, end, 'WEB', { other: true, recap: 'General lab maintenance' });
  assert.equal(other.otherMinutes, 61);
  assert.equal(other.visit.totalMinutes, 61);
  assert.equal(other.unallocatedMinutes, 0, 'Other is final, not a reminder to allocate to tasks');
  assert.equal(other.allocations.length, 0);
  assert.equal(logs.length, 0, 'Other does not create a task time log');
  assert.equal(update.data.otherMinutes, 61);
  const shortOther = await closeVisit(visit, new Date(start.getTime() + 120000), 'WEB', { other: true });
  assert.equal(shortOther.discarded, false, 'explicit person-only time has no task minimum');
  assert.equal(shortOther.otherMinutes, 2);

  await closeVisit(visit, end, 'SLACK', undefined);
  assert.equal(taskQuery.where.status, 'IN_PROGRESS', 'legacy and Slack callers retain automatic allocation');
  assert.deepEqual(logs.map(l => l.taskId), ['a'], 'automatic allocation still prefers workspace projects');

  logs.length = 0;
  const short = await closeVisit(visit, new Date(start.getTime() + 120000), 'WEB', { taskIds: ['a'], recap: 'Quick pickup' });
  assert.equal(short.discarded, true);
  assert.equal(update.data.totalMinutes, 2, 'short attendance remains recorded even without task credit');
  assert.equal(update.data.recap, 'Quick pickup');
  assert.equal(logs.length, 0);

  claimed = 0;
  await assert.rejects(closeVisit(visit, end, 'WEB', { taskIds: ['a'] }), /already closed/);
  assert.equal(logs.length, 0, 'concurrent close cannot duplicate time logs');
  claimed = 1;

  stub(prisma.labVisit, 'findFirst', async () => visit);
  await assert.rejects(checkOut('me', { source: 'WEB', visitId: 'stale' }), /visit changed/);
  await assert.rejects(checkOut('me', { source: 'WEB', taskIds: ['not-assigned'] }), /assigned/);
  await assert.rejects(checkOut('me', { source: 'WEB', other: true, taskIds: ['a'] }), /not both/);

  stub(prisma.labVisit, 'findMany', async () => []);
  await getMyVisits('me', end);
  assert.equal(taskQuery.where.status.not, 'DONE');
  assert.equal(taskQuery.where.assignees.some.id, 'me');
  assert.equal(taskQuery.take, undefined, 'all assigned unfinished tasks are offered without a top-ten limit');

  let isAdmin = false;
  let summaryQuery: any;
  stub(prisma.member, 'findUnique', async () => ({ isAdmin }));
  stub(prisma.member, 'findMany', async () => [{ id: 'me', displayName: 'Lab Member' }]);
  stub(prisma.labVisit, 'groupBy', async (args: any) => {
    summaryQuery = args;
    return [{ memberId: 'me', _sum: { totalMinutes: 122, otherMinutes: 61, unallocatedMinutes: 0 }, _count: { _all: 2 } }];
  });
  const summary = await getLabTimeSummary('me', {}, end);
  assert.equal(summaryQuery.where.memberId, 'me', 'members are restricted to their own time');
  assert.equal(summary.byMember[0].totalMinutes, 122, 'task and Other sessions contribute to one attendance total');
  assert.equal(summary.byMember[0].otherMinutes, 61);
  assert.equal(summaryQuery.where.totalMinutes.gt, 0, 'unconfirmed expired closures never count as attendance');
  await assert.rejects(getLabTimeSummary('me', { memberId: 'other-person' }, end), /own lab time/);
  await assert.rejects(getLabTimeSummary('me', { from: 'invalid' }, end), /valid date range/);
  await assert.rejects(getLabTimeSummary('me', { from: '2020-01-01', to: '2026-01-01' }, end), /valid date range/);
  isAdmin = true;
  await getLabTimeSummary('admin', {}, end);
  assert.equal(summaryQuery.where.memberId, undefined, 'admins can analyze all members');
  await getLabTimeSummary('admin', { memberId: 'me' }, end);
  assert.equal(summaryQuery.where.memberId, 'me', 'admins can filter a member');
  console.log('labVisitService: allocation, recap, concurrency, ownership, and task selector checks passed');
} finally {
  saved.reverse().forEach(restore => restore());
}
