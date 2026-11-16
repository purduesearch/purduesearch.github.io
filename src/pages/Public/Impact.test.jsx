import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Impact from './Impact';

jest.mock('../../components/SEOHead', () => () => null);
jest.mock('../../components/Navbar', () => () => null);
jest.mock('../../components/Footer', () => () => null);
jest.mock('../../api/clubPmClient', () => ({ apiBaseUrl: '' }));

const payload = {
  floor: 3,
  totals: [
    { id: 'lab_hours', label: 'Lab time', unitSingular: 'hour', unitPlural: 'hours', total: 1234, contributors: 9 },
    { id: 'prs_merged', label: 'Merged pull requests', unitSingular: 'PR', unitPlural: 'PRs', total: null, contributors: null },
  ],
  tools: [{ name: 'Dassault Systemes SolidWorks', members: 4 }],
  featured: [{ name: 'Ada L.', major: 'ME', gradTerm: '2028-05', targets: [{ code: '17-2141.00', title: 'Mechanical Engineers' }], bullets: ['Released 6 CAD items'] }],
  attribution: 'O*NET 31.0 Database by USDOL/ETA',
};
const renderPage = () => render(<MemoryRouter><Impact /></MemoryRouter>);
const respond = (ok, body) => { global.fetch = jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body }); };

afterEach(() => { delete global.fetch; });

test('renders totals, tools and cards, and hides null totals', async () => {
  respond(true, payload);
  renderPage();
  expect(await screen.findByText('1,234')).toBeTruthy();
  expect(screen.getByText('Lab time')).toBeTruthy();
  expect(screen.queryByText('Merged pull requests')).toBeNull();
  expect(screen.getByText(/fewer than 3 members/)).toBeTruthy();
  expect(screen.getByText('Dassault Systemes SolidWorks')).toBeTruthy();
  expect(screen.getByText('Ada L.')).toBeTruthy();
  expect(screen.getByText('Released 6 CAD items')).toBeTruthy();
  expect(screen.getByText(/O\*NET 31.0/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Sponsor or hire' }).getAttribute('href')).toBe('/sponsors');
  expect(screen.queryByText('0')).toBeNull();
});

test('shows an empty state when nothing clears the floor', async () => {
  respond(true, { floor: 3, totals: [], tools: [], featured: [], attribution: '' });
  renderPage();
  expect(await screen.findByText(/once enough members have work on record/)).toBeTruthy();
});

test('shows an error state when the request fails', async () => {
  respond(false, {});
  renderPage();
  expect(await screen.findByRole('alert')).toBeTruthy();
});
