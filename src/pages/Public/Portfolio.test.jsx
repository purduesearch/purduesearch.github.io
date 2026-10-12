import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Portfolio from './Portfolio';
import { getPublicPortfolio } from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({ getPublicPortfolio: jest.fn() }));
jest.mock('../../components/SEOHead', () => () => null);

const portfolio = {
  slug: 'alice', name: 'Alice Example', avatarUrl: null, title: 'Structures Lead', bio: 'Builds rovers', headline: 'Mechanical and CAD',
  generatedNote: 'Skill levels are advisory estimates built from a team member\'s project work, not formal certifications.',
  groups: [{
    name: 'Mechanical Engineering',
    skills: [{
      name: 'SolidWorks', type: 'tool', level: 4, confidence: 'HIGH', lastDemonstrated: '2026-09', trend: 'STABLE', verifiedByLead: true, peerEndorsed: false,
      evidence: [{ summary: 'Modelled the antenna bracket.', source: 'cad', date: '2026-09-10', project: 'Rover', link: null }],
    }],
  }],
};

const renderAt = (slug = 'alice') => render(
  <MemoryRouter initialEntries={[`/portfolio/${slug}`]}>
    <Routes><Route path="/portfolio/:slug" element={<Portfolio />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => jest.clearAllMocks());

test('renders the allow-listed portfolio with level, confidence and linked work', async () => {
  getPublicPortfolio.mockResolvedValue(portfolio);
  renderAt();
  expect(await screen.findByRole('heading', { name: 'Alice Example' })).toBeTruthy();
  expect(screen.getByText('SolidWorks')).toBeTruthy();
  expect(screen.getByRole('img', { name: /Level 4 of 5, Advanced/ })).toBeTruthy();
  expect(screen.getByText(/High confidence/)).toBeTruthy();
  expect(screen.getByText('Verified by a team lead')).toBeTruthy();
  expect(screen.getByText('Modelled the antenna bracket.')).toBeTruthy();
  expect(screen.getByText(/advisory estimates/)).toBeTruthy();
  expect(getPublicPortfolio).toHaveBeenCalledWith('alice');
});

test('a missing or switched-off portfolio looks the same: not found', async () => {
  getPublicPortfolio.mockResolvedValue(null);
  renderAt('nobody');
  expect(await screen.findByText('Portfolio not found')).toBeTruthy();
});

test('a server failure says so without leaking details', async () => {
  getPublicPortfolio.mockRejectedValue(new Error('boom: stack trace'));
  renderAt();
  expect(await screen.findByText(/could not be loaded right now/)).toBeTruthy();
  expect(screen.queryByText(/boom/)).toBeNull();
});

test('only http(s) work links are rendered as links', async () => {
  const bad = JSON.parse(JSON.stringify(portfolio));
  bad.groups[0].skills[0].evidence[0].link = 'javascript:alert(1)';
  getPublicPortfolio.mockResolvedValue(bad);
  renderAt();
  await screen.findByText('Modelled the antenna bracket.');
  expect(screen.queryByRole('link', { name: 'view' })).toBeNull();
});

test('a portfolio with nothing shared says so', async () => {
  getPublicPortfolio.mockResolvedValue({ ...portfolio, groups: [] });
  renderAt();
  expect(await screen.findByText(/No skills are shared/)).toBeTruthy();
});
