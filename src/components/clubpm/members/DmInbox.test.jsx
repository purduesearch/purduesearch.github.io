import { fireEvent, render, screen } from '@testing-library/react';
import DmInbox from './DmInbox';
import { listConversations } from '../../../api/clubPmClient';

jest.mock('../../../clubpm/ClubPmAuth', () => ({
  useClubPmAuth: () => ({ member: { slackCapabilities: { read: true } } }),
}));
jest.mock('../../../api/clubPmClient', () => ({
  listConversations: jest.fn(),
  importMyDms: jest.fn().mockResolvedValue({ conversations: 0 }),
  get: jest.fn(), apiBaseUrl: '', sendChatMessage: jest.fn(), uploadChatFile: jest.fn(), joinConversation: jest.fn(),
}));

beforeEach(() => {
  sessionStorage.setItem('cpm.dms.imported', '1');
  listConversations.mockResolvedValue({
    dms: [
      { slackChannelId: 'D1', kind: 'IM', participants: [{ slackId: 'U1', displayName: 'In project' }], unread: 1, muted: false },
      { slackChannelId: 'D2', kind: 'IM', participants: [{ slackId: 'U2', displayName: 'Outside project' }], unread: 0, muted: false },
    ],
  });
});

test('project DM inbox uses the supplied roster scope without a second store', async () => {
  const onOpen = jest.fn();
  render(<DmInbox onOpen={onOpen} slackIdFilter={new Set(['U1'])} />);
  fireEvent.click(await screen.findByText('In project'));
  expect(screen.queryByText('Outside project')).not.toBeInTheDocument();
  expect(onOpen).toHaveBeenCalledWith('D1');
  expect(listConversations).toHaveBeenCalledTimes(1);
});
