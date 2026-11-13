import { fireEvent, render, screen } from '@testing-library/react';
import DmInbox from './DmInbox';
import { listConversations, importMyDms } from '../../../api/clubPmClient';

jest.mock('../../../clubpm/ClubPmAuth', () => ({
  useClubPmAuth: () => ({ member: { id: 'member1', slackCapabilities: { read: true } } }),
}));
jest.mock('../../../api/clubPmClient', () => ({
  listConversations: jest.fn(),
  importMyDms: jest.fn(),
  get: jest.fn(), apiBaseUrl: '', sendChatMessage: jest.fn(), uploadChatFile: jest.fn(), joinConversation: jest.fn(),
}));

beforeEach(() => {
  sessionStorage.clear();
  importMyDms.mockResolvedValue({ conversations: 0, started: true });
  listConversations.mockResolvedValue({
    dms: [
      { slackChannelId: 'D1', kind: 'IM', participants: [{ slackId: 'U1', displayName: 'In project' }], unread: 1, muted: false },
      { slackChannelId: 'D2', kind: 'IM', participants: [{ slackId: 'U2', displayName: 'Outside project' }], unread: 0, muted: false },
    ],
  });
});
afterEach(() => sessionStorage.clear());

test('project DM inbox uses the supplied roster scope without a second store', async () => {
  const onOpen = jest.fn();
  render(<DmInbox projectId="project1" onOpen={onOpen} slackIdFilter={new Set(['U1'])} />);
  fireEvent.click(await screen.findByText('In project'));
  expect(screen.queryByText('Outside project')).not.toBeInTheDocument();
  expect(onOpen).toHaveBeenCalledWith('D1');
  expect(listConversations).toHaveBeenCalledTimes(1);
  expect(listConversations).toHaveBeenCalledWith('project1');
  expect(importMyDms).toHaveBeenCalledWith('project1');
  expect(sessionStorage.getItem('cpm.dms.imported.member1.project1')).toBe('1');
});
