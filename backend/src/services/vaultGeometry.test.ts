// Phase 9 geometry diff — known fixture pairs. Every fixture is generated in
// vaultGeometryFixtures.ts from the numbers visible here, so each expected
// dimension and volume can be checked by hand.

import assert from "node:assert/strict";
import { boxTris, edgeSharingBoxes, gltfModel, objText, stepBox, stlAscii, stlBinary, translateTris } from "./vaultGeometryFixtures.js";
import { computeGeometryDiff, isGeometryFailure, type GeometryOutcome } from "./vaultGeometryRun.js";
import type { GeometryDiffReport } from "./vaultGeometryCore.js";

const LIMIT = { maxTriangles: 100_000, sampleCap: 6_000 };

async function diff(before: Buffer, beforeName: string, after: Buffer, afterName: string, opts: Record<string, unknown> = {}): Promise<GeometryOutcome> {
  return computeGeometryDiff({ bytes: before, fileName: beforeName }, { bytes: after, fileName: afterName }, { ...LIMIT, ...opts });
}
function complete(outcome: GeometryOutcome): GeometryDiffReport {
  if (isGeometryFailure(outcome)) assert.fail(`expected a complete report, got ${outcome.status}: ${outcome.message}`);
  return outcome;
}
const close = (actual: number | null | undefined, expected: number, eps = 1e-6) => assert.ok(actual != null && Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);

const block = boxTris([0, 0, 0], [10, 20, 30]);

// 1. Unchanged geometry, different bytes (binary vs ASCII STL): identical within tolerance.
{
  const r = complete(await diff(stlBinary(block), "bracket.stl", stlAscii([{ name: "bracket", tris: block }]), "bracket.stl", { declaredUnits: "mm" }));
  assert.equal(r.summary.verdict, "IDENTICAL_WITHIN_TOLERANCE");
  assert.deepEqual(r.before.bbox?.size, [10, 20, 30]);
  assert.equal(r.before.units.source, "declared");
  assert.equal(r.units.comparison, "mm");
  assert.equal(r.before.volume.status, "COMPUTED");
  assert.equal(r.before.volume.exactness, "EXACT_FOR_STORED_MESH");
  close(r.before.volume.value, 6000);
  close(r.summary.volumeDelta?.value, 0);
  assert.equal(r.summary.maxDeviation.beforeToAfter, 0);
  assert.equal(r.overlay.before.length + r.overlay.after.length, 0);
  assert.equal(r.tolerance.source, "auto");
  close(r.tolerance.value, Math.hypot(10, 20, 30) * 1e-4, 1e-6);
  assert.equal(r.components.compared, false, "plain STL has no component structure");
}

// 2. Units stay unknown unless declared: no volume number is ever shown.
{
  const r = complete(await diff(stlBinary(block), "a.stl", stlBinary(block), "b.stl"));
  assert.equal(r.units.comparison, null);
  assert.equal(r.before.volume.status, "UNITS_UNKNOWN");
  assert.equal(r.before.volume.value, null);
  assert.equal(r.summary.volumeDelta, null);
  assert.match(r.units.note, /Neither file declares a unit/);
}

// 3. Pure translation: reported as a displacement, not as added/removed material.
{
  const r = complete(await diff(stlBinary(block), "a.stl", stlBinary(translateTris(block, [5, 0, 0])), "b.stl", { declaredUnits: "mm" }));
  assert.equal(r.summary.verdict, "TRANSLATED");
  assert.deepEqual(r.summary.translation, [5, 0, 0]);
  close(r.summary.volumeDelta?.value, 0);
  assert.equal(r.summary.deviatingArea.added + r.summary.deviatingArea.removed, 0);
  assert.equal(r.overlay.arrows.length, 1);
  assert.deepEqual(r.overlay.arrows[0].to, [10, 10, 15]);
}

// 4. Added material: a 10 mm cube grown to 10×10×15.
const cube = boxTris([0, 0, 0], [10, 10, 10]);
const tall = boxTris([0, 0, 0], [10, 10, 15]);
{
  const r = complete(await diff(stlBinary(cube), "a.stl", stlBinary(tall), "b.stl", { declaredUnits: "mm" }));
  assert.equal(r.summary.verdict, "CHANGED");
  assert.equal(r.summary.materialClassification, "INSIDE_OUTSIDE_TEST");
  close(r.summary.volumeDelta?.value, 500);
  assert.deepEqual(r.summary.bboxDelta, [0, 0, 5]);
  assert.ok(r.summary.deviatingArea.added > 300, `added area ${r.summary.deviatingArea.added}`);
  assert.equal(r.summary.deviatingArea.removed, 0);
  assert.ok(r.overlay.after.every((p) => p[3] === 0 && p[2] >= 10 - 1e-6), "every after-side marker is new material above z=10");
  assert.equal(r.summary.maxDeviation.afterToBefore, 5);
}

// 5. Removed material: the same pair reversed.
{
  const r = complete(await diff(stlBinary(tall), "a.stl", stlBinary(cube), "b.stl", { declaredUnits: "mm" }));
  close(r.summary.volumeDelta?.value, -500);
  assert.ok(r.summary.deviatingArea.removed > 300);
  assert.equal(r.summary.deviatingArea.added, 0);
  assert.ok(r.overlay.before.every((p) => p[3] === 1), "every before-side marker is removed material");
}

// 6. A pocket cut into a solid (new surface inside the old one) counts as removed, not added.
{
  const pocketed = [
    // 10×10×10 cube with a 4×4×5 pocket from the top, as one closed, outward-facing shell.
    ...boxTris([0, 0, 0], [10, 10, 10]).filter((_, i) => i !== 2 && i !== 3), // drop +Z face
    // top face ring around the 3..7 × 3..7 opening
    [[0, 0, 10], [10, 0, 10], [7, 3, 10]], [[0, 0, 10], [7, 3, 10], [3, 3, 10]],
    [[10, 0, 10], [10, 10, 10], [7, 7, 10]], [[10, 0, 10], [7, 7, 10], [7, 3, 10]],
    [[10, 10, 10], [0, 10, 10], [3, 7, 10]], [[10, 10, 10], [3, 7, 10], [7, 7, 10]],
    [[0, 10, 10], [0, 0, 10], [3, 3, 10]], [[0, 10, 10], [3, 3, 10], [3, 7, 10]],
    // pocket walls (normals point into the pocket, i.e. out of the material) and floor
    ...boxTris([3, 3, 5], [7, 7, 10]).filter((_, i) => i !== 2 && i !== 3).map((t) => [t[0], t[2], t[1]] as typeof t),
  ] as typeof block;
  const r = complete(await diff(stlBinary(cube), "a.stl", stlBinary(pocketed), "b.stl", { declaredUnits: "mm" }));
  assert.equal(r.after.topology.closed, true);
  assert.equal(r.after.topology.oriented, true);
  close(r.summary.volumeDelta?.value, -80, 1e-6);
  assert.ok(r.summary.deviatingArea.removed > 0);
  assert.equal(r.summary.deviatingArea.added, 0, "the pocket walls lie inside the old solid, so they are a cut");
}

// 7. Changed components (OBJ o-blocks): unchanged, moved, removed and added parts.
{
  const base = boxTris([0, 0, 0], [40, 40, 5]);
  const arm = boxTris([0, 0, 5], [5, 5, 30]);
  const pin = boxTris([30, 30, 5], [32, 32, 12]);
  const bracket = boxTris([20, 0, 5], [30, 3, 15]);
  const before = objText([{ name: "base", tris: base }, { name: "arm", tris: arm }, { name: "pin", tris: pin }]);
  const after = objText([{ name: "base", tris: base }, { name: "arm", tris: translateTris(arm, [10, 0, 0]) }, { name: "bracket", tris: bracket }]);
  const r = complete(await diff(before, "frame.obj", after, "frame.obj", { declaredUnits: "mm" }));
  assert.equal(r.components.compared, true);
  const row = (name: string) => r.components.rows.find((c) => c.name === name)!;
  assert.equal(row("base").status, "UNCHANGED");
  assert.equal(row("arm").status, "MOVED");
  assert.deepEqual(row("arm").translation, [10, 0, 0]);
  assert.equal(row("pin").status, "REMOVED");
  close(row("pin").before?.volume.value, 28);
  assert.equal(row("bracket").status, "ADDED");
  close(row("bracket").after?.volume.value, 300);
  assert.ok(r.overlay.arrows.some((a) => a.label === "arm"));
  assert.equal(r.summary.verdict, "CHANGED");
}

// 8. glTF / GLB: metres from the specification, node transforms applied, components by node name.
{
  const parts = [{ name: "hull", tris: boxTris([0, 0, 0], [1, 0.5, 0.25]) }, { name: "fin", tris: boxTris([0, 0.5, 0], [0.1, 0.7, 0.05]) }];
  const moved = [parts[0], { name: "fin", tris: translateTris(parts[1].tris, [0.2, 0, 0]) }];
  const r = complete(await diff(gltfModel(parts), "rocket.gltf", gltfModel(moved, { glb: true }), "rocket.glb", { declaredUnits: "mm" }));
  assert.equal(r.units.comparison, "m");
  assert.equal(r.before.units.source, "format-spec");
  assert.match(r.units.note, /declared unit \(mm\) was ignored/);
  close(r.before.volume.value, 0.125 + 0.001, 1e-9);
  const fin = r.components.rows.find((c) => c.name === "fin")!;
  assert.equal(fin.status, "MOVED");
  close(fin.translation?.[0], 0.2, 1e-6);
  const shifted = complete(await diff(gltfModel(parts), "a.gltf", gltfModel(parts, { nodeTranslation: [0, 0, 1] }), "b.gltf"));
  assert.equal(shifted.summary.verdict, "TRANSLATED");
  close(shifted.summary.translation?.[2], 1, 1e-6);
}

// 9. Non-manifold and open meshes: explicit status, no volume, no material labels.
{
  const r = complete(await diff(stlBinary(edgeSharingBoxes()), "a.stl", stlBinary(cube), "b.stl", { declaredUnits: "mm" }));
  assert.equal(r.before.topology.manifold, false);
  assert.ok(r.before.topology.nonManifoldEdges >= 1);
  assert.equal(r.before.volume.status, "NON_MANIFOLD");
  assert.equal(r.before.volume.value, null);
  assert.equal(r.summary.volumeDelta, null);
  assert.equal(r.summary.materialClassification, "UNAVAILABLE");
  assert.ok(r.overlay.before.every((p) => p[3] === 2), "without a valid solid every marker is 'changed', never guessed as added/removed");
  assert.ok(r.limitations.some((l) => /cannot be labelled as added or removed/.test(l)));
  const open = complete(await diff(stlBinary(cube.slice(2)), "a.stl", stlBinary(cube), "b.stl", { declaredUnits: "mm" }));
  assert.equal(open.before.volume.status, "OPEN_MESH");
  assert.equal(open.before.topology.boundaryEdges, 4);
  const flipped = complete(await diff(stlBinary([...cube.slice(0, 11), [cube[11][0], cube[11][2], cube[11][1]]]), "a.stl", stlBinary(cube), "b.stl", { declaredUnits: "mm" }));
  assert.equal(flipped.before.volume.status, "INCONSISTENT_ORIENTATION");
}

// 10. STEP through OpenCascade: units from the file, volume labelled as a tessellation approximation.
{
  const r = complete(await diff(stepBox("Bracket", [0, 0, 0], [10, 20, 30]), "bracket.step", stepBox("Bracket", [5, 0, 0], [15, 20, 30]), "bracket.stp"));
  assert.equal(r.before.format, "step");
  assert.equal(r.units.comparison, "mm");
  assert.equal(r.before.units.source, "file");
  assert.equal(r.before.volume.exactness, "TESSELLATION_APPROXIMATION");
  close(r.before.volume.value, 6000, 1e-3);
  assert.equal(r.before.conversion?.tool, "occt-import-js");
  assert.equal(r.summary.verdict, "TRANSLATED");
  assert.deepEqual(r.summary.translation, [5, 0, 0]);
  assert.ok(r.limitations.some((l) => /tessellation/.test(l)));
  const inch = complete(await diff(stepBox("Plate", [0, 0, 0], [1, 2, 3], "inch"), "plate.step", stepBox("Plate", [0, 0, 0], [25.4, 50.8, 76.2]), "plate.step"));
  assert.deepEqual(inch.before.bbox?.size, [25.4, 50.8, 76.2]);
  assert.equal(inch.summary.verdict, "IDENTICAL_WITHIN_TOLERANCE", "an inch file and its millimetre twin are the same part");
}

// 11. Conversion and parse failures are explicit outcomes, never a partial report.
{
  const bad = await diff(stepBox("A", [0, 0, 0], [1, 1, 1]), "a.step", Buffer.from("ISO-10303-21;\nHEADER;\ngarbage"), "b.step");
  assert.ok(isGeometryFailure(bad));
  assert.equal(bad.status, "CONVERSION_FAILED");
  assert.equal(bad.side, "after");
  const notStep = await diff(Buffer.from("hello"), "a.step", stlBinary(cube), "b.stl");
  assert.ok(isGeometryFailure(notStep) && notStep.status === "CONVERSION_FAILED" && notStep.side === "before");
  const native = await diff(Buffer.from("x"), "a.sldprt", stlBinary(cube), "b.stl");
  assert.ok(isGeometryFailure(native) && native.status === "UNSUPPORTED_FORMAT");
  const brokenStl = await diff(Buffer.from("not an stl"), "a.stl", stlBinary(cube), "b.stl");
  assert.ok(isGeometryFailure(brokenStl) && brokenStl.status === "PARSE_FAILED");
  const external = await diff(Buffer.from(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "model.bin", byteLength: 4 }] })), "a.gltf", stlBinary(cube), "b.stl");
  assert.ok(isGeometryFailure(external) && external.status === "UNSUPPORTED_FEATURE");
  const draco = await diff(Buffer.from(JSON.stringify({ asset: { version: "2.0" }, extensionsRequired: ["KHR_draco_mesh_compression"] })), "a.gltf", stlBinary(cube), "b.stl");
  assert.ok(isGeometryFailure(draco) && draco.status === "UNSUPPORTED_FEATURE");
  const tooBig = await diff(stlBinary(cube), "a.stl", stlBinary(cube), "b.stl", { maxTriangles: 5 });
  assert.ok(isGeometryFailure(tooBig) && tooBig.status === "TOO_LARGE");
}

// 12. Requested tolerance is honoured and recorded; a 0.05 mm nudge is within 0.1 mm.
{
  const nudged = stlBinary(translateTris(cube, [0.05, 0, 0]));
  const loose = complete(await diff(stlBinary(cube), "a.stl", nudged, "b.stl", { declaredUnits: "mm", tolerance: 0.1 }));
  assert.equal(loose.summary.verdict, "IDENTICAL_WITHIN_TOLERANCE");
  assert.equal(loose.tolerance.source, "requested");
  assert.equal(loose.tolerance.value, 0.1);
  const tight = complete(await diff(stlBinary(cube), "a.stl", nudged, "b.stl", { declaredUnits: "mm", tolerance: 0.01 }));
  assert.equal(tight.summary.verdict, "TRANSLATED");
}

// 13. Deterministic output: the same inputs give byte-identical reports (stable overlays).
{
  const a = await diff(stlBinary(cube), "a.stl", stlBinary(tall), "b.stl", { declaredUnits: "mm" });
  const b = await diff(stlBinary(cube), "a.stl", stlBinary(tall), "b.stl", { declaredUnits: "mm" });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

console.log("vaultGeometry.test.ts: all fixture pairs passed");
