import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VaultUploadModal from "./VaultUploadModal";
import VaultChangesView from "./VaultChangesView";
import ChangeRequestList from "./ChangeRequestList";
import VaultVersionThumbnail from "./VaultVersionThumbnail";
import { uploadVaultFile, getVaultUploadJob, getVaultVersionDownloadUrl, checkVaultDuplicates, retryVaultUploadJob, getVaultRepositoryHealth, listCrs, getCr, getCrReviewStatus, approveCr } from "../../../api/clubPmClient";

jest.mock("../../../clubpm/layout/compactLayout", () => ({ useCompactLayout: () => false }));
jest.mock("../../../api/clubPmClient", () => ({
  uploadVaultFile: jest.fn(), checkVaultDuplicates: jest.fn().mockResolvedValue({ candidates: [] }),
  getVaultUploadJob: jest.fn(), retryVaultUploadJob: jest.fn(), getVaultRepositoryHealth: jest.fn(),
  getVaultVersionDownloadUrl: jest.fn(), apiBaseUrl: "", authHeaders: jest.fn(() => ({})),
  listCrs: jest.fn(), getCr: jest.fn(), getCrReviewStatus: jest.fn(), approveCr: jest.fn(), rejectCr: jest.fn(),
  getCrReadiness: jest.fn(() => Promise.resolve({ state: "ready", blockers: [], warnings: [], whereUsed: [], affectedTasks: [], missingDrawings: [], staleAssemblies: [], labels: {}, entryCount: 1 })),
}));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const repository = { slug: "pilot/private-vault", branch: "vault", writeEnabled: true, lastHeadSha: "a".repeat(40) };

beforeEach(() => {
  jest.clearAllMocks();
  checkVaultDuplicates.mockResolvedValue({ candidates: [] });
  document.body.innerHTML = '<div id="root"></div>';
  Object.defineProperty(window, "crypto", { configurable: true, value: { randomUUID: () => "test-key" } });
});

it("requires a description and waits for an indexed GitHub version", async () => {
  uploadVaultFile.mockResolvedValue({ job: { id: "job1", state: "UPLOADED" } });
  getVaultUploadJob.mockResolvedValue({ job: { id: "job1", state: "INDEXED", versionId: "v1", commitSha: "b".repeat(40) } });
  const done = jest.fn();
  render(<VaultUploadModal project={{ id: "p1" }} repository={repository} onClose={() => {}} onDone={done} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bracket" } });
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File(["cad"], "bracket.step")] } });
  expect(screen.getByRole("button", { name: "Create item" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: /Change description/ }), { target: { value: "Moved mounting holes" } });
  fireEvent.click(screen.getByRole("button", { name: "Create item" }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(expect.objectContaining({ versionId: "v1" })));
  expect(uploadVaultFile).toHaveBeenCalledWith("/api/projects/p1/vault/github-items", expect.any(File), expect.objectContaining({ note: "Moved mounting holes", expectedHeadSha: repository.lastHeadSha }), expect.any(Function), expect.objectContaining({ "Idempotency-Key": expect.any(String) }));
});

it("compares a legacy Drive text version with a GitHub text version through signed downloads", async () => {
  getVaultVersionDownloadUrl.mockImplementation(id => Promise.resolve({ url: `/signed/${id}` }));
  global.fetch = jest.fn(url => Promise.resolve({ ok: true, text: () => Promise.resolve(url.endsWith("old") ? "part=bracket\nsize=1" : "part=bracket\nsize=2") }));
  const versions = [
    { id: "new", versionNumber: 2, fileName: "meta.json", sizeBytes: 24, note: "New size", storageProvider: "GITHUB", commitSha: "b".repeat(40) },
    { id: "old", versionNumber: 1, fileName: "meta.json", sizeBytes: 24, note: "Original", storageProvider: "DRIVE" },
  ];
  render(<VaultChangesView versions={versions} repository={repository} />);
  await waitFor(() => expect(screen.getByText(/\+ size=2/)).toBeInTheDocument());
  expect(screen.getByText(/- size=1/)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith("/signed/old");
  expect(global.fetch).toHaveBeenCalledWith("/signed/new");
});

it("keeps a drifted upload retryable using the reviewed current branch head", async () => {
  uploadVaultFile.mockResolvedValue({ job: { id: "job2", state: "UPLOADED" } });
  getVaultUploadJob.mockResolvedValueOnce({ job: { id: "job2", state: "RETRY", errorCode: "BRANCH_DRIFT" } }).mockResolvedValueOnce({ job: { id: "job2", state: "INDEXED", versionId: "v2" } });
  getVaultRepositoryHealth.mockResolvedValue({ actualHeadSha: "c".repeat(40) });
  retryVaultUploadJob.mockResolvedValue({ job: { id: "job2", state: "RETRY" } });
  const done = jest.fn();
  render(<VaultUploadModal project={{ id: "p1" }} item={{ id: "item1", name: "Bracket" }} repository={repository} onClose={() => {}} onDone={done} />);
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File(["cad"], "bracket.step")] } });
  fireEvent.change(screen.getByRole("textbox", { name: /Change description/ }), { target: { value: "Moved holes" } });
  fireEvent.click(screen.getByRole("button", { name: "Check in" }));
  await screen.findByRole("button", { name: "Retry check-in" });
  fireEvent.click(screen.getByRole("button", { name: "Retry check-in" }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(expect.objectContaining({ versionId: "v2" })));
  expect(retryVaultUploadJob).toHaveBeenCalledWith("job2", { expectedHeadSha: "c".repeat(40) });
});

it("submits CR approval through ClubPM and refreshes the release queue", async () => {
  listCrs.mockResolvedValueOnce([{ id: "cr1", number: 4, title: "Release bracket", status: "OPEN", items: [{ id: "item1" }], createdAt: new Date().toISOString() }]).mockResolvedValueOnce([]);
  getCr.mockResolvedValue({ id: "cr1", number: 4, title: "Release bracket", status: "OPEN", items: [{ id: "item1", item: { name: "Bracket" }, version: { versionNumber: 1 } }] });
  getCrReviewStatus.mockResolvedValue({ state: "approved", reasons: [], required: [], rules: [], pr: null });
  approveCr.mockResolvedValue({ status: "APPROVED" });
  render(<ChangeRequestList project={{ id: "p1" }} isAdmin mode="review" />);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  const approve = await screen.findByRole("button", { name: "Approve" });
  await waitFor(() => expect(approve).toBeEnabled());
  fireEvent.click(approve);
  await waitFor(() => expect(approveCr).toHaveBeenCalledWith("cr1", { reviewNote: undefined }));
  await screen.findByText("No change requests waiting for review.");
});

it.each([
  ["failing", "build failed", "failed"],
  ["stale", "Reviewer sign-off is stale after a version or PR head change", "stale"],
  ["failing", "A required reviewer no longer has project access; an admin must update the reviewer rules", "lost project access — admin must update rules"],
])("blocks approval while the review gate is %s (%s)", async (state, reason, rowText) => {
  listCrs.mockResolvedValueOnce([{ id: "cr1", number: 4, title: "Release bracket", status: "OPEN", items: [{ id: "item1" }], createdAt: new Date().toISOString() }]);
  getCr.mockResolvedValue({ id: "cr1", number: 4, title: "Release bracket", status: "OPEN", prRepoSlug: "pilot/cad", prNumber: 7, items: [{ id: "item1", item: { name: "Bracket" }, version: { versionNumber: 2 } }] });
  const rowState = rowText === "failed" ? "pending" : rowText === "stale" ? "stale" : "unauthorized";
  getCrReviewStatus.mockResolvedValue({
    state, reasons: [reason],
    required: [{ ruleId: "r1", reviewerId: "m2", state: rowState }],
    rules: [{ id: "r1", scope: "SUBSYSTEM", value: "PROP", reviewer: { displayName: "Ada" } }],
    pr: { title: "Bracket PR", state: "open", headSha: "d".repeat(40), reviews: [], checks: [{ name: "build", status: "completed", conclusion: "failure" }], timeline: [] },
  });
  render(<ChangeRequestList project={{ id: "p1" }} isAdmin mode="review" />);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText(reason)).toBeInTheDocument();
  expect(screen.getByText(state)).toBeInTheDocument();
  if (rowState === "unauthorized") expect(screen.getByText(/lost project access — admin must update rules/)).toBeInTheDocument();
  expect(screen.getByText(/build: failure/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(approveCr).not.toHaveBeenCalled();
});

it.each([
  ["DRIVE", { thumbnailFileId: "drive-thumb" }],
  ["GITHUB", { thumbnailPath: "vault/items/item1/preview/v1.png" }],
])("loads a private %s thumbnail through the authorized proxy", async (storageProvider, thumbnail) => {
  const objectUrl = "blob:test-preview";
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => objectUrl) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["png"], { type: "image/png" })) }));
  render(<VaultVersionThumbnail version={{ id: "v1", fileName: "bracket.step", storageProvider, ...thumbnail }} />);
  expect(await screen.findByRole("img", { name: "Preview of bracket.step" })).toHaveAttribute("src", objectUrl);
  expect(global.fetch).toHaveBeenCalledWith("/api/vault/versions/v1/thumbnail", expect.objectContaining({ credentials: "include" }));
});
