import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LabScanPage from './LabScanPage';
import {
  listWorkspaces, getMyLabVisits, getLabPresence, labCheckIn, labCheckOut,
} from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({
  listWorkspaces: jest.fn(), getMyLabVisits: jest.fn(), getLabPresence: jest.fn(),
  labCheckIn: jest.fn(), labCheckOut: jest.fn(),
}));

const ws = { id: 'ws1', name: 'Propulsion Lab', color: '#00e5cc', location: 'ARMS 1010' };

function renderAt(id = 'ws1') {
  return render(
    <MemoryRouter initialEntries={[`/clubpm/lab/${id}`]}>
      <Routes><Route path="/clubpm/lab/:workspaceId" element={<LabScanPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  listWorkspaces.mockResolvedValue([ws]);
  getLabPresence.mockResolvedValue([{ workspace: ws, checkedIn: [], scheduled: [] }]);
});

test('scanning never checks in by itself; the tap does', async () => {
  getMyLabVisits.mockResolvedValue({ open: null, pending: [], unallocated: [] });
  labCheckIn.mockResolvedValue({ visit: { id: 'v1' }, workspace: ws, closedPrevious: null });
  renderAt();
  const btn = await screen.findByRole('button', { name: /check in here/i });
  expect(labCheckIn).not.toHaveBeenCalled();
  fireEvent.click(btn);
  expect(await screen.findByText('Checked in to Propulsion Lab')).toBeInTheDocument();
  expect(labCheckIn).toHaveBeenCalledWith('ws1');
});

test('offers check out when already checked in here', async () => {
  getMyLabVisits.mockResolvedValue({ open: null, pending: [], unallocated: [] });
  getMyLabVisits.mockResolvedValueOnce({
    open: { id: 'v1', checkedInAt: new Date().toISOString(), workspace: { id: 'ws1', name: 'Propulsion Lab' } },
    pending: [], unallocated: [],
  });
  labCheckOut.mockResolvedValue({ allocations: [{ minutes: 30, title: 'Nozzle test' }], unallocatedMinutes: 0 });
  renderAt();
  fireEvent.click(await screen.findByRole('button', { name: /^check out$/i }));
  expect(await screen.findByText('30m → Nozzle test')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /check in here/i })).toBeInTheDocument();
});

test('unknown or archived space shows a clear message', async () => {
  getMyLabVisits.mockResolvedValue({ open: null, pending: [], unallocated: [] });
  renderAt('gone');
  expect(await screen.findByText('Lab space not found')).toBeInTheDocument();
});
