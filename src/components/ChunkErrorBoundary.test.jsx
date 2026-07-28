import { render, screen } from '@testing-library/react';
import ChunkErrorBoundary from './ChunkErrorBoundary';
import ClubPmErrorBoundary from './clubpm/ErrorBoundary';

// A tab left open across a GitHub Pages deploy requests a chunk hash that no
// longer exists; webpack rejects the dynamic import with a ChunkLoadError.
function chunkError() {
  const err = new Error('Loading chunk 6528 failed.');
  err.name = 'ChunkLoadError';
  return err;
}

function Boom({ error }) {
  throw error;
}

let reloadCalls;
let errorSpy;

beforeEach(() => {
  reloadCalls = 0;
  sessionStorage.clear();
  delete window.location;
  window.location = { reload: () => { reloadCalls += 1; } };
  // React logs caught errors to console.error; keep the test output readable.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

test('reloads once on a chunk error, then shows the fallback instead of looping', () => {
  const first = render(
    <ChunkErrorBoundary>
      <Boom error={chunkError()} />
    </ChunkErrorBoundary>
  );
  expect(reloadCalls).toBe(1);
  first.unmount(); // stand in for the real reload tearing down the document

  // The reload lands on a fresh page: the boundary mounts again and the stale
  // chunk fails again. It must NOT reload a second time.
  render(
    <ChunkErrorBoundary>
      <Boom error={chunkError()} />
    </ChunkErrorBoundary>
  );
  expect(reloadCalls).toBe(1);
  expect(screen.getByText('This page needs a refresh')).toBeInTheDocument();
});

test('a chunk error inside the ClubPM boundary escalates instead of dead-ending', () => {
  render(
    <ChunkErrorBoundary>
      <ClubPmErrorBoundary>
        <Boom error={chunkError()} />
      </ClubPmErrorBoundary>
    </ChunkErrorBoundary>
  );

  expect(reloadCalls).toBe(1);
  expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
});

test('the ClubPM boundary still handles ordinary render errors itself', () => {
  render(
    <ChunkErrorBoundary>
      <ClubPmErrorBoundary>
        <Boom error={new Error('kaboom')} />
      </ClubPmErrorBoundary>
    </ChunkErrorBoundary>
  );

  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  expect(screen.getByText('kaboom')).toBeInTheDocument();
  expect(reloadCalls).toBe(0);
});
