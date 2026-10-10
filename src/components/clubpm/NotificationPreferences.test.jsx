import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationPreferences from './NotificationPreferences';
import { get, patch } from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({ get: jest.fn(), patch: jest.fn() }));
jest.mock('../OrbitLoader', () => () => null);
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  patch.mockResolvedValue({});
});

test('defaults to notifications off and saves explicit opt-in with quiet hours disabled', async () => {
  get.mockResolvedValue({});
  render(<NotificationPreferences />);
  const master = await screen.findByRole('checkbox', { name: 'Disable all notifications' });
  expect(master.checked).toBe(true);
  fireEvent.click(master);
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/api/members/me/notification-preferences', expect.objectContaining({
    notificationsDisabled: false, quietHoursStart: null, quietHoursEnd: null,
  })));
});

test('loads an opted-in member and can disable notifications without erasing category choices', async () => {
  get.mockResolvedValue({ notificationsDisabled: false, notificationChannels: { TASK_ASSIGNED: 'dashboard' } });
  render(<NotificationPreferences />);
  const master = await screen.findByRole('checkbox', { name: 'Disable all notifications' });
  expect(master.checked).toBe(false);
  fireEvent.click(master);
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/api/members/me/notification-preferences', expect.objectContaining({
    notificationsDisabled: true, notificationChannels: { TASK_ASSIGNED: 'dashboard' },
  })));
});
