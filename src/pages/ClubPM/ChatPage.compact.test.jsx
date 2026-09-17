import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ChatPage from './ChatPage';
import { getConversation, listConversations } from '../../api/clubPmClient';

let mockCompact = true;

jest.mock('../../clubpm/layout/compactLayout', () => ({
  useCompactLayout: () => mockCompact,
}));
jest.mock('../../api/clubPmClient', () => ({
  listConversations: jest.fn(),
  getConversation: jest.fn(),
}));
jest.mock('../../components/clubpm/chat/ChatConversation', () => function ConversationProbe(props) {
  return (
    <div data-testid="conversation">
      <div data-testid="thread-value">{props.initialThreadTs || 'none'}</div>
      <button type="button" onClick={() => props.onOpenThread?.('100.200')}>Open thread</button>
      <button type="button" onClick={() => props.onCloseThread?.()}>Close thread</button>
    </div>
  );
});

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="location">{location.pathname}{location.search}</output>
      <button type="button" onClick={() => navigate(1)}>Forward</button>
    </div>
  );
}

function renderPage(entry = '/clubpm/chat') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/clubpm/chat" element={<ChatPage />} />
        <Route path="/clubpm/chat/:channelId" element={<ChatPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

const channelData = {
  channels: [
    { slackChannelId: 'C1', name: 'general', kind: 'CHANNEL', isMember: true, unread: 2, muted: false },
    { slackChannelId: 'C2', name: 'public-preview', kind: 'CHANNEL', isMember: false, unread: 0, muted: false },
  ],
};

beforeEach(() => {
  mockCompact = true;
  jest.clearAllMocks();
  listConversations.mockResolvedValue(channelData);
  getConversation.mockResolvedValue({ name: 'general', kind: 'CHANNEL', isParticipant: true, canPost: true });
});

test('phone chat root remains on the channel-list landing screen', async () => {
  renderPage();
  expect(await screen.findByText('People & DMs')).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('/clubpm/chat');
  expect(getConversation).not.toHaveBeenCalled();
});

test('desktop chat root retains first-channel redirect', async () => {
  mockCompact = false;
  renderPage();
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/clubpm/chat/C1'));
  expect(await screen.findByTestId('conversation')).toBeInTheDocument();
});

test('a direct phone channel link opens the requested conversation', async () => {
  renderPage('/clubpm/chat/C2');
  expect(await screen.findByTestId('conversation')).toBeInTheDocument();
  expect(getConversation).toHaveBeenCalledWith('C2');
});

test('phone thread uses URL history and Back/Forward restoration', async () => {
  renderPage('/clubpm/chat/C1');
  await screen.findByTestId('conversation');
  fireEvent.click(screen.getByText('Open thread'));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('thread=100.200'));
  expect(screen.getByTestId('thread-value')).toHaveTextContent('100.200');

  fireEvent.click(screen.getByText('Close thread'));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/clubpm/chat/C1'));
  expect(screen.getByTestId('location')).not.toHaveTextContent('thread=');

  fireEvent.click(screen.getByText('Forward'));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('thread=100.200'));
});
