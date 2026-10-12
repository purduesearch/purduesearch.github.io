import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SkillsAdmin from './SkillsAdmin';
import { get, skillsAdminApi as api } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  get: jest.fn(),
  skillsAdminApi: {
    status: jest.fn(), taxonomy: jest.fn(), search: jest.fn(), ask: jest.fn(), verify: jest.fn(), startRun: jest.fn(), recompute: jest.fn(),
    proposals: jest.fn(), disputes: jest.fn(), disagreements: jest.fn(), approveProposal: jest.fn(), rejectProposal: jest.fn(),
    mergeProposal: jest.fn(), resolveDispute: jest.fn(), createSkill: jest.fn(), addAlias: jest.fn(), removeAlias: jest.fn(), patchSkill: jest.fn(),
  },
}));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const status = (over = {}) => ({
  enabled: true, geminiConfigured: true, schedule: 'Sundays 02:30 server time', running: null,
  latest: { status: 'SUCCEEDED', startedAt: '2026-10-11T07:30:00Z', trigger: 'CRON', counts: { analyzed: 12, evidenceWritten: 11 }, tokensIn: 9000, tokensOut: 1200, estCostUsd: 0.0123, errors: [] },
  lastSuccessful: null, pendingProposals: 2, openDisputes: 1, evidenceCount: 40, membersWithSkills: 9, ...over,
});

const hit = {
  member: { id: 'm1', displayName: 'Alice Example', avatarUrl: null, title: 'Structures' }, bestLevel: 4,
  skills: [{
    skillId: 's1', name: 'PCB Design',
    rows: [
      { provenance: 'AI_INFERRED', level: 4, confidenceBand: 'HIGH', lastDemonstrated: '2026-09-10T00:00:00Z', trend: 'STABLE', evidenceCount: 5 },
      { provenance: 'SELF_CLAIMED', level: 2, confidenceBand: 'LOW', lastDemonstrated: null, trend: 'STABLE', evidenceCount: 0 },
    ],
    evidence: [{ id: 'e1', summary: 'Laid out the radio board.', source: 'cad', date: '2026-09-10', url: null, project: 'Rover' }],
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.status.mockResolvedValue(status());
  api.taxonomy.mockResolvedValue({ skills: [{ id: 's1', name: 'PCB Design', status: 'ACTIVE' }] });
  get.mockImplementation((path) => Promise.resolve(path === '/api/members' ? [{ id: 'm1', displayName: 'Alice Example' }] : []));
  api.search.mockResolvedValue({ advisory: 'Skill data is advisory.', people: [hit] });
  api.verify.mockResolvedValue({ ok: true });
  api.startRun.mockResolvedValue({ started: true });
});

test('shows the last run: status, counts, tokens, cost, schedule and queue sizes', async () => {
  render(<SkillsAdmin />);
  expect(await screen.findByText('succeeded')).toBeTruthy();
  expect(screen.getByText(/analyzed: 12/)).toBeTruthy();
  expect(screen.getByText(/10200 tokens/)).toBeTruthy();
  expect(screen.getByText(/Scheduled: Sundays 02:30/)).toBeTruthy();
  expect(screen.getByText(/2 proposed skills · 1 flagged tags/)).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Review (3)' })).toBeTruthy();
});

test('says so when the schedule is off or the key is missing, and blocks starting a run', async () => {
  api.status.mockResolvedValue(status({ enabled: false, geminiConfigured: false }));
  render(<SkillsAdmin />);
  expect(await screen.findByText(/Weekly schedule is off/)).toBeTruthy();
  expect(screen.getByText(/Gemini key missing/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Run for everyone' }).disabled).toBe(true);
});

test('searching sends the filters and shows each provenance on its own line with its evidence', async () => {
  render(<SkillsAdmin />);
  await screen.findByText('succeeded');
  fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'PCB design' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('Laid out the radio board.')).toBeTruthy();
  expect(api.search).toHaveBeenCalledWith({ skill: 'PCB design', minLevel: '3', activeWithinDays: '180', minConfidence: '' });
  expect(screen.getByText(/From work: level 4 \(Advanced\)/)).toBeTruthy();
  expect(screen.getByText(/Self-claimed: level 2 \(Beginner\)/)).toBeTruthy();
  expect(screen.getByText('Skill data is advisory.')).toBeTruthy();
});

test('no results explains how to widen the search instead of showing an empty box', async () => {
  api.search.mockResolvedValue({ advisory: 'x', people: [] });
  render(<SkillsAdmin />);
  await screen.findByText('succeeded');
  fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'PCB design' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText(/No one matches/)).toBeTruthy();
});

test('a lead can verify a level; it is recorded as its own line, not an overwrite', async () => {
  render(<SkillsAdmin />);
  await screen.findByText('succeeded');
  fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'PCB design' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Verify a level for this person' }));
  expect(screen.getByText(/does not overwrite it/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(api.verify).toHaveBeenCalledWith({ memberId: 'm1', skillId: 's1', level: 3, note: null }));
});

test('ask answers with cited work and says how the people were matched', async () => {
  api.ask.mockResolvedValue({
    answer: 'Alice has the strongest recorded board layout work.', mode: 'mixed', modelAnswered: true,
    filters: { skills: [{ id: 's1', name: 'PCB Design' }], minLevel: 3, activeWithinDays: 180 },
    people: [{
      onProject: false, why: 'Laid out the radio board.', member: { id: 'm1', displayName: 'Alice Example', avatarUrl: null, title: null },
      skills: [{ name: 'PCB Design', provenance: 'AI_INFERRED', level: 4, confidenceBand: 'HIGH' }],
      evidence: [{ id: 'e1', summary: 'Laid out the radio board.', source: 'cad', date: '2026-09-10', url: null, project: 'Rover', contribution: 'AUTHORED', complexity: 4, cited: true }],
    }],
  });
  render(<SkillsAdmin />);
  await screen.findByText('succeeded');
  fireEvent.click(screen.getByRole('tab', { name: 'Ask' }));
  fireEvent.change(screen.getByLabelText('Ask about who could do something'), { target: { value: 'who could do the radio board layout?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(await screen.findByText('Alice has the strongest recorded board layout work.')).toBeTruthy();
  expect(screen.getByText('cited')).toBeTruthy();
  expect(screen.getByText('not on this project')).toBeTruthy();
  expect(screen.getByText(/Matched by filters and meaning/)).toBeTruthy();
  expect(api.ask).toHaveBeenCalledWith('who could do the radio board layout?', '');
});

test('review queues: a proposed skill can be added, merged or rejected', async () => {
  api.proposals.mockResolvedValue({ proposals: [{ id: 'p1', name: 'Kubernetes', seenCount: 3, suggestedType: 'TOOL', rationale: 'deploys', nearSkillIds: [] }] });
  api.approveProposal.mockResolvedValue({ skillId: 'new' });
  render(<SkillsAdmin />);
  await screen.findByText('succeeded');
  fireEvent.click(screen.getByRole('tab', { name: /Review/ }));
  expect(await screen.findByText('Kubernetes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add as new skill' }));
  await waitFor(() => expect(api.approveProposal).toHaveBeenCalledWith('p1', { type: 'TOOL' }));
});

test('review queues: flagged tags can be upheld or kept with a note', async () => {
  api.proposals.mockResolvedValue({ proposals: [] });
  api.disputes.mockResolvedValue({ disputes: [{ id: 'd1', memberName: 'Bob', skillName: 'Welding', reason: 'I never welded', createdAt: '2026-10-01T00:00:00Z', evidence: null }] });
  api.resolveDispute.mockResolvedValue({ ok: true });
  render(<SkillsAdmin />);
  await screen.findByText('succeeded');
  fireEvent.click(screen.getByRole('tab', { name: /Review/ }));
  fireEvent.click(await screen.findByRole('tab', { name: 'Flagged tags' }));
  expect(await screen.findByText('“I never welded”')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Note to the member (optional)'), { target: { value: 'Thanks, removed.' } });
  fireEvent.click(screen.getByRole('button', { name: 'They are right: remove the tag' }));
  await waitFor(() => expect(api.resolveDispute).toHaveBeenCalledWith('d1', 'UPHELD', 'Thanks, removed.'));
});
