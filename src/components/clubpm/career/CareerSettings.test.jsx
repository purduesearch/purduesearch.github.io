import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CareerSettings from './CareerSettings';
import { careerApi } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  careerApi: { updateProfile: jest.fn(), createClaim: jest.fn(), deleteClaim: jest.fn() },
}));

const profile = { major: 'AAE', headline: null, gradTerm: null, availableFrom: null, openTo: [], shareWithSponsors: false, showOnPublicPage: false };
const claims = [
  { id: 'c1', label: 'Raised funds', value: 500, unit: 'USD', status: 'PENDING' },
  { id: 'c2', label: 'Taught people', value: 20, unit: 'people', status: 'VERIFIED' },
];
const mount = (props = {}) => render(<CareerSettings profile={profile} claims={claims} onSaved={jest.fn()} {...props} />);
beforeEach(() => { jest.clearAllMocks(); careerApi.updateProfile.mockResolvedValue({}); careerApi.createClaim.mockResolvedValue({}); careerApi.deleteClaim.mockResolvedValue({}); });

test('saves profile details', async () => {
  mount();
  fireEvent.change(screen.getByLabelText('Major'), { target: { value: 'ME' } });
  fireEvent.change(screen.getByLabelText(/Graduation term/), { target: { value: '2028-05' } });
  fireEvent.click(screen.getByLabelText('Co-op'));
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  await waitFor(() => expect(careerApi.updateProfile).toHaveBeenCalledWith({
    major: 'ME', headline: null, gradTerm: '2028-05', availableFrom: null, openTo: ['COOP'],
  }));
});

test('rejects a bad term client-side', () => {
  mount();
  fireEvent.change(screen.getByLabelText(/Graduation term/), { target: { value: 'May 2028' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  expect(screen.getByRole('alert').textContent).toMatch(/YYYY-MM/);
  expect(careerApi.updateProfile).not.toHaveBeenCalled();
});

test('sponsor sharing needs a confirm step; public toggle is independent', async () => {
  mount();
  fireEvent.click(screen.getByLabelText('Share with sponsors'));
  expect(careerApi.updateProfile).not.toHaveBeenCalled();
  const sponsorCopy = screen.getByRole('alertdialog').textContent;
  // Every field buildSponsorCard sends must be named in the consent copy.
  for (const field of [/first name and last initial/, /major/, /graduation term/, /headline/, /open to/, /available-from date/,
    /target roles/, /verified bullets/, /standard wording/, /certifications \(name and provider\)/, /badges .*verification links/]) {
    expect(sponsorCopy).toMatch(field);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Yes, turn it on' }));
  await waitFor(() => expect(careerApi.updateProfile).toHaveBeenCalledWith({ shareWithSponsors: true }));
  expect(careerApi.updateProfile).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByLabelText('Show on the public Impact page'));
  const publicCopy = screen.getByRole('alertdialog').textContent;
  // buildPublicCard: name, major, graduation term, target roles, bullets. Nothing else.
  for (const field of [/first name and last initial/, /major/, /graduation term/, /target roles/, /verified bullets/]) expect(publicCopy).toMatch(field);
  expect(publicCopy).toMatch(/will not see your headline, certifications, badges/);
  fireEvent.click(screen.getByRole('button', { name: 'Yes, turn it on' }));
  await waitFor(() => expect(careerApi.updateProfile).toHaveBeenCalledWith({ showOnPublicPage: true }));
});

test('turning sharing off is immediate', async () => {
  mount({ profile: { ...profile, shareWithSponsors: true } });
  fireEvent.click(screen.getByLabelText('Share with sponsors'));
  await waitFor(() => expect(careerApi.updateProfile).toHaveBeenCalledWith({ shareWithSponsors: false }));
});

test('claim form rejects non-https and posts a valid claim', async () => {
  mount();
  fireEvent.change(screen.getByLabelText('What did you do?'), { target: { value: 'Ran workshops' } });
  fireEvent.change(screen.getByLabelText('Number'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'people' } });
  fireEvent.change(screen.getByLabelText(/Evidence link/), { target: { value: 'http://example.com/x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
  expect(screen.getByRole('alert').textContent).toMatch(/https/);
  expect(careerApi.createClaim).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Evidence link/), { target: { value: 'https://example.com/x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
  await waitFor(() => expect(careerApi.createClaim).toHaveBeenCalledWith({ label: 'Ran workshops', value: 12, unit: 'people', evidenceUrl: 'https://example.com/x' }));
});

test('only pending claims can be deleted', async () => {
  mount();
  expect(screen.queryByLabelText('Delete claim: Taught people')).toBeNull();
  fireEvent.click(screen.getByLabelText('Delete claim: Raised funds'));
  await waitFor(() => expect(careerApi.deleteClaim).toHaveBeenCalledWith('c1'));
});

test('shows the server message on 400', async () => {
  careerApi.updateProfile.mockRejectedValue(new Error('major must be at most 100 characters.'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/at most 100/);
});
