import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the real middleware exports with injected DB/channel boundaries.
const source = readFileSync(new URL('./taskAccess.ts', import.meta.url), 'utf8');
function load({ admin = false, leads = [] as string[], denied = [] as string[] } = {}) {
  const lookups: string[] = [];
  const prisma = {
    member: { findUnique: async () => ({ isAdmin: admin }) },
    projectMember: { findUnique: async ({ where }: any) => {
      const id = where.projectId_memberId.projectId;
      lookups.push(id);
      return { isLead: leads.includes(id) };
    } },
    project: { findUnique: async () => ({ parentId: null }) },
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require: (path: string) => path.includes('projectEditAccess')
      ? { canEditProjectsBatch: async (_: string, ids: string[]) => new Map(ids.map(id => [id, !denied.includes(id)])) }
      : { prisma },
  });
  return { ...exports, lookups };
}
const task = (id: string, projectId = 'project', fields = {}) => ({ id, projectId, createdById: 'other', assignees: [], archivedAt: null, ...fields });

test('assignment hints use the mutation rule for admin, lead, creator and assignee', () => {
  const { taskEditAllowed } = load();
  assert.equal(taskEditAllowed('viewer', task('a'), false, false), false);
  assert.equal(taskEditAllowed('viewer', task('a'), true, false), true);
  assert.equal(taskEditAllowed('viewer', task('a'), false, true), true);
  assert.equal(taskEditAllowed('viewer', task('a', 'project', { createdById: 'viewer' }), false, false), true);
  assert.equal(taskEditAllowed('viewer', task('a', 'project', { assignees: [{ id: 'viewer' }] }), false, false), true);
});

test('batch eligibility excludes archived and inaccessible tasks and scopes leads to each project', async () => {
  const { taskAssignmentPermissions, lookups } = load({ leads: ['child'], denied: ['private'] });
  const result = await taskAssignmentPermissions('viewer', [
    task('local'), task('child', 'child'), task('child-sub', 'child'),
    task('creator', 'project', { createdById: 'viewer' }),
    task('archived', 'child', { archivedAt: new Date() }),
    task('private', 'private', { createdById: 'viewer' }),
  ]);
  assert.deepEqual(Array.from(result, (t: any) => t.canAssign), [false, true, true, true, false, false]);
  assert.equal(lookups.filter((id: string) => id === 'child').length, 1);
});
