import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatComposer from './ChatComposer';
import { get, sendChatMessage, uploadChatFile } from '../../../api/clubPmClient';

jest.mock('../../../clubpm/ClubPmAuth', () => ({
  useClubPmAuth: () => ({ member: { id: 'me', slackCapabilities: { post: true, files: true } } }),
}));
jest.mock('../../../api/clubPmClient', () => ({
  get: jest.fn().mockResolvedValue([]),
  apiBaseUrl: '',
  sendChatMessage: jest.fn(),
  uploadChatFile: jest.fn(),
  joinConversation: jest.fn(),
}));

const conversation = { canPost: true, kind: 'CHANNEL' };

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue([{ id: 'sam', displayName: 'Sam Test', slackId: 'U_SAM' }]);
});

test('failed send retains the draft and exposes an explicit retry', async () => {
  sendChatMessage.mockRejectedValueOnce(new Error('Slack is temporarily unavailable'))
    .mockResolvedValueOnce({ ts: '2.0' });
  render(<ChatComposer channelId="failed-send" conversation={conversation} placeholder="Message test" />);

  const field = screen.getByLabelText('Message test');
  fireEvent.change(field, { target: { value: 'keep this draft' } });
  fireEvent.click(screen.getByLabelText('Send'));

  expect(await screen.findByRole('alert')).toHaveTextContent('Slack is temporarily unavailable');
  expect(field).toHaveValue('keep this draft');
  fireEvent.click(screen.getByText('Retry'));
  await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(field).toHaveValue(''));
});

test('failed attachment upload keeps a retryable File and leaves controls available', async () => {
  uploadChatFile.mockRejectedValueOnce(new Error('Upload failed')).mockResolvedValueOnce({ ok: true });
  render(<ChatComposer channelId="failed-file" conversation={conversation} />);
  const file = new File(['fixture'], 'fixture.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Choose attachment'), { target: { files: [file] } });

  expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed');
  expect(screen.getByLabelText('Attach a file')).toBeEnabled();
  fireEvent.click(screen.getByText('Retry'));
  await waitFor(() => expect(uploadChatFile).toHaveBeenCalledTimes(2));
  expect(uploadChatFile.mock.calls[1][1]).toBe(file);
});

test('draft mentions and failed-send retry survive leaving and reopening the conversation', async () => {
  sendChatMessage.mockRejectedValueOnce(new Error('Fixture offline')).mockResolvedValueOnce({ ts: '3.0' });
  const view = render(<ChatComposer channelId="retained-mention" conversation={conversation} />);
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: '@Sa', selectionStart: 3 } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: 'Sam Test' }));
  view.unmount();
  const { unmount } = render(<ChatComposer channelId="retained-mention" conversation={conversation} />);
  expect(screen.getByLabelText('Message')).toHaveValue('@Sam Test ');
  fireEvent.click(screen.getByLabelText('Send'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Fixture offline');
  unmount();
  render(<ChatComposer channelId="retained-mention" conversation={conversation} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Fixture offline');
  fireEvent.click(screen.getByText('Retry'));
  await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(2));
  expect(sendChatMessage.mock.calls[1][1].text).toBe('<@U_SAM>');
  await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''));
});
