import { act, fireEvent, render, screen, within } from '@testing-library/react';
import DriveFolderBrowser from './DriveFolderBrowser';
import AttachmentPickerModal from './AttachmentPickerModal';
import { get } from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({ get: jest.fn() }));

const folder = { id: 'subfolder', name: 'Research', mimeType: 'application/vnd.google-apps.folder' };
const doc = { id: 'document', name: 'Design notes', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-09-01T12:00:00Z' };
const pdf = { id: 'pdf', name: 'Test report.pdf', mimeType: 'application/pdf', modifiedTime: '2026-09-20T12:00:00Z' };
const root = { folderName: 'Bioastronautics', files: [pdf, doc, folder] };

beforeEach(() => get.mockReset());

test('browses subfolders with one click, returns through breadcrumbs, and previews files', async () => {
  get.mockImplementation(url => Promise.resolve(url.includes('folderId=') ? { folderName: 'Research', files: [doc] } : root));
  const onPreview = jest.fn();
  render(<DriveFolderBrowser projectId="p1" onPreview={onPreview} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open folder Research' }));
  await screen.findByText('1 item');
  expect(get).toHaveBeenLastCalledWith('/api/projects/p1/drive-files?folderId=subfolder');
  expect(screen.getByRole('link', { name: 'Open current folder in Drive' })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/subfolder');
  fireEvent.click(screen.getByRole('button', { name: 'Preview Design notes' }));
  expect(onPreview).toHaveBeenCalledWith({ url: 'https://docs.google.com/document/d/document/edit', label: 'Design notes' });
  fireEvent.click(screen.getByRole('button', { name: 'Bioastronautics' }));
  await screen.findByRole('button', { name: 'Open folder Research' });
  expect(get).toHaveBeenLastCalledWith('/api/projects/p1/drive-files');
});

test('searches the current folder, clears no matches, sorts files and keeps folders first', async () => {
  get.mockResolvedValue(root);
  render(<DriveFolderBrowser projectId="p1" />);
  const list = await screen.findByRole('list', { name: 'Folder contents' });
  expect(within(list).getAllByRole('button')[0]).toHaveAccessibleName('Open folder Research');
  expect(within(list).getAllByRole('button')[1]).toHaveAccessibleName('Preview Design notes');
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort files' }), { target: { value: 'modified' } });
  expect(within(list).getAllByRole('button')[1]).toHaveAccessibleName('Preview Test report.pdf');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'DESIGN' } });
  expect(screen.getByRole('button', { name: 'Preview Design notes' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open folder Research' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
  expect(screen.getByText('No matching files')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByRole('button', { name: 'Open folder Research' })).toBeInTheDocument();
});

test('keeps selections across folders and search when adding task attachments', async () => {
  get.mockImplementation(url => Promise.resolve(url.includes('folderId=') ? { folderName: 'Research', files: [doc] } : root));
  const onAdd = jest.fn();
  const onClose = jest.fn();
  render(<AttachmentPickerModal projectId="p1" onAdd={onAdd} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: /Browse folder/ }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Test report.pdf' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open folder Research' }));
  await screen.findByText('1 item');
  fireEvent.click(screen.getByRole('button', { name: 'Select file Design notes' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add 2' }));
  expect(onAdd).toHaveBeenCalledWith([
    { url: 'https://drive.google.com/file/d/pdf/view', label: 'Test report.pdf' },
    { url: 'https://docs.google.com/document/d/document/edit', label: 'Design notes' },
  ]);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('ignores stale folder results and allows retry and navigation after an error', async () => {
  let resolveSlow;
  get.mockResolvedValueOnce(root)
    .mockImplementationOnce(() => new Promise(resolve => { resolveSlow = resolve; }))
    .mockResolvedValueOnce(root)
    .mockRejectedValueOnce(new Error('Drive is unavailable'))
    .mockResolvedValueOnce(root);
  render(<DriveFolderBrowser projectId="p1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open folder Research' }));
  fireEvent.click(screen.getByRole('button', { name: 'Up one folder' }));
  await screen.findByText('3 items');
  await act(async () => resolveSlow({ folderName: 'Research', files: [] }));
  expect(screen.getByText('3 items')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh folder' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Drive is unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Open folder Research' });
});

test('explains unavailable contents and leaves Drive accessible', async () => {
  get.mockResolvedValue({ folderName: 'Bioastronautics', files: [] });
  render(<DriveFolderBrowser projectId="p1" driveLink="https://drive.google.com/drive/folders/root" />);
  expect(await screen.findByText('No files to show')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open current folder in Drive' })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/root');
});
