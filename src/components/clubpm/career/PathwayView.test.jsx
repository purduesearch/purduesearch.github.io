import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PathwayView from './PathwayView';
import OccupationPicker from './OccupationPicker';
import SkillOnetSection from './SkillOnetSection';
import { careerApi } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  careerApi: { pathway: jest.fn(), demandSignals: jest.fn(), searchOccupations: jest.fn(), skillOnet: jest.fn(), setBullet: jest.fn() },
}));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const pathway = () => ({
  occupation: { code: '17-2141.00', title: 'Mechanical Engineers' },
  tools: [
    { example: 'SolidWorks', categoryId: '43232', hot: true, inDemand: true, status: 'demonstrated' },
    { example: 'ANSYS', categoryId: '43233', hot: false, inDemand: false, status: 'none' },
  ],
  skills: [{ elementId: '2.A.1', name: 'Critical Thinking', importance: 4, status: 'learning', notInferred: false }],
  activities: [],
  emerging: [{ id: 'e1', task: 'Use additive manufacturing', category: 'Emerging', tasks: [{ id: 't1', title: 'Print bracket', projectId: 'p9', projectName: 'ARES', sharedTokens: [] }] }],
  related: [{ code: '17-2011.00', title: 'Aerospace Engineers', tier: 'Within reach' }],
});
const signals = [
  { id: 'a', title: 'CAD demand', summary: 'Up', sourceName: 'Source A', sourceUrl: 'https://example.com/a', publishedOn: '2026-05-01', metricIds: ['prs_merged'] },
  { id: 'b', title: 'Other', summary: 'Flat', sourceName: 'Source B', sourceUrl: 'https://example.com/b', publishedOn: '2026-05-02', metricIds: ['zzz'] },
];
const snaps = [{ metricId: 'prs_merged', label: 'merged pull requests', value: 12 }];
const mount = () => render(<MemoryRouter><PathwayView code="17-2141.00" snapshots={snaps} attribution="O*NET attr" onBack={() => {}} /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  careerApi.pathway.mockResolvedValue(pathway());
  careerApi.demandSignals.mockResolvedValue({ signals, attribution: 'x' });
});

test('tools show flags and text status; importance bar width; no score text', async () => {
  const { container } = mount();
  expect(await screen.findByText('SolidWorks')).toBeTruthy();
  expect(screen.getByText('HOT')).toBeTruthy();
  expect(screen.getByText('IN DEMAND')).toBeTruthy();
  expect(screen.getByText('Demonstrated')).toBeTruthy();
  expect(screen.getByText('No evidence yet')).toBeTruthy();
  expect(screen.getByTestId('imp-bar').style.width).toBe('80%');
  expect(container.textContent).not.toMatch(/%|match score|overall/i);
  expect(screen.getByText('O*NET attr')).toBeTruthy();
});

test('emerging tasks link to the project', async () => {
  mount();
  const link = await screen.findByRole('link', { name: 'Print bracket' });
  expect(link.getAttribute('href')).toBe('/clubpm/projects/p9');
});

test('signal proof line only when a metric matches, with safe external links', async () => {
  mount();
  await screen.findByText('CAD demand');
  expect(screen.getAllByText(/Your proof:/)).toHaveLength(1);
  expect(screen.getByText('Your proof: 12 merged pull requests')).toBeTruthy();
  const a = screen.getByRole('link', { name: 'Source A' });
  expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  expect(a.getAttribute('target')).toBe('_blank');
});

test('error shows retry', async () => {
  careerApi.pathway.mockRejectedValueOnce(new Error('x'));
  mount();
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('SolidWorks')).toBeTruthy();
});

describe('OccupationPicker', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const results = { results: [{ code: '17-2141.00', title: 'Mechanical Engineers' }] };

  test('debounced search then add', async () => {
    careerApi.searchOccupations.mockResolvedValue(results);
    const onAdd = jest.fn().mockResolvedValue();
    render(<OccupationPicker targets={[]} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('Search occupations'), { target: { value: 'me' } });
    expect(careerApi.searchOccupations).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(350); });
    expect(careerApi.searchOccupations).toHaveBeenCalledWith('me');
    const pick = await screen.findByRole('button', { name: /Mechanical Engineers/ });
    fireEvent.click(pick);
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('17-2141.00'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Mechanical Engineers/ })).toBeNull());
  });

  test('does not search under 2 characters; shows inline error on failed save', async () => {
    careerApi.searchOccupations.mockResolvedValue(results);
    const onAdd = jest.fn().mockRejectedValue(new Error('Unknown occupation code'));
    render(<OccupationPicker targets={[]} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('Search occupations'), { target: { value: 'm' } });
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(careerApi.searchOccupations).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Search occupations'), { target: { value: 'mech' } });
    await act(async () => { jest.advanceTimersByTime(350); });
    const pick = await screen.findByRole('button', { name: /Mechanical Engineers/ });
    fireEvent.click(pick);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Unknown occupation/);
    await waitFor(() => expect(screen.getByRole('button', { name: /Mechanical Engineers/ }).disabled).toBe(false));
  });

  test('caps at three targets', () => {
    const t = [{ code: 'a' }, { code: 'b' }, { code: 'c' }];
    render(<OccupationPicker targets={t} onAdd={jest.fn()} />);
    expect(screen.getByLabelText('Search occupations').disabled).toBe(true);
    expect(screen.getByText(/3 target roles/)).toBeTruthy();
  });
});

describe('SkillOnetSection', () => {
  const onet = (o = {}) => ({
    skill: { id: 's1', name: 'CAD' }, placement: [{ id: '1', name: 'Tools' }, { id: null, name: 'SolidWorks' }], links: [],
    demand: { hot: true, inDemandOccupations: 2, occupationsListed: 5, topOccupations: [{ code: 'a', title: 'A' }, { code: 'b', title: 'B' }] },
    numbers: [{ metricId: 'prs_merged', label: 'Merged PRs', value: 3, unit: 'pull requests' }],
    suggestedBullet: { metricId: 'prs_merged', text: 'Merged 3 PRs.', proof: 'RECORDS', shareable: true, pending: false },
    activities: [{ dwaId: '4.A.3', name: 'Design' }], attribution: 'attr', ...o,
  });

  test('renders crumb, demand, numbers and adds the bullet', async () => {
    careerApi.skillOnet.mockResolvedValue(onet());
    careerApi.setBullet.mockResolvedValue({});
    render(<SkillOnetSection skillId="s1" />);
    expect(await screen.findByRole('navigation', { name: 'O*NET placement' })).toBeTruthy();
    expect(screen.getByText('Listed for 5 O*NET occupations; employers flag it as in demand for 2, including A and B.')).toBeTruthy();
    expect(screen.getByText('Merged PRs')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add to résumé' }));
    await waitFor(() => expect(careerApi.setBullet).toHaveBeenCalledWith('METRIC', 'prs_merged', { included: true }));
  });

  test('pending bullet is disabled; empty data says not linked; error retries', async () => {
    careerApi.skillOnet.mockResolvedValueOnce(onet({ suggestedBullet: { metricId: 'm', text: 't', proof: 'CONFIRMED', shareable: false, pending: true } }));
    const { unmount } = render(<SkillOnetSection skillId="s1" />);
    expect((await screen.findByRole('button', { name: 'Waiting for verification' })).disabled).toBe(true);
    unmount();
    careerApi.skillOnet.mockResolvedValueOnce(onet({ placement: [], numbers: [], activities: [], suggestedBullet: null, demand: null }));
    const { unmount: unmountSecond } = render(<SkillOnetSection skillId="s2" />);
    expect(await screen.findByText('Not yet linked to O*NET.')).toBeTruthy();
    unmountSecond();
    careerApi.skillOnet.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(onet());
    render(<SkillOnetSection skillId="s3" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('navigation', { name: 'O*NET placement' })).toBeTruthy();
  });
});
