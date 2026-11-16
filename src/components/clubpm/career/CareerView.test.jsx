import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CareerView from './CareerView';
import { careerApi } from '../../../api/clubPmClient';

jest.mock('../../../clubpm/ClubPmAuth', () => ({ useClubPmAuth: () => ({ member: { id: 'm1', displayName: 'Ada Lovelace' } }) }));
jest.mock('../../../api/clubPmClient', () => ({ careerApi: { me: jest.fn(), setBullet: jest.fn(), recompute: jest.fn(), intros: jest.fn(), respondIntro: jest.fn(), downloadResumeJson: jest.fn() } }));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const bullet = (o) => ({ sourceKind: 'METRIC', claimId: null, shareable: true, pending: false, selected: true, hidden: false, order: 0, ...o });
const fixture = (over = {}) => ({
  profile: { headline: null, shareWithSponsors: false },
  targets: [{ code: '17-2141.00', title: 'Mechanical Engineers', position: 0 }],
  snapshots: [
    { metricId: 'prs_merged', label: 'Authored pull requests merged', value: 12, unit: 'pull requests', proof: 'RECORDS', shareable: true, pending: false },
    { metricId: 'team_led', label: 'Other task assignees on largest led project', value: 4, unit: 'assignees', proof: 'CONFIRMED', shareable: false, pending: true },
  ],
  attestations: [{ id: 'c1', kind: 'CLAIM', status: 'PENDING', label: 'Raised sponsorship', value: 500, unit: 'USD', pending: true }],
  bullets: [
    bullet({ key: 'METRIC:prs_merged', sourceId: 'prs_merged', metricId: 'prs_merged', text: 'Authored 12 merged pull requests for club projects.', proof: 'RECORDS' }),
    bullet({ key: 'METRIC:team_led', sourceId: 'team_led', metricId: 'team_led', text: 'Led a project with 4 other task assignees.', proof: 'CONFIRMED', shareable: false, pending: true }),
    bullet({ key: 'ATTESTATION:c1', sourceKind: 'ATTESTATION', sourceId: 'c1', claimId: 'c1', metricId: null, text: 'Raised sponsorship: 500 USD', proof: 'CLAIM', shareable: false, pending: true }),
  ],
  certifications: [], badges: { count: 0, items: [] }, attribution: 'O*NET attribution CC BY 4.0', ...over,
});
const mount = () => render(<MemoryRouter><CareerView /></MemoryRouter>);
beforeEach(() => { jest.clearAllMocks(); careerApi.me.mockResolvedValue(fixture()); careerApi.intros.mockResolvedValue({ intros: [] }); careerApi.setBullet.mockResolvedValue({ ok: true }); });

test('tiles show proof badges', async () => {
  mount();
  expect(await screen.findByText('Authored pull requests merged')).toBeTruthy();
  const tiles = within(screen.getByLabelText('Verified impact'));
  expect(tiles.getByText('Counted from records')).toBeTruthy();
  expect(tiles.getByText('Waiting for lead')).toBeTruthy();
  expect(tiles.getByText('Your claim · pending')).toBeTruthy();
  expect(screen.getByText('O*NET attribution CC BY 4.0')).toBeTruthy();
});

test('pending bullets are visible but excluded from the paper preview', async () => {
  mount();
  await screen.findByText('Authored pull requests merged');
  const paper = within(screen.getByTestId('career-paper'));
  expect(paper.getByText('Authored 12 merged pull requests for club projects.')).toBeTruthy();
  expect(paper.queryByText(/Raised sponsorship/)).toBeNull();
  expect(paper.queryByText(/Led a project/)).toBeNull();
  expect(screen.getByText('Raised sponsorship: 500 USD')).toBeTruthy();
});

test('template editor blocks save without {n}', async () => {
  mount();
  await screen.findByText('Authored pull requests merged');
  fireEvent.click(screen.getAllByText('Edit wording')[0]);
  const box = screen.getByLabelText(/Wording/);
  fireEvent.change(box, { target: { value: 'No number here' } });
  expect(screen.getByRole('alert').textContent).toMatch(/\{n\}/);
  expect(screen.getByRole('button', { name: 'Save wording' }).disabled).toBe(true);
  fireEvent.change(box, { target: { value: 'Shipped {n} merged PRs' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save wording' }));
  await waitFor(() => expect(careerApi.setBullet).toHaveBeenCalledWith('METRIC', 'prs_merged', { template: 'Shipped {n} merged PRs' }));
});

test('toggling include calls the bullet API', async () => {
  mount();
  await screen.findByText('Authored pull requests merged');
  fireEvent.click(screen.getByLabelText('Include: Authored 12 merged pull requests for club projects.'));
  await waitFor(() => expect(careerApi.setBullet).toHaveBeenCalledWith('METRIC', 'prs_merged', { included: false }));
});

test('no LinkedIn button without badges', async () => {
  mount();
  await screen.findByText('Authored pull requests merged');
  expect(screen.queryByText(/LinkedIn/)).toBeNull();
});

test('LinkedIn link appears for a badge', async () => {
  careerApi.me.mockResolvedValue(fixture({ badges: { count: 1, items: [{ achievementId: 'trainer', name: 'Trainer', issuedAt: '2026-10-01T00:00:00Z' }] } }));
  mount();
  expect(await screen.findByText(/Add to LinkedIn profile/)).toBeTruthy();
});

test('error state retries', async () => {
  careerApi.me.mockRejectedValueOnce(new Error('x'));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Authored pull requests merged')).toBeTruthy();
  expect(careerApi.me).toHaveBeenCalledTimes(2);
});

test('DWA line and skill names render from the API', async () => {
  const f = fixture({ skills: ['Python', 'SolidWorks'] });
  f.snapshots[0] = { ...f.snapshots[0], dwaId: '4.A.2.b.2.b.1', dwaTitle: 'Develop software or computer applications.' };
  careerApi.me.mockResolvedValue(f);
  mount();
  await screen.findByText('Authored pull requests merged');
  expect(screen.getByText('4.A.2.b.2.b.1')).toBeTruthy();
  expect(screen.getByText(/Develop software or computer applications/)).toBeTruthy();
  expect(within(screen.getByTestId('career-paper')).getByText(/Python · SolidWorks/)).toBeTruthy();
});

test('an intro fetch failure does not break the career view', async () => {
  careerApi.intros.mockRejectedValue(new Error('down'));
  mount();
  expect(await screen.findByText('Authored pull requests merged')).toBeTruthy();
  expect(await screen.findByText(/could not be loaded/i, { selector: '.pm-career-intro-state' })).toBeTruthy();
});
