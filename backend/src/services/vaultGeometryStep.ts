// Constellation Vault — Phase 9 STEP/STP conversion.
//
// STEP stores exact B-rep surfaces, not triangles, so it has to be tessellated
// before it can be measured or compared. The conversion is OpenCascade (OCCT)
// compiled to WebAssembly and shipped as the npm package `occt-import-js`,
// pinned to an exact version in backend/package.json. It runs in-process in
// the geometry worker thread: no system binary, no network, and the same
// input bytes + the parameters below always produce the same triangles.
//
// Reproducing a conversion by hand:
//   cd backend && node -e "require('occt-import-js')().then(o => console.log(
//     o.ReadStepFile(require('fs').readFileSync('part.step'), <STEP_PARAMS>)))"
//
// Units: OpenCascade reads the file's own SI/conversion-based length unit and
// rescales to `linearUnit`, so a STEP result is always in millimetres with
// "file" as its unit source. Because the mesh is a chordal approximation of
// curved faces, every STEP-derived volume is labelled an approximation.

import { createRequire } from "node:module";
import { GeometryError, type Mesh, type ParsedModel, type ParseLimits } from "./vaultGeometryParsers.js";

const require = createRequire(import.meta.url);

export const OCCT_PACKAGE = "occt-import-js";
export const OCCT_VERSION: string = (require("occt-import-js/package.json") as { version: string }).version;

/**
 * Tessellation parameters. Part of the cache key through the algorithm
 * version: change them and bump GEOMETRY_ALGORITHM_VERSION.
 */
export const STEP_PARAMS = {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001,
  angularDeflection: 0.5,
} as const;

type OcctNode = { name?: string; meshes?: number[]; children?: OcctNode[] };
type OcctMesh = { name?: string; attributes: { position: { array: number[] } }; index: { array: number[] } };
type OcctResult = { success: boolean; root?: OcctNode; meshes?: OcctMesh[] };
type Occt = { ReadStepFile: (content: Uint8Array, params: unknown) => OcctResult };

let occtPromise: Promise<Occt> | null = null;

function loadOcct(): Promise<Occt> {
  if (!occtPromise) {
    const init = require("occt-import-js") as () => Promise<Occt>;
    occtPromise = init();
  }
  return occtPromise;
}

export async function parseStep(buf: Buffer, limits: ParseLimits): Promise<ParsedModel> {
  const head = buf.subarray(0, 64).toString("latin1");
  if (!head.includes("ISO-10303-21")) throw new GeometryError("CONVERSION_FAILED", "Not a STEP file: the ISO-10303-21 header is missing.");
  let result: OcctResult;
  try {
    const occt = await loadOcct();
    result = occt.ReadStepFile(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), STEP_PARAMS);
  } catch (err) {
    throw new GeometryError("CONVERSION_FAILED", `OpenCascade could not read the STEP file (${err instanceof Error ? err.message.slice(0, 160) : "unknown error"}).`);
  }
  if (!result?.success || !result.meshes) throw new GeometryError("CONVERSION_FAILED", "OpenCascade could not read the STEP file. It may be corrupt, use an unsupported schema, or contain no solid geometry.");

  // Name each mesh by its product path so nested assemblies keep distinct names.
  const pathOf = new Map<number, string>();
  const walk = (node: OcctNode, prefix: string[]) => {
    const here = node.name ? [...prefix, node.name] : prefix;
    for (const m of node.meshes ?? []) if (!pathOf.has(m)) pathOf.set(m, here.join(" / "));
    for (const child of node.children ?? []) walk(child, here);
  };
  if (result.root) walk(result.root, []);

  let triangles = 0;
  const meshes: Mesh[] = result.meshes.map((m, i) => {
    triangles += m.index.array.length / 3;
    const path = pathOf.get(i);
    return { name: path || m.name || `solid ${i + 1}`, positions: Float64Array.from(m.attributes.position.array), indices: Uint32Array.from(m.index.array) };
  });
  if (triangles > limits.maxTriangles) throw new GeometryError("TOO_LARGE", `The tessellated STEP model has ${triangles.toLocaleString("en-US")} triangles; the geometry diff is limited to ${limits.maxTriangles.toLocaleString("en-US")}.`);
  const seen = new Map<string, number>();
  const named = meshes.filter((m) => m.indices.length > 0).map((m) => {
    const n = (seen.get(m.name) ?? 0) + 1;
    seen.set(m.name, n);
    return n === 1 ? m : { ...m, name: `${m.name} (${n})` };
  });
  if (named.length === 0) throw new GeometryError("CONVERSION_FAILED", "The STEP file converted to no triangles. It may hold only wireframe or surface-less data.");

  // OCCT's bounding_box_ratio deflection is relative to the average bounding-box side.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of named) for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], m.positions[i + k]); max[k] = Math.max(max[k], m.positions[i + k]);
  }
  const deflection = STEP_PARAMS.linearDeflection * ((max[0] - min[0]) + (max[1] - min[1]) + (max[2] - min[2])) / 3;
  return {
    format: "step", meshes: named, componentStructure: named.length > 1 ? "named" : "none",
    units: "mm", unitsSource: "file",
    unitsNote: "OpenCascade read the length unit declared in the STEP file and converted it to millimetres.",
    conversion: {
      tool: OCCT_PACKAGE, version: OCCT_VERSION, params: { ...STEP_PARAMS }, linearDeflection: deflection,
      note: `Tessellated by OpenCascade (${OCCT_PACKAGE}@${OCCT_VERSION}) with a linear deflection of about ${deflection.toPrecision(3)} mm. Curved faces are approximated by flat triangles.`,
    },
    warnings: [],
  };
}
