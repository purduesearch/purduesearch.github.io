import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChangeRequestModal from "./ChangeRequestModal";
import { getCr, getCrReviewStatus, getCrReadiness, getCrRelease, getVaultReleasePackageUrl, verifyVaultRelease, buildVaultReleasePackage, approveCr } from "../../../api/clubPmClient";

jest.mock("../../../clubpm/layout/compactLayout", () => ({ useCompactLayout: () => false }));
jest.mock("../../../api/clubPmClient", () => ({
  apiBaseUrl: "", get: jest.fn(), getCr: jest.fn(), getCrReviewStatus: jest.fn(), getCrReadiness: jest.fn(), getCrRelease: jest.fn(),
  getVaultReleasePackageUrl: jest.fn(), verifyVaultRelease: jest.fn(), buildVaultReleasePackage: jest.fn(), getVaultReleaseManifestText: jest.fn(),
  approveCr: jest.fn(), rejectCr: jest.fn(), cancelCr: jest.fn(), patchCr: jest.fn(),
}));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const openCr = { id: "cr1", number: 4, title: "Release bracket", status: "OPEN", items: [{ id: "ci1", item: { name: "Bracket" }, version: { versionNumber: 2 }, targetRevision: "B" }] };
const report = (overrides = {}) => ({ state: "warnings", blockers: [], warnings: [], whereUsed: [{ itemId: "A", chains: [["A", "TOP"]] }], affectedTasks: [], missingDrawings: [], staleAssemblies: [], labels: { A: "PRT-1 Bracket", TOP: "PRT-0 Frame" }, entryCount: 3, ...overrides });

beforeEach(() => {
  jest.clearAllMocks();
  getCrReviewStatus.mockResolvedValue({ state: "approved", reasons: [], required: [], rules: [], pr: null });
});

it("shows where-used, stale assemblies and tasks, and blocks approval on a readiness blocker", async () => {
  getCr.mockResolvedValue(openCr);
  getCrReadiness.mockResolvedValue(report({
    state: "blocked",
    blockers: [{ code: "MISSING_DRAWING", severity: "BLOCKER", itemId: "A", message: "PRT-1 Bracket needs a released drawing." }],
    warnings: [{ code: "STALE_ASSEMBLY", severity: "WARNING", itemId: "TOP", message: "PRT-0 Frame Rev A was released against an older revision." }],
    missingDrawings: [{ itemId: "A", severity: "BLOCKER", requirementIds: ["r1"] }],
    staleAssemblies: [{ assemblyId: "TOP", assemblyRevision: "A", childId: "A", reason: "x" }],
    affectedTasks: [{ id: "t1", title: "Machine bracket", status: "TODO", reasons: ["Mentions PRT-1 Bracket"] }],
  }));
  render(<ChangeRequestModal project={{ id: "p1" }} member={{ id: "m1" }} isAdmin crId="cr1" onClose={() => {}} />);
  expect(await screen.findByText("Blocks approval")).toBeInTheDocument();
  expect(screen.getByText("PRT-1 Bracket → PRT-0 Frame")).toBeInTheDocument();
  expect(screen.getByText(/Machine bracket/)).toBeInTheDocument();
  expect(screen.getByText("Warnings (approval allowed)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
});

it("allows approval with warnings only", async () => {
  getCr.mockResolvedValue(openCr);
  getCrReadiness.mockResolvedValue(report({ warnings: [{ code: "AFFECTED_TASKS", severity: "WARNING", message: "1 open task touches these items." }] }));
  approveCr.mockResolvedValue({ ...openCr, status: "APPROVED" });
  getCrRelease.mockResolvedValue(null);
  render(<ChangeRequestModal project={{ id: "p1" }} member={{ id: "m1" }} isAdmin crId="cr1" onClose={() => {}} />);
  await screen.findByText("Ready with warnings");
  const approve = screen.getByRole("button", { name: "Approve" });
  await waitFor(() => expect(approve).toBeEnabled());
  fireEvent.click(approve);
  await waitFor(() => expect(approveCr).toHaveBeenCalled());
});

it("offers the pinned package, verification and retry on an approved request", async () => {
  getCr.mockResolvedValue({ ...openCr, status: "APPROVED" });
  const release = {
    id: "rel1", changeRequestNumber: 4, manifestSha256: "f".repeat(64), packageState: "READY", packageSha256: "e".repeat(64), packageSize: "4096",
    manifest: { entries: [{ role: "RELEASED", itemId: "A", partNumber: "PRT-1", name: "Bracket", revision: "B", versionNumber: 2, fileName: "bracket.step", sizeBytes: 2048, sha256: "a".repeat(64), packagePath: "files/PRT-1_rev-B/bracket.step", storage: { commitSha: "c".repeat(40), repository: "club/vault" } }] },
  };
  getCrRelease.mockResolvedValue(release);
  getVaultReleasePackageUrl.mockResolvedValue({ url: "/api/vault-releases/rel1/package?sig=x" });
  verifyVaultRelease.mockResolvedValue({ reproducible: true, rebuiltPackageSha256: "e".repeat(64) });
  const assign = jest.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { assign } });
  render(<ChangeRequestModal project={{ id: "p1" }} member={{ id: "m1" }} isAdmin crId="cr1" onClose={() => {}} />);
  expect(await screen.findByText(/PRT-1 · Rev B · v2/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Download package" }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith("/api/vault-releases/rel1/package?sig=x"));
  fireEvent.click(screen.getByRole("button", { name: "Verify reproducibility" }));
  expect(await screen.findByText(/matches\./)).toBeInTheDocument();

  getCrRelease.mockResolvedValue({ ...release, packageState: "FAILED", packageError: "MISSING_BYTES: files/PRT-1_rev-B/bracket.step could not be read" });
  buildVaultReleasePackage.mockResolvedValue({ ...release, packageState: "BUILDING" });
});

it("shows a failed package build with a retry and disables download", async () => {
  getCr.mockResolvedValue({ ...openCr, status: "APPROVED" });
  getCrRelease.mockResolvedValue({ id: "rel1", changeRequestNumber: 4, manifestSha256: "f".repeat(64), packageState: "FAILED", packageError: "MISSING_BYTES: bracket.step could not be read", manifest: { entries: [] } });
  buildVaultReleasePackage.mockResolvedValue({ id: "rel1", packageState: "BUILDING" });
  render(<ChangeRequestModal project={{ id: "p1" }} member={{ id: "m1" }} isAdmin crId="cr1" onClose={() => {}} />);
  expect(await screen.findByText(/MISSING_BYTES/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download package" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry build" }));
  await waitFor(() => expect(buildVaultReleasePackage).toHaveBeenCalledWith("rel1"));
});
