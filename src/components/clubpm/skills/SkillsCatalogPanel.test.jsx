import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SkillsCatalogPanel from './SkillsCatalogPanel';
import { get, skillsAdminApi as api } from '../../../api/clubPmClient';
jest.mock('../../../api/clubPmClient', () => ({ get: jest.fn(() => Promise.resolve([])), skillsAdminApi: { catalog: jest.fn(), status: jest.fn(), setCatalogPolicy: jest.fn(), reverseCatalogChange: jest.fn() } }));
jest.mock('./SkillsRunPanel', () => () => null);
jest.mock('./SkillsReview', () => () => null);
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));
const taxonomy = [{ id: 's1', name: 'Assembly design', aliases: [], type: 'TECHNIQUE', description: 'Design mating interfaces.', lifecycle: 'ESTABLISHED' }];
const policy = { revision: 7, paused: false, autoCreate: true, autoConsolidate: false, maxCreatesPerDay: 10, maxAffectedMembers: 5, maxRunCostUsd: 2 };
const change = { id: 'merge1', kind: 'CONSOLIDATE', skillId: 'old', targetId: 's1', automatic: true, createdAt: '2026-10-15', policyVersion: 'catalog-v1', reason: 'Same scope and definition.', payload: { sourceName: 'Old name', targetName: 'Assembly design', memberIds: ['m1'] } };
beforeEach(() => { jest.clearAllMocks(); get.mockResolvedValue([]); api.catalog.mockResolvedValue({ policy, changes: [] }); api.status.mockResolvedValue({ running: null, dryRun: null }); });
test('member library never requests admin receipts or renders consolidation controls', () => {
  render(<SkillsCatalogPanel mode="library" isAdmin={false} taxonomy={taxonomy} onRetry={() => {}} />);
  expect(screen.getByText('Assembly design')).toBeTruthy();
  expect(api.catalog).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Consolidate concepts' })).toBeNull();
});
test('admin undo uses the recorded decision and disables a reversed consolidation', async () => {
  let changes = [change];
  api.catalog.mockImplementation(async () => ({ policy, changes }));
  api.reverseCatalogChange.mockImplementation(async () => { changes = [change, { ...change, id: 'reverse1', kind: 'KEEP_SEPARATE', reversesId: 'merge1', payload: {} }]; return { ok: true }; });
  render(<SkillsCatalogPanel mode="library" isAdmin taxonomy={taxonomy} onRetry={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Undo consolidation' }));
  await waitFor(() => expect(api.reverseCatalogChange).toHaveBeenCalledWith('merge1'));
  expect(await screen.findByRole('button', { name: 'Reversed' })).toBeDisabled();
});
test('pause includes the expected revision and same-tick double clicks send one mutation', async () => {
  let resolve;
  api.setCatalogPolicy.mockReturnValue(new Promise(r => { resolve = r; }));
  render(<SkillsCatalogPanel mode="automation" isAdmin taxonomy={taxonomy} onRetry={() => {}} />);
  const pause = await screen.findByRole('button', { name: 'Pause automation' });
  fireEvent.click(pause); fireEvent.click(pause);
  expect(api.setCatalogPolicy).toHaveBeenCalledTimes(1);
  expect(api.setCatalogPolicy).toHaveBeenCalledWith({ revision: 7, paused: true });
  await act(async () => resolve({ ...policy, paused: true }));
});
