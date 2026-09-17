/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   These assert on which container a card rendered into and on the absence of a
   board element; no accessible query reaches either. */
// Phase 4C: on a phone the CRM pipeline is a stage-filtered list with an
// explicit Move control, and desktop keeps its five-column drag board.
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CrmTab from './CrmTab';
import { get, patch } from '../../api/clubPmClient';

let mockCompact = true;

jest.mock('../../clubpm/layout/compactLayout', () => ({
  useCompactLayout: () => mockCompact,
  COMPACT_CLASS: 'pm-shell--compact',
}));
jest.mock('../../api/clubPmClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() },
}));

const CONTACTS = [
  { id: 'c1', name: 'Ada Lovelace', organization: 'Analytical Engines', contactType: 'SPONSOR', stage: 'COLD', tags: [] },
  { id: 'c2', name: 'Katherine Johnson', organization: 'NASA', contactType: 'PARTNER', stage: 'ACTIVE', tags: [] },
];

beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
  get.mockResolvedValue(CONTACTS);
  patch.mockResolvedValue({});
});

describe('CrmTab on phones', () => {
  it('shows one stage at a time with counts, and no side-by-side board', async () => {
    mockCompact = true;
    const { container } = render(<CrmTab isAdmin currentMemberId="m1" campaigns={[]} />);
    await screen.findByText('Ada Lovelace');

    expect(container.querySelector('.pm-crm-board')).toBeNull();

    const stages = screen.getByRole('group', { name: 'Pipeline stage' });
    const cold = within(stages).getByRole('button', { name: /Cold/ });
    expect(cold).toHaveAttribute('aria-pressed', 'true');
    expect(within(stages).getByRole('button', { name: /Active/ })).toHaveAttribute('aria-pressed', 'false');

    // Only the selected stage's contacts are listed.
    expect(screen.queryByText('Katherine Johnson')).not.toBeInTheDocument();

    fireEvent.click(within(stages).getByRole('button', { name: /Active/ }));
    expect(await screen.findByText('Katherine Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('moves a contact through an explicit Move control, not a drag', async () => {
    mockCompact = true;
    render(<CrmTab isAdmin currentMemberId="m1" campaigns={[]} />);
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /^Move$/ }));

    const sheet = await screen.findByRole('dialog', { name: /Move Ada Lovelace/ });
    // The stage the contact is already in is offered but not selectable twice.
    expect(within(sheet).getByRole('button', { name: /Cold Current/ })).toBeDisabled();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Engaged' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/api/outreach/contacts/c1', { stage: 'ENGAGED' })
    );
    // The list follows the contact so the move is visible, not silent.
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('keeps the five-column drag board on desktop', async () => {
    mockCompact = false;
    const { container } = render(<CrmTab isAdmin currentMemberId="m1" campaigns={[]} />);
    await screen.findByText('Ada Lovelace');

    expect(container.querySelectorAll('.pm-crm-col')).toHaveLength(5);
    expect(screen.queryByRole('group', { name: 'Pipeline stage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move$/ })).not.toBeInTheDocument();
  });
});
