import { act, screen, fireEvent } from '@testing-library/react';
import * as client from '../../../api/clubPmClient';
import { pickFromAlbums } from './AlbumPhotoPicker';

jest.mock('react-hot-toast', () => {
  const toast = () => {};
  toast.success = () => {};
  toast.error = () => {};
  return { __esModule: true, default: toast };
});

jest.mock('../../../api/clubPmClient', () => ({
  listPhotoAlbums: jest.fn(),
  addPhotoAlbum: jest.fn(),
  removePhotoAlbum: jest.fn(),
  getPhotoAlbumPhotos: jest.fn(),
  importAlbumPhotos: jest.fn(),
}));

const ALBUM = { id: 'a1', title: 'Launch day', shareUrl: 'https://photos.app.goo.gl/x', coverThumbUrl: null, photoCount: 3, addedBy: { displayName: 'Sam' }, canRemove: true };
const PHOTOS = ['p1', 'p2', 'p3'].map((id) => ({ id, thumbUrl: `https://lh3.googleusercontent.com/${id}`, width: 10, height: 10, takenAt: null, isVideo: false }));

// CRA runs Jest with resetMocks, so implementations are set per test.
beforeEach(() => {
  client.listPhotoAlbums.mockResolvedValue([ALBUM]);
  client.getPhotoAlbumPhotos.mockResolvedValue({ album: ALBUM, photos: PHOTOS, truncated: false });
});

test('opens an album, imports the chosen photos in pick order', async () => {
  const result = { images: [{ url: 'u3' }, { url: 'u1' }], missing: 0, failed: 0 };
  client.importAlbumPhotos.mockResolvedValue(result);

  let promise;
  act(() => { promise = pickFromAlbums({ maxItems: 5, target: 'asset', tags: ['x'] }); });
  fireEvent.click(await screen.findByRole('button', { name: /^Launch day/ }));

  const photoButtons = await screen.findAllByRole('button', { name: 'Photo' });
  fireEvent.click(photoButtons[2]);
  fireEvent.click(photoButtons[0]);
  expect(photoButtons[2]).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Import 2 photos' }));

  await expect(promise).resolves.toEqual(result);
  expect(client.importAlbumPhotos).toHaveBeenCalledWith('a1', { photoIds: ['p3', 'p1'], target: 'asset', tags: ['x'] });
});

test('single-photo pick replaces the selection', async () => {
  client.importAlbumPhotos.mockResolvedValue({ images: [{ url: 'u2' }], missing: 0, failed: 0 });
  let promise;
  act(() => { promise = pickFromAlbums(); });
  fireEvent.click(await screen.findByRole('button', { name: /^Launch day/ }));
  const photoButtons = await screen.findAllByRole('button', { name: 'Photo' });
  fireEvent.click(photoButtons[0]);
  fireEvent.click(photoButtons[1]);
  expect(photoButtons[0]).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Use photo' }));
  await promise;
  expect(client.importAlbumPhotos).toHaveBeenCalledWith('a1', { photoIds: ['p2'], target: 'blog', tags: undefined });
});

test('adding a link saves the album and opens it', async () => {
  client.listPhotoAlbums.mockResolvedValue([]);
  const added = { ...ALBUM, id: 'a2', title: 'New album' };
  client.addPhotoAlbum.mockResolvedValue(added);

  let promise;
  act(() => { promise = pickFromAlbums(); });
  await screen.findByText(/No albums yet/);
  fireEvent.change(screen.getByLabelText('Shared album link'), { target: { value: ' https://photos.app.goo.gl/abc ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add album' }));

  await screen.findAllByRole('button', { name: 'Photo' });
  expect(client.addPhotoAlbum).toHaveBeenCalledWith('https://photos.app.goo.gl/abc', undefined);
  expect(client.getPhotoAlbumPhotos).toHaveBeenCalledWith('a2', { refresh: false });

  fireEvent.keyDown(window, { key: 'Escape' });
  await expect(promise).resolves.toBeNull();
});

test('a rejected link shows the server message', async () => {
  client.addPhotoAlbum.mockRejectedValue(new Error('That is a private album link.'));
  let promise;
  act(() => { promise = pickFromAlbums(); });
  await screen.findByRole('button', { name: /^Launch day/ });
  fireEvent.change(screen.getByLabelText('Shared album link'), { target: { value: 'https://photos.google.com/album/x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add album' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('private album link');

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await expect(promise).resolves.toBeNull();
});

test('a second call while one is open returns the same flow', async () => {
  let first;
  let second;
  act(() => {
    first = pickFromAlbums();
    second = pickFromAlbums();
  });
  expect(second).toBe(first);
  await screen.findByRole('button', { name: /^Launch day/ });
  fireEvent.keyDown(window, { key: 'Escape' });
  await expect(first).resolves.toBeNull();
});
