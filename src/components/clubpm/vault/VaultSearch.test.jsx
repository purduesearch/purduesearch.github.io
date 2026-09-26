import React from "react";
import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VaultSearchPanel from "./VaultSearchPanel";
import VaultWatchButton from "./VaultWatchButton";
import { searchVault, listVaultSavedViews, createVaultSavedView, getVaultSubscription, setVaultSubscription, unwatchVaultItem } from "../../../api/clubPmClient";

let mockCompact = false;
const mockNavigate = jest.fn();
jest.mock("../../../clubpm/layout/compactLayout", () => ({ useCompactLayout: () => mockCompact }));
jest.mock("react-router-dom", () => ({ ...jest.requireActual("react-router-dom"), useNavigate: () => mockNavigate }));
jest.mock("../../../api/clubPmClient", () => ({
  searchVault: jest.fn(), listVaultSavedViews: jest.fn(), createVaultSavedView: jest.fn(), deleteVaultSavedView: jest.fn(),
  getVaultSubscription: jest.fn(), setVaultSubscription: jest.fn(), unwatchVaultItem: jest.fn(),
}));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const project = { id: "p1" };
const result = (over) => ({
  id: "VERSION:v2", kind: "VERSION", projectId: "p1", itemId: "i1", versionId: "v2", crId: null, commitSha: null,
  title: "Motor mount v2", snippet: "thicker wall", partNumber: "PRT-0007", fileName: "mount_v2.step", released: false,
  checkedOut: false, crStatus: null, authorName: "Ada", occurredAt: "2026-09-20T10:00:00Z", githubUrl: null,
  link: "/clubpm/projects/p1?tab=files&sub=vault&vaultItem=i1&vaultVersion=v2", ...over,
});

async function renderPanel(props = {}) {
  const onOpenItem = jest.fn(), onOpenCr = jest.fn();
  render(<MemoryRouter><VaultSearchPanel project={project} onOpenItem={onOpenItem} onOpenCr={onOpenCr} {...props} /></MemoryRouter>);
  await act(() => Promise.resolve()); // let the saved-views request settle
  return { onOpenItem, onOpenCr };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockCompact = false;
  listVaultSavedViews.mockResolvedValue({ views: [] });
  searchVault.mockResolvedValue({ results: [], hasMore: false });
});
afterEach(() => jest.useRealTimers());

async function typeQuery(text) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Search the Vault" }), { target: { value: text } });
  await act(async () => { jest.advanceTimersByTime(300); });
}

it("searches this project by default and opens a result on its exact version", async () => {
  searchVault.mockResolvedValue({ results: [result()], hasMore: false });
  const { onOpenItem } = await renderPanel();
  await typeQuery("mount");
  expect(searchVault).toHaveBeenLastCalledWith(expect.objectContaining({ q: "mount", projectId: "p1", sort: "relevance", offset: 0 }));
  fireEvent.click(await screen.findByRole("button", { name: /Motor mount v2/ }));
  expect(onOpenItem).toHaveBeenCalledWith("i1", "v2");
  expect(mockNavigate).not.toHaveBeenCalled();
});

it("drops the project scope for all projects and navigates to another project's link", async () => {
  searchVault.mockResolvedValue({ results: [result({ projectId: "p2", link: "/clubpm/projects/p2?tab=files&sub=vault&vaultItem=i9" })], hasMore: false });
  await renderPanel();
  fireEvent.change(screen.getByRole("combobox", { name: "Scope" }), { target: { value: "all" } });
  await typeQuery("bracket");
  expect(searchVault).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: undefined }));
  fireEvent.click(await screen.findByRole("button", { name: /Motor mount v2/ }));
  expect(mockNavigate).toHaveBeenCalledWith("/clubpm/projects/p2?tab=files&sub=vault&vaultItem=i9");
});

it("sends filters, and a change request result opens the CR", async () => {
  searchVault.mockResolvedValue({ results: [result({ id: "CR:c1", kind: "CR", crId: "c1", itemId: null, versionId: null, title: "CR-12 Stiffen mount", crStatus: "OPEN" })], hasMore: false });
  const { onOpenCr } = await renderPanel();
  fireEvent.click(screen.getByRole("button", { name: "Change requests" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Change request" }), { target: { value: "OPEN" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "By me" }));
  fireEvent.change(screen.getByRole("textbox", { name: "File type" }), { target: { value: ".STEP, sldprt" } });
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(searchVault).toHaveBeenLastCalledWith(expect.objectContaining({ kinds: ["CR"], crStatus: "OPEN", authorId: "me", fileExts: ["STEP", "sldprt"] }));
  fireEvent.click(await screen.findByRole("button", { name: /CR-12 Stiffen mount/ }));
  expect(onOpenCr).toHaveBeenCalledWith("c1");
});

it("does not search with no query or filters", async () => {
  await renderPanel();
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(searchVault).not.toHaveBeenCalled();
  expect(screen.getByText(/Type to search/)).toBeInTheDocument();
});

it("saves the current query as a named view and applies a saved view", async () => {
  listVaultSavedViews.mockResolvedValue({ views: [{ id: "sv1", name: "Unreleased STEP", projectId: "p1", query: { q: "", kinds: ["ITEM"], released: false, fileExts: ["step"], sort: "recent" } }] });
  createVaultSavedView.mockResolvedValue({ id: "sv2", name: "Mounts", projectId: "p1", query: { q: "mount" } });
  await renderPanel();
  await typeQuery("mount");
  fireEvent.click(screen.getByRole("button", { name: /Save view/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "View name" }), { target: { value: "Mounts" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(createVaultSavedView).toHaveBeenCalledWith(expect.objectContaining({ name: "Mounts", projectId: "p1", query: expect.objectContaining({ q: "mount" }) })));
  await screen.findByRole("option", { name: "Mounts" });

  fireEvent.change(screen.getByRole("combobox", { name: "Saved views" }), { target: { value: "sv1" } });
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(searchVault).toHaveBeenLastCalledWith(expect.objectContaining({ q: "", kinds: ["ITEM"], released: "false", fileExts: ["step"], sort: "recent" }));
});

it("collapses filters behind a button on phones", async () => {
  mockCompact = true;
  await renderPanel();
  expect(screen.queryByRole("combobox", { name: "Release" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
  expect(screen.getByRole("combobox", { name: "Release" })).toBeInTheDocument();
});

describe("VaultWatchButton", () => {
  beforeEach(() => jest.useRealTimers());

  it("watches every event, then unwatches", async () => {
    getVaultSubscription.mockResolvedValue({ watching: false, checkins: false, decisions: false, conflicts: false, watchers: 0 });
    setVaultSubscription.mockResolvedValue({ watching: true, checkins: true, decisions: true, conflicts: true });
    unwatchVaultItem.mockResolvedValue({ watching: false, checkins: false, decisions: false, conflicts: false });
    render(<VaultWatchButton itemId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /^Watch/ }));
    await waitFor(() => expect(setVaultSubscription).toHaveBeenCalledWith("i1", { checkins: true, decisions: true, conflicts: true }));
    expect(await screen.findByRole("button", { name: /Watching/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Watching/ }));
    await waitFor(() => expect(unwatchVaultItem).toHaveBeenCalledWith("i1"));
  });

  it("changes one event without touching the others", async () => {
    getVaultSubscription.mockResolvedValue({ watching: true, checkins: true, decisions: true, conflicts: true, watchers: 2 });
    setVaultSubscription.mockResolvedValue({ watching: true, checkins: false, decisions: true, conflicts: true });
    render(<VaultWatchButton itemId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose what to be notified about" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "New check-ins" }));
    await waitFor(() => expect(setVaultSubscription).toHaveBeenCalledWith("i1", { checkins: false, decisions: true, conflicts: true }));
  });

  it("restores the previous state when saving fails", async () => {
    getVaultSubscription.mockResolvedValue({ watching: false, checkins: false, decisions: false, conflicts: false, watchers: 0 });
    setVaultSubscription.mockRejectedValue(new Error("Forbidden"));
    render(<VaultWatchButton itemId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /^Watch/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Watch/ })).toHaveAttribute("aria-pressed", "false"));
  });
});
