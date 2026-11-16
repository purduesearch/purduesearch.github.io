import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CareerPrint from './CareerPrint';
import { careerApi } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';

jest.mock('../../clubpm/ClubPmAuth', () => ({ useClubPmAuth: jest.fn() }));
jest.mock('../../api/clubPmClient', () => ({ careerApi: { me: jest.fn() } }));

const b = o => ({ sourceKind: 'METRIC', shareable: true, pending: false, selected: true, hidden: false, ...o });
const data = {
  profile: { headline: 'Builder', major: 'AAE', gradTerm: '2028-05', openTo: ['COOP'] },
  targets: [{ code: '17-2011.00', title: 'Aerospace Engineers' }],
  bullets: [
    b({ key: 'a', text: 'Merged 12 pull requests.' }),
    b({ key: 'p', text: 'Pending claim bullet.', pending: true }),
    b({ key: 'u', text: 'Unticked bullet.', selected: false }),
    b({ key: 's', text: 'Unshareable bullet.', shareable: false }),
  ],
  certifications: [{ name: 'Safety', issuer: 'Club', date: '2026' }],
  skills: ['CAD', 'Python'],
  attribution: 'O*NET attribution',
};
const mount = () => render(<MemoryRouter initialEntries={['/clubpm/career/print']}><Routes>
  <Route path="/clubpm/career/print" element={<CareerPrint />} />
  <Route path="/clubpm/login" element={<p>login page</p>} />
</Routes></MemoryRouter>);
beforeEach(() => { jest.clearAllMocks(); careerApi.me.mockResolvedValue(data); });

test('renders only exportable bullets, skills and no nav', async () => {
  useClubPmAuth.mockReturnValue({ member: { id: 'm', displayName: 'Ada Lovelace' }, loading: false });
  mount();
  expect(await screen.findByText('Merged 12 pull requests.')).toBeTruthy();
  expect(screen.queryByText('Pending claim bullet.')).toBeNull();
  expect(screen.queryByText('Unticked bullet.')).toBeNull();
  expect(screen.queryByText('Unshareable bullet.')).toBeNull();
  expect(screen.getByText('CAD · Python')).toBeTruthy();
  expect(screen.getByText('Ada Lovelace')).toBeTruthy();
  expect(screen.getByText('O*NET attribution')).toBeTruthy();
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.getByRole('button', { name: /Print/ })).toBeTruthy();
});

test('redirects to login when signed out', () => {
  useClubPmAuth.mockReturnValue({ member: null, loading: false });
  mount();
  expect(screen.getByText('login page')).toBeTruthy();
  expect(careerApi.me).not.toHaveBeenCalled();
});

test('shows loading while auth resolves', () => {
  useClubPmAuth.mockReturnValue({ member: null, loading: true });
  mount();
  expect(screen.getByText('Loading…')).toBeTruthy();
});
