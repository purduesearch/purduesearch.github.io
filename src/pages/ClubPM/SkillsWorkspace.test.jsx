import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SkillsWorkspace from './SkillsWorkspace';
import { skillsApi, skillsAdminApi } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';

jest.mock('../../clubpm/ClubPmAuth', () => ({ useClubPmAuth: jest.fn() }));
jest.mock('../../api/clubPmClient', () => ({ skillsApi: { workspace: jest.fn(), taxonomy: jest.fn(), evidence: jest.fn(), setGoals: jest.fn(), saveOpportunity: jest.fn(), coverage: jest.fn(), setSkillTeamVisible: jest.fn(), setSkillPublic: jest.fn(), dispute: jest.fn() }, skillsAdminApi: { catalog: jest.fn(), status: jest.fn() }, get: jest.fn() }));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));
const skill = { skillId: 's1', name: 'Assembly design', type: 'TECHNIQUE', description: 'Design how parts fit and function.', lifecycle: 'ESTABLISHED', showToTeam: false, isPublic: false, provenances: [{ provenance: 'AI_INFERRED', level: 3, confidenceBand: 'MEDIUM', evidenceCount: 2, rationale: 'Two independently supported contributions.', assertedById: null, computedAt: '2026-10-15', lastDemonstrated: '2026-10-14' }] };
const fixture = () => ({ groups: [{ groupId: 'cad', groupName: 'Mechanical', skills: [skill] }], summary: { contributions: 2, projects: 1 }, goals: [{ id: 's1', name: 'Assembly design' }], disputes: [], projects: [{ id: 'p1', name: 'ARES' }], evidenceProjects: [], opportunities: [{ id: 't1', title: 'Assembly design review', projectId: 'p1', projectName: 'ARES', estimatedHours: 2, saved: false, matches: [{ skillId: 's1', name: 'Assembly design', reason: 'The task explicitly mentions Assembly design.' }] }], recent: [], connections: { githubLinked: true, note: 'Source status from the run report.' }, lastAnalysisAt: null });
const mount = (url = '/clubpm/skills') => render(<MemoryRouter initialEntries={[url]}><SkillsWorkspace /></MemoryRouter>);
beforeEach(() => {
  jest.clearAllMocks();
  useClubPmAuth.mockReturnValue({ member: { id: 'm1', isAdmin: false } });
  skillsApi.workspace.mockResolvedValue(fixture());
  skillsApi.taxonomy.mockResolvedValue({ skills: [{ id: 's1', name: 'Assembly design', type: 'TECHNIQUE', aliases: [] }] });
  skillsApi.evidence.mockResolvedValue({ evidence: [{ id: 'e1', source: 'CAD', summary: 'Checked the bracket fit.', contribution: 'AUTHORED', complexity: 3, outcome: 'SHIPPED', occurredAt: '2026-10-14', context: { role: 'Authored the enclosure revision', truncated: true } }] });
  skillsApi.setSkillTeamVisible.mockResolvedValue({ ok: true });
  skillsApi.saveOpportunity.mockResolvedValue({ ok: true });
});
test('member workspace separates proficiency and confidence, filters, and keeps admin operations out', async () => {
  mount();
  expect(await screen.findByText('Assembly design')).toBeTruthy();
  expect(screen.getByText('Medium confidence')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Automation/ })).toBeNull();
  expect(skillsAdminApi.catalog).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Search your skills'), { target: { value: 'none' } });
  expect(screen.getByText(/No matching skills/)).toBeTruthy();
});
test('skill URL opens evidence and keeps teammate/public controls separate', async () => {
  mount('/clubpm/skills?skill=s1');
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Checked the bracket fit.')).toBeTruthy();
  expect(within(dialog).getByText(/source context was truncated/)).toBeTruthy();
  fireEvent.click(within(dialog).getByLabelText('Show to teammates'));
  await waitFor(() => expect(skillsApi.setSkillTeamVisible).toHaveBeenCalledWith('s1', true));
  expect(skillsApi.setSkillPublic).not.toHaveBeenCalled();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
test('growth saves a real task reference and never assigns it', async () => {
  mount('/clubpm/skills?view=growth');
  expect(await screen.findByText('Assembly design review')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open task ↗' }).getAttribute('href')).toBe('/clubpm/projects/p1?task=t1');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(skillsApi.saveOpportunity).toHaveBeenCalledWith('t1', true));
});
test('project coverage preserves explicit project scope and unknown capability', async () => {
  skillsApi.coverage.mockResolvedValue({ notice: 'Shared project evidence only.', members: [{ id: 'm2', displayName: 'Jamie Park', groups: [], hidden: false }] });
  mount('/clubpm/skills?view=team');
  expect(await screen.findByText('Jamie Park')).toBeTruthy();
  expect(skillsApi.coverage).toHaveBeenCalledWith('p1');
  expect(screen.getByText(/Capability is unknown/)).toBeTruthy();
});
test('failed workspace load has a retry that can recover', async () => {
  skillsApi.workspace.mockRejectedValueOnce(new Error('unavailable'));
  mount();
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Assembly design')).toBeTruthy();
});
test('unknown or unauthorized section URL falls back to the member record', async () => {
  mount('/clubpm/skills?view=automation');
  expect(await screen.findByText('Assembly design')).toBeTruthy();
  expect(skillsAdminApi.catalog).not.toHaveBeenCalled();
});
