import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CrmTab from './CrmTab';
import { get } from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({
  get:   jest.fn(),
  post:  jest.fn(),
  patch: jest.fn(),
  del:   jest.fn(),
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
  get.mockResolvedValue(CONTACTS);
});

function renderTab() {
  return render(<CrmTab isAdmin currentMemberId="m1" campaigns={[]} />);
}

describe('CrmTab board', () => {
  it('places each contact in its stage column', async () => {
    const { container } = renderTab();
    await screen.findByText('Ada Lovelace');

    const cols = container.querySelectorAll('.pm-crm-col');
    expect(cols).toHaveLength(5);
    expect(within(cols[0]).getByText('Ada Lovelace')).toBeInTheDocument();      // COLD
    expect(within(cols[3]).getByText('Katherine Johnson')).toBeInTheDocument(); // ACTIVE
  });

  it('exposes the stage colour to each column as --stage', async () => {
    const { container } = renderTab();
    await screen.findByText('Ada Lovelace');

    const active = container.querySelectorAll('.pm-crm-col')[3];
    expect(active.style.getPropertyValue('--stage')).toBe('var(--pm-accent-teal)');
  });

  it('registers a droppable body for every stage', async () => {
    const { container } = renderTab();
    await screen.findByText('Ada Lovelace');
    expect(container.querySelectorAll('.pm-crm-col-body')).toHaveLength(5);
  });
});

describe('CrmTab overlays', () => {
  // The Outreach Hub leaves an inline transform on its tab panels, which makes
  // any ancestor a containing block for position:fixed children. These overlays
  // must therefore live on <body>, not inside the tab.
  it('renders the contact form on document.body, outside the tab', async () => {
    const { container } = renderTab();
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /new contact/i }));

    const overlay = document.body.querySelector('.pm-modal-overlay');
    expect(overlay).toBeInTheDocument();
    expect(container.contains(overlay)).toBe(false);
    expect(overlay.parentElement).toBe(document.body);
  });

  it('renders the contact drawer on document.body, outside the tab', async () => {
    get.mockImplementation((url) =>
      url.startsWith('/api/outreach/contacts/')
        ? Promise.resolve({ ...CONTACTS[0], interactions: [] })
        : Promise.resolve(CONTACTS)
    );
    const { container } = renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /open ada lovelace/i }));

    const overlay = await waitFor(() => {
      const el = document.body.querySelector('.pm-crm-drawer-overlay');
      expect(el).toBeInTheDocument();
      return el;
    });
    expect(container.contains(overlay)).toBe(false);
    expect(overlay.parentElement).toBe(document.body);
  });

  it('closes the contact form on Escape', async () => {
    renderTab();
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /new contact/i }));
    expect(document.body.querySelector('.pm-modal-overlay')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(document.body.querySelector('.pm-modal-overlay')).not.toBeInTheDocument();
    });
  });
});

describe('CrmTab empty state', () => {
  it('invites the first contact when nothing is stored', async () => {
    get.mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText(/no contacts yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add the first contact/i })).toBeInTheDocument();
  });

  it('says filters are the reason when a search returns nothing', async () => {
    get.mockResolvedValue([]);
    renderTab();
    await screen.findByText(/no contacts yet/i);

    fireEvent.change(screen.getByLabelText(/search contacts/i), { target: { value: 'zzz' } });
    expect(await screen.findByText(/no contacts match those filters/i)).toBeInTheDocument();
  });
});
