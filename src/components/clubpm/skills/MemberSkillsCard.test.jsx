import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MemberSkillsCard from './MemberSkillsCard';
import { skillsApi } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  skillsApi: { member: jest.fn(), endorse: jest.fn(), unendorse: jest.fn() },
}));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const skill = (over = {}) => ({
  skillId: 's1', name: 'SolidWorks', type: 'TOOL', level: 3, confidence: 'MEDIUM', lead: 'AI_INFERRED', trend: 'GROWING',
  lastDemonstrated: '2026-09-10T00:00:00Z', verifiedByLead: false, endorsements: 0, myEndorsement: null,
  evidence: [{ summary: 'Modelled the wheel hub.', source: 'cad', date: '2026-09-10', project: 'Rover', link: null }], ...over,
});

beforeEach(() => { jest.clearAllMocks(); });

test('shows visible skills with level, confidence and shared work', async () => {
  skillsApi.member.mockResolvedValue({ hidden: false, githubLinked: true, notice: 'Advisory.', groups: [{ name: 'CAD', skills: [skill({ verifiedByLead: true, endorsements: 2 })] }] });
  render(<MemberSkillsCard memberId="m2" displayName="Bo Tester" />);
  expect(await screen.findByText('SolidWorks')).toBeTruthy();
  expect(screen.getByRole('img', { name: /Level 3 of 5, Competent/ })).toBeTruthy();
  expect(screen.getByText('Medium confidence')).toBeTruthy();
  expect(screen.getByText(/verified/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /SolidWorks/ }));
  expect(screen.getByText('Modelled the wheel hub.')).toBeTruthy();
});

test('a teammate can endorse at a level; it is saved for that member and skill', async () => {
  skillsApi.member.mockResolvedValue({ hidden: false, githubLinked: true, notice: 'x', groups: [{ name: 'CAD', skills: [skill()] }] });
  skillsApi.endorse.mockResolvedValue({ ok: true });
  render(<MemberSkillsCard memberId="m2" displayName="Bo Tester" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Endorse' }));
  fireEvent.change(screen.getByLabelText('Level you have seen'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(skillsApi.endorse).toHaveBeenCalledWith({ memberId: 'm2', skillId: 's1', level: 4 }));
});

test('respects a member who keeps skills private', async () => {
  skillsApi.member.mockResolvedValue({ hidden: true, githubLinked: false, notice: 'x', groups: [] });
  render(<MemberSkillsCard memberId="m2" displayName="Bo Tester" />);
  expect(await screen.findByText('Bo keeps their skills private.')).toBeTruthy();
});
