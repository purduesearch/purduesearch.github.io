/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   These assert on what no accessible query reaches: which portal container a
   dialog rendered into, and `inert` on the app root. */
// Phase 4A: the Files/Vault/GitHub dialogs must fill a phone screen through the
// shared overlay stack, and must leave the desktop modals exactly as they were.
import { render, screen } from '@testing-library/react';
import VaultUploadModal from './VaultUploadModal';
import DrivePreviewModal from '../DrivePreviewModal';

let mockCompact = true;

jest.mock('../../../clubpm/layout/compactLayout', () => ({
  useCompactLayout: () => mockCompact,
  COMPACT_CLASS: 'pm-shell--compact',
}));
jest.mock('../../../api/clubPmClient', () => ({
  uploadVaultFile: jest.fn(),
  checkVaultDuplicates: jest.fn(),
}));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

describe('VaultUploadModal', () => {
  it('is a full-screen dialog on phones', () => {
    mockCompact = true;
    render(<VaultUploadModal project={{ id: 'p1' }} onClose={() => {}} onDone={() => {}} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('.pm-m-layer--fullscreen')).not.toBeNull();
    expect(document.getElementById('root')).toHaveAttribute('inert');
    // The check-in action itself is still present — the container changed, not
    // the operation.
    expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
  });

  it('keeps the desktop modal untouched', () => {
    mockCompact = false;
    const { container } = render(
      <VaultUploadModal project={{ id: 'p1' }} onClose={() => {}} onDone={() => {}} />
    );
    expect(document.querySelector('.cpm-modal-overlay')).not.toBeNull();
    expect(document.querySelector('.pm-m-layer')).toBeNull();
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
    expect(container).toBeTruthy();
  });
});

describe('DrivePreviewModal', () => {
  const url = 'https://drive.google.com/file/d/abc123/view';

  it('keeps the Open in Drive escape hatch in the phone dialog header', () => {
    mockCompact = true;
    render(<DrivePreviewModal url={url} label="Spec sheet" onClose={() => {}} />);

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Spec sheet');
    const link = screen.getByRole('link', { name: /open in drive/i });
    expect(link).toHaveAttribute('href', url);
    expect(link.closest('.pm-m-sheet-head')).not.toBeNull();
  });

  it('keeps the desktop preview modal', () => {
    mockCompact = false;
    render(<DrivePreviewModal url={url} label="Spec sheet" onClose={() => {}} />);
    expect(document.querySelector('.cpm-drive-preview-modal')).not.toBeNull();
    expect(document.querySelector('.pm-m-layer')).toBeNull();
  });
});
