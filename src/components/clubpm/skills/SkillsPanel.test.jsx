import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SkillsPanel from './SkillsPanel';
import { skillsApi } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  skillsApi: {
    me: jest.fn(), evidence: jest.fn(), taxonomy: jest.fn(), claim: jest.fn(), unclaim: jest.fn(), dispute: jest.fn(),
    setSkillPublic: jest.fn(), setProjectPublic: jest.fn(), setPortfolio: jest.fn(), addEvidence: jest.fn(),
  },
}));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const prov = (over) => ({
  provenance: 'AI_INFERRED', level: 3, confidence: 0.6, confidenceBand: 'MEDIUM', firstSeen: '2026-01-01T00:00:00Z',
  lastDemonstrated: '2026-09-10T00:00:00Z', trend: 'GROWING', rationale: '3 evidence items across 2 sources', evidenceCount: 3,
  assertedById: null, note: null, computedAt: '2026-10-01T00:00:00Z', ...over,
});

const me = (over = {}) => ({
  groups: [{
    groupId: 'g1', groupName: 'Mechanical Engineering',
    skills: [{
      skillId: 's1', slug: 'solidworks', name: 'SolidWorks', type: 'TOOL', lead: 'AI_INFERRED', isPublic: true, alsoUnder: [],
      provenances: [prov(), prov({ provenance: 'SELF_CLAIMED', level: 5, confidenceBand: 'LOW', assertedById: 'm1', note: 'Used it for years' })],
      disagreement: { kind: 'levels_differ', spread: 2, detail: 'self claimed says 5, ai inferred says 3.' },
    }],
  }],
  projects: [], disputes: [], portfolio: null, lastAnalysisAt: '2026-10-05T00:00:00Z',
  notice: 'These are advisory estimates inferred from your project work.',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  skillsApi.me.mockResolvedValue(me());
  skillsApi.evidence.mockResolvedValue({ evidence: [{
    id: 'e1', source: 'CAD', sourceUrl: null, projectName: 'Rover', occurredAt: '2026-09-10T00:00:00Z', contribution: 'AUTHORED', complexity: 4,
    outcome: 'SHIPPED', summary: 'Modelled the antenna bracket.',
  }] });
  skillsApi.dispute.mockResolvedValue({ id: 'd1' });
  skillsApi.setSkillPublic.mockResolvedValue({ ok: true });
});

test('shows level and confidence separately, plus the advisory notice', async () => {
  render(<SkillsPanel />);
  expect(await screen.findByText('SolidWorks')).toBeTruthy();
  expect(screen.getByText('Mechanical Engineering')).toBeTruthy();
  expect(screen.getByRole('img', { name: /Level 3 of 5, Competent/ })).toBeTruthy();
  expect(screen.getByText('Medium confidence')).toBeTruthy();
  expect(screen.getByText(/advisory estimates/)).toBeTruthy();
});

test('surfaces the disagreement between a claim and the data instead of hiding it', async () => {
  render(<SkillsPanel />);
  expect(await screen.findByText('self claimed says 5, ai inferred says 3.')).toBeTruthy();
});

test('expanding a skill lists every provenance on its own line and loads the linked work', async () => {
  render(<SkillsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: /SolidWorks/ }));
  expect(await screen.findByText(/level 3 \(Competent\), medium confidence, 3 pieces of work/)).toBeTruthy();
  expect(screen.getByText(/level 5 \(Expert\)/)).toBeTruthy();
  expect(await screen.findByText('Modelled the antenna bracket.')).toBeTruthy();
  expect(skillsApi.evidence).toHaveBeenCalledWith('s1');
});

test('flagging a wrong tag sends the reason and the skill', async () => {
  render(<SkillsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: /SolidWorks/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'This skill tag is wrong' }));
  fireEvent.change(screen.getByLabelText('What looks wrong?'), { target: { value: 'I never used this tool' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
  await waitFor(() => expect(skillsApi.dispute).toHaveBeenCalledWith({ skillId: 's1', evidenceId: null, reason: 'I never used this tool' }));
});

test('the visibility toggle flips a skill between public and hidden', async () => {
  render(<SkillsPanel />);
  const toggle = await screen.findByRole('button', { name: 'Public' });
  fireEvent.click(toggle);
  await waitFor(() => expect(skillsApi.setSkillPublic).toHaveBeenCalledWith('s1', false));
});

test('a skill with an open dispute is marked under review', async () => {
  skillsApi.me.mockResolvedValue(me({ disputes: [{ id: 'd1', skillId: 's1', status: 'OPEN', reason: 'x' }] }));
  render(<SkillsPanel />);
  expect(await screen.findByText('under review')).toBeTruthy();
});

test('an empty profile explains where skills come from instead of looking broken', async () => {
  skillsApi.me.mockResolvedValue(me({ groups: [] }));
  render(<SkillsPanel />);
  expect(await screen.findByText(/Nothing inferred yet/)).toBeTruthy();
});

test('a failed load shows a calm message, not a crash', async () => {
  skillsApi.me.mockRejectedValue(new Error('down'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<SkillsPanel />);
  expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
});
