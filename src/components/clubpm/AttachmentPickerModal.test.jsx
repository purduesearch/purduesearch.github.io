import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AttachmentPickerModal from './AttachmentPickerModal';
import { get, getVault, listProjectRepos } from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({ get: jest.fn(), getVault: jest.fn(), listProjectRepos: jest.fn() }));
jest.mock('../../clubpm/layout/compactLayout', () => ({ useCompactLayout: () => false }));
jest.mock('./github/IssuePreviewModal', () => () => null);
jest.mock('./github/PrPreviewModal', () => () => null);
jest.mock('./DriveFolderBrowser', () => ({
  __esModule: true,
  default: ({ onToggle }) => <button onClick={() => onToggle({ id: 'drive1', name: 'Design notes', webViewLink: 'https://drive.google.com/file/d/drive1/view' })}>Select Drive notes</button>,
  driveItemUrl: file => file.webViewLink,
}));

beforeEach(() => {
  jest.clearAllMocks();
  listProjectRepos.mockResolvedValue({ repos: [{ id: 'repo1', slug: 'search/flight', defaultBranch: 'main' }] });
  getVault.mockResolvedValue({ items: [{ id: 'cad1', name: 'Sensor mount.step' }] });
  get.mockImplementation(url => Promise.resolve(url.includes('/issues') ? { issues: [{ number: 12, title: 'Calibrate sensor' }] }
    : url.includes('/branches') ? { branches: [{ name: 'feature/sensor' }] }
    : url.includes('path=src') ? { kind: 'dir', entries: [{ type: 'file', name: 'sensor.js', path: 'src/sensor.js' }] }
    : { kind: 'dir', entries: [{ type: 'dir', name: 'src', path: 'src' }] }));
});

function open(onAdd = jest.fn(), onClose = jest.fn()) {
  render(<AttachmentPickerModal projectId="p1" onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose };
}

test('keeps selections across sources and returns persisted URL and label pairs', async () => {
  const { onAdd } = open();
  fireEvent.click(screen.getByText('Select Drive notes'));
  fireEvent.click(screen.getByRole('button', { name: 'CAD vault' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sensor mount.step' }));
  fireEvent.click(screen.getByRole('button', { name: 'Issues', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: '#12 Calibrate sensor' }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach 3' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith([
    { url: 'https://drive.google.com/file/d/drive1/view', label: 'Design notes' },
    { url: expect.stringContaining('vaultItem=cad1'), label: 'Sensor mount.step' },
    { url: 'https://github.com/search/flight/issues/12', label: '#12 Calibrate sensor' },
  ]));
});

test('browses GitHub folders and attaches a file instead of the folder', async () => {
  const { onAdd } = open();
  fireEvent.click(screen.getByRole('button', { name: 'GitHub files' }));
  fireEvent.click(await screen.findByRole('button', { name: 'src', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'sensor.js' }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach 1' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ url: 'https://github.com/search/flight/blob/main/src/sensor.js', label: 'sensor.js' }));
});

test.each([['Branches', 'feature/sensor', 'https://github.com/search/flight/tree/feature%2Fsensor'], ['Repositories', 'search/flight', 'https://github.com/search/flight']])('attaches %s', async (source, label, url) => {
  const { onAdd } = open();
  fireEvent.click(screen.getByRole('button', { name: source, exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: label, exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach 1' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ url, label }));
});

test('rejects unsafe URLs and prevents repeated submissions while saving', async () => {
  let resolve;
  const onAdd = jest.fn(() => new Promise(r => { resolve = r; }));
  const { onClose } = open(onAdd);
  fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }));
  const input = await screen.findByLabelText('URL');
  fireEvent.change(input, { target: { value: 'data:text/plain,unsafe' } });
  expect(screen.getByRole('button', { name: 'Attach link' })).toBeDisabled();
  fireEvent.change(input, { target: { value: 'https://github.com/search/flight' } });
  const attach = screen.getByRole('button', { name: 'Attach link' });
  fireEvent.click(attach); fireEvent.click(attach);
  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  resolve();
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

test('keeps the selection and dialog open after a failed attachment save', async () => {
  const { onClose } = open(jest.fn().mockRejectedValue(new Error('Please retry')));
  fireEvent.click(screen.getByText('Select Drive notes'));
  fireEvent.click(screen.getByRole('button', { name: 'Attach 1' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please retry');
  expect(onClose).not.toHaveBeenCalled();
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Attach 1' })).toBeEnabled();
});

test('shows a retry action after the connected source fails', async () => {
  getVault.mockRejectedValueOnce(new Error('Vault unavailable'));
  open();
  fireEvent.click(screen.getByRole('button', { name: 'CAD vault' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Vault unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Sensor mount.step' })).toBeInTheDocument();
});


test('submitting a pasted link never submits the surrounding task creation form', async () => {
  const createTask = jest.fn();
  const onAdd = jest.fn();
  render(<form onSubmit={createTask}><AttachmentPickerModal projectId="p1" onAdd={onAdd} onClose={jest.fn()} /></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }));
  const input = await screen.findByLabelText('URL');
  fireEvent.change(input, { target: { value: 'https://github.com/search/flight' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Attachment link' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
  expect(createTask).not.toHaveBeenCalled();
});

test('keeps task GitHub linking and creation actions inside Add attachments', async () => {
  render(<AttachmentPickerModal projectId="p1" task={{ id: 't1', projectId: 'p1' }} onAdd={jest.fn()} onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'GitHub actions', exact: true }));
  expect(await screen.findByRole('button', { name: 'Link issue', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create issue', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create branch', exact: true })).toBeInTheDocument();
});
