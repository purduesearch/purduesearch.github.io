// Constellation Vault — Phase 9: parse two files and diff them. This is the
// whole computation the worker thread performs; it touches no database and
// no network — only the two input files and, for a STEP side, the STL of its
// tessellation — so it can be tested directly and bounded by the worker's
// time and memory limits.

import { readFile, rename, writeFile } from "node:fs/promises";
import { diffModels, GEOMETRY_ALGORITHM_VERSION, type DiffOptions, type GeometryDiffReport } from "./vaultGeometryCore.js";
import { geometryFormatOf, GeometryError, parseMeshFormat, type GeometryErrorCode, type LengthUnit, type ParsedModel, type ParseLimits } from "./vaultGeometryParsers.js";
import { parseStep } from "./vaultGeometryStep.js";

export type GeometryFailure = {
  algorithmVersion: string;
  status: GeometryErrorCode;
  side: "before" | "after";
  message: string;
};

export type GeometryOutcome = GeometryDiffReport | GeometryFailure;

export type GeometryRunInput = {
  before: { file: string; fileName: string };
  after: { file: string; fileName: string };
  declaredUnits: LengthUnit | null;
  tolerance: number | null;
  maxTriangles: number;
  sampleCap?: number;
  /** Where to write a converted side's triangles as binary STL (STEP only), so the browser can draw what was measured. */
  meshOut?: { before?: string; after?: string };
};

/** Binary STL of every component, in the file's own coordinates (millimetres for STEP). */
export function binaryStl(model: ParsedModel): Buffer {
  let count = 0;
  for (const m of model.meshes) count += m.indices.length / 3;
  const buf = Buffer.alloc(84 + count * 50);
  buf.write(`constellation vault ${model.format} tessellation`, 0, "ascii");
  buf.writeUInt32LE(count, 80);
  let o = 84;
  for (const m of model.meshes) for (let i = 0; i < m.indices.length; i += 3, o += 50) {
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) buf.writeFloatLE(m.positions[m.indices[i + k] * 3 + c], o + 12 + k * 12 + c * 4);
  }
  return buf;
}

export async function parseModel(buf: Buffer, fileName: string, limits: ParseLimits): Promise<ParsedModel> {
  const format = geometryFormatOf(fileName);
  if (!format) throw new GeometryError("UNSUPPORTED_FORMAT", `${fileName} is not a supported geometry format. Supported: STL, OBJ, glTF, GLB, STEP/STP.`);
  return format === "step" ? parseStep(buf, limits) : parseMeshFormat(buf, format, limits);
}

export async function computeGeometryDiff(
  before: { bytes: Buffer; fileName: string },
  after: { bytes: Buffer; fileName: string },
  opts: DiffOptions & { maxTriangles: number; onParsed?: (side: "before" | "after", model: ParsedModel) => Promise<void> },
): Promise<GeometryOutcome> {
  const limits = { maxTriangles: opts.maxTriangles };
  const models: ParsedModel[] = [];
  for (const [side, input] of [["before", before], ["after", after]] as const) {
    try {
      const model = await parseModel(input.bytes, input.fileName, limits);
      await opts.onParsed?.(side, model);
      models.push(model);
    } catch (err) {
      if (err instanceof GeometryError) return { algorithmVersion: GEOMETRY_ALGORITHM_VERSION, status: err.code, side, message: err.message };
      throw err;
    }
  }
  return diffModels(models[0], models[1], opts);
}

export async function runGeometryDiffFiles(input: GeometryRunInput): Promise<GeometryOutcome> {
  const [b, a] = await Promise.all([readFile(input.before.file), readFile(input.after.file)]);
  return computeGeometryDiff(
    { bytes: b, fileName: input.before.fileName },
    { bytes: a, fileName: input.after.fileName },
    {
      declaredUnits: input.declaredUnits, tolerance: input.tolerance, maxTriangles: input.maxTriangles, sampleCap: input.sampleCap,
      onParsed: async (side, model) => {
        const target = input.meshOut?.[side];
        if (!target || model.format !== "step") return;
        await writeFile(`${target}.partial`, binaryStl(model));
        await rename(`${target}.partial`, target);
      },
    },
  );
}

export function isGeometryFailure(outcome: GeometryOutcome): outcome is GeometryFailure {
  return outcome.status !== "COMPLETE";
}
