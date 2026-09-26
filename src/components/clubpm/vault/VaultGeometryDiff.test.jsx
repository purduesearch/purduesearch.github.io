import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VaultGeometryDiffPanel from "./VaultGeometryDiffPanel";
import VaultChangesView from "./VaultChangesView";
import { getVaultGeometryDiff, requestVaultGeometryDiff } from "../../../api/clubPmClient";

jest.mock("../../../api/clubPmClient", () => ({
  requestVaultGeometryDiff: jest.fn(), getVaultGeometryDiff: jest.fn(), getVaultVersionDownloadUrl: jest.fn(),
  vaultGeometryMeshUrl: jest.fn((id, side) => `/mesh/${id}/${side}`), apiBaseUrl: "", authHeaders: jest.fn(() => ({})),
}));
// three.js cannot run in jsdom; the aligned viewers are exercised in the browser.
jest.mock("./VaultCompareView", () => ({ __esModule: true, default: ({ diff }) => <div data-testid="aligned-views">{diff.beforeVersionId}→{diff.afterVersionId}</div> }));

const before = { id: "v1", versionNumber: 1, fileName: "bracket.stl", sizeBytes: 684, sha256: "a".repeat(64) };
const after = { id: "v2", versionNumber: 2, fileName: "bracket.stl", sizeBytes: 684, sha256: "b".repeat(64) };
const topo = { triangleCount: 12, vertexCount: 8, degenerateTriangles: 0, boundaryEdges: 0, nonManifoldEdges: 0, inconsistentEdges: 0, closed: true, manifold: true, oriented: true };
const side = (size, volume, extra = {}) => ({
  format: "stl", units: { unit: "mm", source: "declared", note: "" }, scaleToComparison: 1,
  bbox: { min: [0, 0, 0], max: size, size }, triangleCount: 12, topology: topo, volume,
  componentCount: 1, componentStructure: "none", conversion: null, warnings: [], ...extra,
});
const volume = (value) => ({ status: "COMPUTED", value, exactness: "EXACT_FOR_STORED_MESH", inverted: false, note: "" });
const report = (overrides = {}) => ({
  algorithmVersion: "vault-geometry-diff/1", status: "COMPLETE",
  units: { comparison: "mm", note: "Both models are in mm." },
  tolerance: { value: 0.0187, unit: "mm", source: "auto", note: "Automatic: 0.01% of the larger bounding-box diagonal." },
  before: side([10, 10, 10], volume(1000)), after: side([10, 10, 15], volume(1500)),
  summary: {
    verdict: "CHANGED", translation: null,
    maxDeviation: { beforeToAfter: 5, afterToBefore: 5, capped: false, searchLimit: 36 },
    deviatingArea: { added: 400, removed: 0, changed: 0, estimate: true, sampleCount: { before: 6000, after: 6000 } },
    materialClassification: "INSIDE_OUTSIDE_TEST", volumeDelta: { value: 500, exactness: "EXACT_FOR_STORED_MESH" }, bboxDelta: [0, 0, 5],
  },
  components: { compared: false, note: "STL has no component structure in these files, so only the whole model is compared.", rows: [] },
  overlay: { frame: { center: [5, 5, 7.5], radius: 10 }, before: [[5, 5, 10, 0, 5]], after: [[5, 5, 15, 0, 5]], arrows: [], pointCaps: { before: false, after: false } },
  limitations: ["Rotations are not detected: a rotated part appears as removed plus added material."],
  ...overrides,
});
const row = (state, result, extra = {}) => ({ id: "d1", state, beforeVersionId: "v1", afterVersionId: "v2", outcomeStatus: result?.status ?? null, error: null, retrying: false, result, ...extra });

beforeEach(() => { jest.clearAllMocks(); jest.useRealTimers(); });

it("shows measured changes with units, tolerance, exactness and aligned views", async () => {
  requestVaultGeometryDiff.mockResolvedValue({ diff: row("DONE", report()) });
  render(<VaultGeometryDiffPanel before={before} after={after} />);
  expect(await screen.findByText("Geometry changed")).toBeInTheDocument();
  expect(requestVaultGeometryDiff).toHaveBeenCalledWith({ beforeVersionId: "v1", afterVersionId: "v2" });
  expect(screen.getByText(/0.0187 mm \(automatic\)/)).toBeInTheDocument();
  expect(screen.getByText("+500 mm³")).toBeInTheDocument();
  expect(screen.getAllByText("exact for the stored mesh").length).toBeGreaterThan(0);
  expect(screen.getByText(/added 400, removed 0 mm²/)).toBeInTheDocument();
  expect(screen.getByText(/only the whole model is compared/)).toBeInTheDocument();
  expect(await screen.findByTestId("aligned-views")).toHaveTextContent("v1→v2");
  expect(screen.getByText("Added material")).toBeInTheDocument();
});

it("never shows a volume for a non-manifold mesh or unknown units, and says why", async () => {
  const nonManifold = { status: "NON_MANIFOLD", value: null, exactness: null, inverted: false, note: "2 edge(s) are shared by more than two triangles, so the mesh does not bound a single solid. No volume is reported." };
  const r = report({
    units: { comparison: null, note: "Neither file declares a unit. Lengths are in the file's own model units and no volume is reported." },
    before: side([20, 20, 10], nonManifold, { units: { unit: null, source: null, note: "" }, topology: { ...topo, manifold: false, nonManifoldEdges: 2 } }),
    after: side([10, 10, 10], { status: "UNITS_UNKNOWN", value: null, exactness: null, inverted: false, note: "Declare the export unit to get a volume." }, { units: { unit: null, source: null, note: "" } }),
    summary: { ...report().summary, volumeDelta: null, materialClassification: "UNAVAILABLE", deviatingArea: { added: 0, removed: 0, changed: 120, estimate: true, sampleCount: { before: 6000, after: 6000 } } },
  });
  requestVaultGeometryDiff.mockResolvedValue({ diff: row("DONE", r) });
  render(<VaultGeometryDiffPanel before={before} after={after} />);
  expect(await screen.findByText(/Not computed \(non manifold\)/)).toBeInTheDocument();
  expect(screen.getByText(/does not bound a single solid/)).toBeInTheDocument();
  expect(screen.getByText(/Not computed \(units unknown\)/)).toBeInTheDocument();
  expect(screen.getByText(/non-manifold \(2 edges\)/)).toBeInTheDocument();
  expect(screen.getByText(/cannot be told apart/)).toBeInTheDocument();
  expect(screen.queryByText(/mm³/)).not.toBeInTheDocument();
  expect(screen.getAllByText(/model units/).length).toBeGreaterThan(0);
});

it("polls a queued diff and recomputes with a declared unit and tolerance", async () => {
  jest.useFakeTimers();
  requestVaultGeometryDiff.mockResolvedValueOnce({ diff: row("PENDING", null) });
  getVaultGeometryDiff.mockResolvedValueOnce({ diff: row("RUNNING", null) }).mockResolvedValueOnce({ diff: row("DONE", report()) });
  render(<VaultGeometryDiffPanel before={before} after={after} />);
  expect(await screen.findByText(/Queued/)).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(2600); });
  expect(await screen.findByText("Computing geometry diff…")).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(2600); });
  expect(await screen.findByText("Geometry changed")).toBeInTheDocument();

  requestVaultGeometryDiff.mockResolvedValueOnce({ diff: row("DONE", report({ tolerance: { value: 0.1, unit: "in", source: "requested", note: "" } }), { id: "d2" }) });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "in" } });
  fireEvent.change(screen.getByLabelText(/Tolerance/), { target: { value: "0.1" } });
  fireEvent.click(screen.getByRole("button", { name: "Recompute" }));
  await waitFor(() => expect(requestVaultGeometryDiff).toHaveBeenLastCalledWith({ beforeVersionId: "v1", afterVersionId: "v2", units: "in", tolerance: 0.1 }));
  expect(await screen.findByText(/0.1 in \(requested\)/)).toBeInTheDocument();
});

it("reports STEP conversion failure and request errors explicitly", async () => {
  const stepAfter = { ...after, fileName: "bracket.step" };
  requestVaultGeometryDiff.mockResolvedValueOnce({ diff: row("DONE", { algorithmVersion: "vault-geometry-diff/1", status: "CONVERSION_FAILED", side: "after", message: "OpenCascade could not read the STEP file." }) });
  const { unmount } = render(<VaultGeometryDiffPanel before={before} after={stepAfter} />);
  expect(await screen.findByText(/STEP conversion failed \(v2 · bracket.step\): OpenCascade could not read the STEP file\./)).toBeInTheDocument();
  expect(screen.queryByTestId("aligned-views")).not.toBeInTheDocument();
  unmount();
  requestVaultGeometryDiff.mockRejectedValueOnce(new Error("The after version has no recorded SHA-256 (legacy Drive storage), so its result cannot be cached against its exact bytes."));
  render(<VaultGeometryDiffPanel before={before} after={after} />);
  expect(await screen.findByText(/no recorded SHA-256/)).toBeInTheDocument();
});

it("offers the geometry diff in Changes only for supported formats", async () => {
  requestVaultGeometryDiff.mockResolvedValue({ diff: row("DONE", report()) });
  const { unmount } = render(<VaultChangesView versions={[after, before]} repository={null} />);
  expect(await screen.findByText("Geometry diff")).toBeInTheDocument();
  unmount();
  render(<VaultChangesView versions={[{ ...after, fileName: "bracket.sldprt" }, { ...before, fileName: "bracket.sldprt" }]} repository={null} />);
  expect(screen.queryByText("Geometry diff")).not.toBeInTheDocument();
  expect(screen.getByText(/native CAD files .* are not parsed/)).toBeInTheDocument();
});
