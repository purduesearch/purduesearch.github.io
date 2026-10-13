import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SkillsAdmin from './SkillsAdmin';
import { get, skillsAdminApi as api } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  get: jest.fn(),
  skillsAdminApi: {
    status: jest.fn(), taxonomy: jest.fn(), search: jest.fn(), ask: jest.fn(), verify: jest.fn(), startRun: jest.fn(), recompute: jest.fn(),
    proposals: jest.fn(), disputes: jest.fn(), disagreements: jest.fn(), approveProposal: jest.fn(), rejectProposal: jest.fn(),
    mergeProposal: jest.fn(), resolveDispute: jest.fn(), createSkill: jest.fn(), addAlias: jest.fn(), removeAlias: jest.fn(), patchSkill: jest.fn(),
    cancelRun: jest.fn(), seedTaxonomy: jest.fn(), matrix: jest.fn(), person: jest.fn(), personEvidence: jest.fn(), embedMissing: jest.fn(),
  },
}));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const latestRun = {
  id: 'r1', status: 'SUCCEEDED', startedAt: '2026-10-11T07:30:00Z', finishedAt: '2026-10-11T07:34:00Z', trigger: 'CRON', scope: null,
  counts: { analyzed: 12, evidenceWritten: 11 }, tokensIn: 9000, tokensOut: 1200, estCostUsd: 0.0123,
  errors: [{ stage: 'collect:github', message: 'no GitHub access for o/r' }],
};
const checks = (keyOk = true) => [
  { id: 'key', ok: keyOk, label: 'Gemini API key', detail: keyOk ? 'Set on the server' : 'GEMINI_API_KEY is missing in backend/.env' },
  { id: 'taxonomy', ok: true, label: 'Skill list', detail: '130 active skills' },
  { id: 'schedule', ok: true, label: 'Weekly schedule', detail: 'Sundays 02:30 server time' },
];
const status = (over = {}) => ({
  enabled: true, geminiConfigured: true, configProblems: [], schedule: 'Sundays 02:30 server time', running: null, staleRun: null, dryRun: null,
  latest: latestRun, recent: [latestRun], lastSuccessful: null, pendingProposals: 2, openDisputes: 1, evidenceCount: 40, membersWithSkills: 9,
  totalMembers: 30, activeSkills: 130, checks: checks(), ...over,
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

const renderAdmin = () => render(<MemoryRouter><SkillsAdmin /></MemoryRouter>);
const ready = () => screen.findByText('Gemini API key');
const openFind = async () => {
  await ready();
  fireEvent.click(screen.getByRole('tab', { name: /Find people/ }));
  fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'PCB design' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
};

beforeEach(() => {
  jest.clearAllMocks();
  api.status.mockResolvedValue(status());
  api.taxonomy.mockResolvedValue({ skills: [{ id: 's1', name: 'PCB Design', status: 'ACTIVE', type: 'TECHNIQUE', aliases: [], links: [], people: 1 }] });
  get.mockImplementation((path) => Promise.resolve(path === '/api/members' ? [{ id: 'm1', displayName: 'Alice Example' }] : []));
  api.search.mockResolvedValue({ advisory: 'Skill data is advisory.', people: [hit] });
  api.verify.mockResolvedValue({ ok: true });
  api.startRun.mockResolvedValue({ started: true });
  api.matrix.mockResolvedValue({ advisory: 'x', groups: [], members: [], singlePoints: [] });
});

test('overview: header stats, setup checks and the run history with its issues', async () => {
  renderAdmin();
  expect(await screen.findByText(/of 30 people have skills/)).toBeTruthy();
  expect(screen.getByText('Gemini API key')).toBeTruthy();
  expect(screen.getByRole('tab', { name: /Review \(3\)/ })).toBeTruthy();
  const row = screen.getByRole('button', { name: /12 analysed · 11 evidence written/ });
  fireEvent.click(row);
  expect(screen.getByText(/no GitHub access for o\/r/)).toBeTruthy();
  expect(screen.getByText('10,200')).toBeTruthy();
});

test('says what is missing when Gemini is not configured, and blocks starting a run', async () => {
  api.status.mockResolvedValue(status({ geminiConfigured: false, configProblems: ['GEMINI_API_KEY is not set on the server'], checks: checks(false) }));
  renderAdmin();
  expect(await screen.findByText('GEMINI_API_KEY is not set on the server')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Run for everyone/ }).disabled).toBe(true);
});

test('a live run shows its stage and progress and can be stopped', async () => {
  api.status.mockResolvedValue(status({ running: { id: 'r2', startedAt: new Date().toISOString(), trigger: 'MANUAL', scope: null, cancelRequested: false, progress: { stage: 'analyze', done: 3, total: 12 } } }));
  api.cancelRun.mockResolvedValue({ closed: false });
  renderAdmin();
  expect(await screen.findByText('Analysing work')).toBeTruthy();
  expect(screen.getByText(/3 of 12 items analysed/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Stop run' }));
  await waitFor(() => expect(api.cancelRun).toHaveBeenCalledWith('r2'));
});

test('a manual check sends the chosen member and window', async () => {
  renderAdmin();
  await ready();
  await screen.findByRole('option', { name: 'Alice Example' });
  fireEvent.change(screen.getByLabelText('Member for a manual check'), { target: { value: 'm1' } });
  fireEvent.change(screen.getByLabelText('Time window'), { target: { value: '30' } });
  fireEvent.click(screen.getByRole('button', { name: /Run for this selection/ }));
  await waitFor(() => expect(api.startRun).toHaveBeenCalledWith({ memberId: 'm1', sinceDays: 30 }));
});

test('people grid shows the highest-trust level per cell and single points of knowledge', async () => {
  api.matrix.mockResolvedValue({
    advisory: 'Advisory.',
    groups: [{ id: 'g', name: 'Electronics', skills: [{ id: 's1', name: 'PCB Design', type: 'TECHNIQUE', holders: 1, strong: 1 }] }],
    members: [{ id: 'm1', displayName: 'Alice Example', avatarUrl: null, title: null, skillCount: 1, cells: { s1: { level: 4, band: 'HIGH', provenance: 'MANAGER_VERIFIED', trend: 'STABLE', lastDemonstrated: null } } }],
    singlePoints: [{ skillId: 's1', name: 'PCB Design', memberId: 'm1', displayName: 'Alice Example' }],
  });
  renderAdmin();
  await ready();
  fireEvent.click(screen.getByRole('tab', { name: /People/ }));
  expect(await screen.findByText('Only one strong person')).toBeTruthy();
  const cell = screen.getByTitle(/Alice Example · PCB Design: level 4 \(Advanced\), lead-verified/);
  expect(cell.textContent).toBe('4');
  expect(cell.className).toMatch(/verified/);
});

test('searching sends the filters and shows each provenance on its own line with its evidence', async () => {
  renderAdmin();
  await openFind();
  expect(await screen.findByText('Laid out the radio board.')).toBeTruthy();
  expect(api.search).toHaveBeenCalledWith({ skill: 'PCB design', minLevel: '3', activeWithinDays: '180', minConfidence: '' });
  expect(screen.getByText(/From work: level 4 \(Advanced\)/)).toBeTruthy();
  expect(screen.getByText(/Self-claimed: level 2 \(Beginner\)/)).toBeTruthy();
  expect(screen.getByText('Skill data is advisory.')).toBeTruthy();
});

test('no results explains how to widen the search instead of showing an empty box', async () => {
  api.search.mockResolvedValue({ advisory: 'x', people: [] });
  renderAdmin();
  await openFind();
  expect(await screen.findByText(/No one matches/)).toBeTruthy();
});

test('a lead can verify a level; it is recorded as its own line, not an overwrite', async () => {
  renderAdmin();
  await openFind();
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
  renderAdmin();
  await ready();
  fireEvent.click(screen.getByRole('tab', { name: /Ask/ }));
  fireEvent.change(screen.getByLabelText('Ask about who could do something'), { target: { value: 'who could do the radio board layout?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(await screen.findByText('Alice has the strongest recorded board layout work.')).toBeTruthy();
  expect(screen.getByText('cited')).toBeTruthy();
  expect(screen.getByText('not on this project')).toBeTruthy();
  expect(screen.getByText(/Matched by filters and meaning/)).toBeTruthy();
  expect(api.ask).toHaveBeenCalledWith('who could do the radio board layout?', '');
});

test('review queues: approving a proposal says how much work it credits', async () => {
  api.proposals.mockResolvedValue({ proposals: [{ id: 'p1', name: 'Kubernetes', seenCount: 3, suggestedType: 'TOOL', rationale: 'deploys', nearSkillIds: [], evidenceIds: ['e1', 'e2'] }] });
  api.approveProposal.mockResolvedValue({ skillId: 'new', credited: 2 });
  renderAdmin();
  await ready();
  fireEvent.click(screen.getByRole('tab', { name: /Review/ }));
  expect(await screen.findByText('Kubernetes')).toBeTruthy();
  expect(screen.getByText(/approving credits 2 pieces of work/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add as new skill' }));
  await waitFor(() => expect(api.approveProposal).toHaveBeenCalledWith('p1', { type: 'TOOL' }));
});

test('review queues: flagged tags can be upheld or kept with a note', async () => {
  api.proposals.mockResolvedValue({ proposals: [] });
  api.disputes.mockResolvedValue({ disputes: [{ id: 'd1', memberName: 'Bob', skillName: 'Welding', reason: 'I never welded', createdAt: '2026-10-01T00:00:00Z', evidence: null }] });
  api.resolveDispute.mockResolvedValue({ ok: true });
  renderAdmin();
  await ready();
  fireEvent.click(screen.getByRole('tab', { name: /Review/ }));
  fireEvent.click(await screen.findByRole('tab', { name: 'Flagged tags' }));
  expect(await screen.findByText('“I never welded”')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Note to the member (optional)'), { target: { value: 'Thanks, removed.' } });
  fireEvent.click(screen.getByRole('button', { name: 'They are right: remove the tag' }));
  await waitFor(() => expect(api.resolveDispute).toHaveBeenCalledWith('d1', 'UPHELD', 'Thanks, removed.'));
});

test('taxonomy: an empty list offers the starter skills', async () => {
  api.taxonomy.mockResolvedValue({ skills: [] });
  api.seedTaxonomy.mockResolvedValue({ created: 130, existing: 0, aliases: 200, edges: 150, proposalsResolved: 0 });
  renderAdmin();
  await ready();
  fireEvent.click(screen.getByRole('tab', { name: /Taxonomy/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Install about 130 starter skills/ }));
  await waitFor(() => expect(api.seedTaxonomy).toHaveBeenCalled());
});
