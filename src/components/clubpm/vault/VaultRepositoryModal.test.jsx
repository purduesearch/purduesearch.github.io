import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import VaultTab from "./VaultTab";
import { getVault, getVaultRepository, getVaultRepositoryHealth, getVaultCommits, listProjectRepos } from "../../../api/clubPmClient";

let mockCompact = false;
jest.mock("../../../clubpm/layout/compactLayout", () => ({
  useCompactLayout: () => mockCompact,
  COMPACT_CLASS: "pm-shell--compact",
}));
jest.mock("../../../api/clubPmClient", () => ({
  getVault: jest.fn(),
  getVaultRepository: jest.fn(),
  getVaultRepositoryHealth: jest.fn(),
  getVaultCommits: jest.fn(),
  listProjectRepos: jest.fn(),
}));
jest.mock("./VaultItemModal", () => () => null);
jest.mock("./VaultUploadModal", () => () => null);
jest.mock("./ChangeRequestList", () => () => null);
jest.mock("./ChangeRequestModal", () => () => null);
jest.mock("./VaultSearchPanel", () => () => null);

beforeAll(() => {
  // jsdom does not implement the native dialog lifecycle.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

beforeEach(() => {
  mockCompact = false;
  getVault.mockResolvedValue({ health: { status: "ok" }, items: [] });
  getVaultRepository.mockResolvedValue({ repository: {
    slug: "SEARCH/parts", branch: "vault", writeEnabled: true, setupStatus: "READY",
    repair: "Review branch protection permissions.",
  } });
  getVaultRepositoryHealth.mockResolvedValue({ status: "PERMISSION", visibility: "private" });
  getVaultCommits.mockResolvedValue({ commits: [{ sha: "abc", message: "Update bracket", url: "https://github.com/SEARCH/parts/commit/abc", author: "Member" }] });
  listProjectRepos.mockResolvedValue({ repos: [] });
});

it("hides repository details until opened and returns focus when dismissed", async () => {
  render(<VaultTab project={{ id: "p1" }} member={{ id: "m1" }} isAdmin={false} />);
  const opener = await screen.findByRole("button", { name: "Repository details" });
  expect(screen.queryByText("SEARCH/parts")).not.toBeInTheDocument();
  opener.focus();
  fireEvent.click(opener);

  const dialog = screen.getByRole("dialog", { name: "Repository details" });
  expect(within(dialog).getByText("SEARCH/parts")).toBeInTheDocument();
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Review branch protection");
  expect(within(dialog).getByText(/Repository health: PERMISSION/)).toBeInTheDocument();
  expect(within(dialog).getByText("Recent commits")).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", "https://github.com/SEARCH/parts/tree/vault");
  expect(within(dialog).queryByRole("button", { name: "Repository settings" })).not.toBeInTheDocument();

  fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

it("keeps admin settings available inside the phone dialog", async () => {
  mockCompact = true;
  render(<VaultTab project={{ id: "p1" }} member={{ id: "m1" }} isAdmin />);
  fireEvent.click(await screen.findByRole("button", { name: "Repository details" }));
  const dialog = screen.getByRole("dialog", { name: "Repository details" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Repository settings" }));
  await waitFor(() => expect(listProjectRepos).toHaveBeenCalledWith("p1"));
  expect(within(dialog).getByRole("textbox", { name: "Branch" })).toHaveValue("vault");
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
