// Constellation Vault — Phase 9 mesh parsers (pure: bytes in, triangles out).
// STL (binary + ASCII), OBJ, and glTF 2.0 / GLB. STEP goes through
// vaultGeometryStep.ts because it needs OpenCascade to tessellate a B-rep.
//
// Every parser reports units honestly: STL and OBJ carry no unit at all, so
// they return `units: null`; glTF 2.0 defines metres in its specification.
// A parser never guesses a unit from magnitudes.

export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft";
export const LENGTH_UNITS: readonly LengthUnit[] = ["mm", "cm", "m", "in", "ft"];
export const UNIT_TO_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

export type GeometryFormat = "stl" | "obj" | "gltf" | "glb" | "step";
const FORMAT_BY_EXT: Record<string, GeometryFormat> = { stl: "stl", obj: "obj", gltf: "gltf", glb: "glb", step: "step", stp: "step" };

export function geometryFormatOf(fileName: string): GeometryFormat | null {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? null : FORMAT_BY_EXT[fileName.slice(dot + 1).toLowerCase()] ?? null;
}

/** One component: a named triangle set. `positions` holds xyz triplets, `indices` three per triangle. */
export type Mesh = { name: string; positions: Float64Array; indices: Uint32Array };

export type ParsedModel = {
  format: GeometryFormat;
  meshes: Mesh[];
  /** "named" when the file itself carries more than one named part (OBJ o/g, glTF nodes, STEP products, multi-solid ASCII STL). */
  componentStructure: "named" | "none";
  units: LengthUnit | null;
  unitsSource: "file" | "format-spec" | null;
  unitsNote: string;
  conversion: null | { tool: string; version: string; params: Record<string, unknown>; linearDeflection: number | null; note: string };
  warnings: string[];
};

export type GeometryErrorCode = "UNSUPPORTED_FORMAT" | "PARSE_FAILED" | "UNSUPPORTED_FEATURE" | "CONVERSION_FAILED" | "EMPTY_GEOMETRY" | "TOO_LARGE";

export class GeometryError extends Error {
  constructor(public code: GeometryErrorCode, message: string) {
    super(message);
  }
}

export type ParseLimits = { maxTriangles: number };

function assertTriangleBudget(count: number, limits: ParseLimits) {
  if (count > limits.maxTriangles) throw new GeometryError("TOO_LARGE", `The model has ${count.toLocaleString("en-US")} triangles; the geometry diff is limited to ${limits.maxTriangles.toLocaleString("en-US")}.`);
}

function nonEmpty(meshes: Mesh[]): Mesh[] {
  const kept = meshes.filter((m) => m.indices.length > 0);
  if (kept.length === 0) throw new GeometryError("EMPTY_GEOMETRY", "The file contains no triangles.");
  return kept;
}

/** Suffix repeated component names so name-based matching stays one-to-one. */
function uniqueNames(meshes: Mesh[]): Mesh[] {
  const seen = new Map<string, number>();
  return meshes.map((m) => {
    const base = m.name.trim() || "(unnamed)";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...m, name: n === 1 ? base : `${base} (${n})` };
  });
}

function sequentialIndices(triangles: number): Uint32Array {
  const idx = new Uint32Array(triangles * 3);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  return idx;
}

// ── STL ───────────────────────────────────────────────────────

export function parseStl(buf: Buffer, limits: ParseLimits): ParsedModel {
  const unitsNote = "STL files carry no unit. Declare the unit the file was exported in to get physical dimensions and volume.";
  if (buf.length >= 84) {
    const count = buf.readUInt32LE(80);
    if (84 + count * 50 === buf.length) {
      assertTriangleBudget(count, limits);
      const positions = new Float64Array(count * 9);
      for (let i = 0; i < count; i++) {
        const o = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k++) positions[i * 9 + k] = buf.readFloatLE(o + k * 4);
      }
      return { format: "stl", meshes: nonEmpty([{ name: "(whole model)", positions, indices: sequentialIndices(count) }]), componentStructure: "none", units: null, unitsSource: null, unitsNote, conversion: null, warnings: [] };
    }
  }
  const text = buf.toString("utf8");
  if (!/^\s*solid\b/i.test(text)) throw new GeometryError("PARSE_FAILED", "Not a valid STL file: the binary triangle count does not match the file size and it is not ASCII STL.");
  const solids: { name: string; coords: number[] }[] = [];
  let current: { name: string; coords: number[] } | null = null;
  let triangles = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^solid\b/i.test(line)) { current = { name: line.slice(5).trim(), coords: [] }; solids.push(current); continue; }
    if (/^vertex\b/i.test(line)) {
      if (!current) throw new GeometryError("PARSE_FAILED", "ASCII STL vertex outside a solid block.");
      const parts = line.split(/\s+/);
      const v = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
      if (v.some((c) => !Number.isFinite(c))) throw new GeometryError("PARSE_FAILED", `ASCII STL has a malformed vertex: "${line.slice(0, 80)}".`);
      current.coords.push(v[0], v[1], v[2]);
      if (current.coords.length % 9 === 0 && ++triangles > limits.maxTriangles) assertTriangleBudget(triangles, limits);
    }
  }
  if (solids.some((s) => s.coords.length % 9 !== 0)) throw new GeometryError("PARSE_FAILED", "ASCII STL has a facet without exactly three vertices.");
  const meshes = uniqueNames(solids.map((s) => ({ name: s.name, positions: Float64Array.from(s.coords), indices: sequentialIndices(s.coords.length / 9) })));
  return { format: "stl", meshes: nonEmpty(meshes), componentStructure: meshes.length > 1 ? "named" : "none", units: null, unitsSource: null, unitsNote, conversion: null, warnings: [] };
}

// ── OBJ ───────────────────────────────────────────────────────

export function parseObj(buf: Buffer, limits: ParseLimits): ParsedModel {
  const vertices: number[] = [];
  const groups: { name: string; faces: number[] }[] = [];
  let current: { name: string; faces: number[] } | null = null;
  let named = false;
  let triangles = 0;
  const warnings = new Set<string>();
  for (const raw of buf.toString("utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === "v") {
      const v = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
      if (v.some((c) => !Number.isFinite(c))) throw new GeometryError("PARSE_FAILED", `OBJ has a malformed vertex: "${line.slice(0, 80)}".`);
      vertices.push(v[0], v[1], v[2]);
    } else if (tag === "o" || tag === "g") {
      const name = parts.slice(1).join(" ");
      named = true;
      current = groups.find((g) => g.name === name) ?? null;
      if (!current) { current = { name, faces: [] }; groups.push(current); }
    } else if (tag === "f") {
      if (!current) { current = { name: "(default)", faces: [] }; groups.push(current); }
      const count = vertices.length / 3;
      const idx = parts.slice(1).map((token) => {
        const n = parseInt(token.split("/")[0], 10);
        const resolved = n < 0 ? count + n : n - 1;
        if (!Number.isInteger(n) || n === 0 || resolved < 0 || resolved >= count) throw new GeometryError("PARSE_FAILED", `OBJ face refers to a missing vertex: "${line.slice(0, 80)}".`);
        return resolved;
      });
      if (idx.length < 3) throw new GeometryError("PARSE_FAILED", "OBJ face with fewer than three vertices.");
      if (idx.length > 3) warnings.add("Polygons with more than three vertices were fan-triangulated; non-convex polygons may be triangulated incorrectly.");
      for (let i = 1; i + 1 < idx.length; i++) current.faces.push(idx[0], idx[i], idx[i + 1]);
      triangles += idx.length - 2;
      if (triangles > limits.maxTriangles) assertTriangleBudget(triangles, limits);
    } else if (tag === "l" || tag === "p") {
      warnings.add("Line and point elements were ignored; only faces are compared.");
    }
  }
  const meshes = groups.map((g) => {
    const remap = new Map<number, number>();
    const positions: number[] = [];
    const indices = new Uint32Array(g.faces.length);
    g.faces.forEach((global, i) => {
      let local = remap.get(global);
      if (local === undefined) {
        local = remap.size;
        remap.set(global, local);
        positions.push(vertices[global * 3], vertices[global * 3 + 1], vertices[global * 3 + 2]);
      }
      indices[i] = local;
    });
    return { name: g.name, positions: Float64Array.from(positions), indices };
  });
  const kept = uniqueNames(nonEmpty(meshes));
  return {
    format: "obj", meshes: kept, componentStructure: named && kept.length > 1 ? "named" : "none",
    units: null, unitsSource: null, unitsNote: "OBJ files carry no unit. Declare the unit the file was exported in to get physical dimensions and volume.",
    conversion: null, warnings: [...warnings],
  };
}

// ── glTF 2.0 / GLB ────────────────────────────────────────────

type Mat4 = Float64Array;
const identity = (): Mat4 => Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}

function nodeMatrix(node: any): Mat4 {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return Float64Array.from(node.matrix);
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  // Column-major T * R * S, as the glTF specification defines.
  return Float64Array.from([
    (1 - 2 * (qy * qy + qz * qz)) * sx, (2 * (qx * qy + qz * qw)) * sx, (2 * (qx * qz - qy * qw)) * sx, 0,
    (2 * (qx * qy - qz * qw)) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, (2 * (qy * qz + qx * qw)) * sy, 0,
    (2 * (qx * qz + qy * qw)) * sz, (2 * (qy * qz - qx * qw)) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

const GEOMETRY_EXTENSIONS = new Set(["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization"]);

export function parseGltf(buf: Buffer, format: "gltf" | "glb", limits: ParseLimits): ParsedModel {
  let json: any;
  let bin: Buffer | null = null;
  try {
    if (buf.length >= 12 && buf.readUInt32LE(0) === 0x46546c67) {
      if (buf.readUInt32LE(4) !== 2) throw new GeometryError("UNSUPPORTED_FEATURE", "Only glTF 2.0 binaries are supported.");
      let offset = 12;
      while (offset + 8 <= buf.length) {
        const len = buf.readUInt32LE(offset);
        const type = buf.readUInt32LE(offset + 4);
        const chunk = buf.subarray(offset + 8, offset + 8 + len);
        if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
        else if (type === 0x004e4942 && !bin) bin = chunk;
        offset += 8 + len;
      }
      if (!json) throw new GeometryError("PARSE_FAILED", "GLB has no JSON chunk.");
    } else {
      json = JSON.parse(buf.toString("utf8"));
    }
  } catch (err) {
    if (err instanceof GeometryError) throw err;
    throw new GeometryError("PARSE_FAILED", "Not a valid glTF/GLB file: the JSON could not be parsed.");
  }
  if (!String(json?.asset?.version ?? "").startsWith("2")) throw new GeometryError("UNSUPPORTED_FEATURE", "Only glTF 2.0 is supported.");
  const blocked = (json.extensionsRequired ?? []).filter((x: string) => GEOMETRY_EXTENSIONS.has(x));
  if (blocked.length) throw new GeometryError("UNSUPPORTED_FEATURE", `Compressed or quantized glTF geometry (${blocked.join(", ")}) is not supported. Export uncompressed glTF for a geometry diff.`);

  const buffers: Buffer[] = (json.buffers ?? []).map((b: any, i: number) => {
    if (b.uri === undefined) {
      if (i === 0 && bin) return bin;
      throw new GeometryError("PARSE_FAILED", "glTF buffer has no data.");
    }
    const m = /^data:[^;,]*;base64,(.*)$/s.exec(b.uri);
    if (!m) throw new GeometryError("UNSUPPORTED_FEATURE", "This glTF references an external .bin file, which is not stored with it in the Vault. Check in a .glb or a glTF with embedded buffers.");
    return Buffer.from(m[1], "base64");
  });

  const warnings = new Set<string>();
  const readAccessor = (index: number, expectType: "VEC3" | "SCALAR"): number[] | Float64Array => {
    const acc = json.accessors?.[index];
    if (!acc) throw new GeometryError("PARSE_FAILED", `glTF accessor ${index} is missing.`);
    if (acc.sparse) throw new GeometryError("UNSUPPORTED_FEATURE", "Sparse glTF accessors are not supported.");
    if (acc.type !== expectType) throw new GeometryError("PARSE_FAILED", `glTF accessor ${index} has type ${acc.type}, expected ${expectType}.`);
    const view = json.bufferViews?.[acc.bufferView];
    if (!view) throw new GeometryError("PARSE_FAILED", `glTF accessor ${index} has no buffer view.`);
    const data = buffers[view.buffer];
    if (!data) throw new GeometryError("PARSE_FAILED", "glTF buffer view refers to a missing buffer.");
    const comps = expectType === "VEC3" ? 3 : 1;
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[acc.componentType as 5126 | 5125 | 5123 | 5121];
    if (!size) throw new GeometryError("UNSUPPORTED_FEATURE", `glTF component type ${acc.componentType} is not supported for geometry.`);
    if (expectType === "VEC3" && acc.componentType !== 5126) throw new GeometryError("UNSUPPORTED_FEATURE", "Only float positions are supported (quantized positions need KHR_mesh_quantization).");
    const stride = view.byteStride || size * comps;
    const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    if (base + stride * (acc.count - 1) + size * comps > data.length) throw new GeometryError("PARSE_FAILED", `glTF accessor ${index} runs past the end of its buffer.`);
    const out = new Float64Array(acc.count * comps);
    for (let i = 0; i < acc.count; i++) for (let c = 0; c < comps; c++) {
      const o = base + i * stride + c * size;
      out[i * comps + c] = acc.componentType === 5126 ? data.readFloatLE(o) : acc.componentType === 5125 ? data.readUInt32LE(o) : acc.componentType === 5123 ? data.readUInt16LE(o) : data.readUInt8(o);
    }
    return out;
  };

  const meshes: Mesh[] = [];
  let triangles = 0;
  const visit = (nodeIndex: number, parent: Mat4, depth: number) => {
    if (depth > 64) throw new GeometryError("PARSE_FAILED", "glTF node hierarchy is too deep or cyclic.");
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      const positions: number[] = [];
      const indices: number[] = [];
      for (const prim of mesh?.primitives ?? []) {
        const mode = prim.mode ?? 4;
        if (mode < 4) { warnings.add("Point and line primitives were ignored; only triangles are compared."); continue; }
        if (prim.attributes?.POSITION === undefined) continue;
        const pos = readAccessor(prim.attributes.POSITION, "VEC3");
        const count = pos.length / 3;
        const raw = prim.indices !== undefined ? Array.from(readAccessor(prim.indices, "SCALAR")) : Array.from({ length: count }, (_, i) => i);
        const tri: number[] = [];
        if (mode === 4) tri.push(...raw.slice(0, raw.length - (raw.length % 3)));
        else if (mode === 5) for (let i = 0; i + 2 < raw.length; i++) tri.push(...(i % 2 ? [raw[i + 1], raw[i], raw[i + 2]] : [raw[i], raw[i + 1], raw[i + 2]]));
        else if (mode === 6) for (let i = 1; i + 1 < raw.length; i++) tri.push(raw[0], raw[i], raw[i + 1]);
        const base = positions.length / 3;
        for (let i = 0; i < count; i++) {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          positions.push(world[0] * x + world[4] * y + world[8] * z + world[12], world[1] * x + world[5] * y + world[9] * z + world[13], world[2] * x + world[6] * y + world[10] * z + world[14]);
        }
        for (const t of tri) {
          if (t >= count) throw new GeometryError("PARSE_FAILED", "glTF index refers to a missing vertex.");
          indices.push(base + t);
        }
        triangles += tri.length / 3;
        if (triangles > limits.maxTriangles) assertTriangleBudget(triangles, limits);
      }
      meshes.push({ name: node.name || mesh?.name || `node ${nodeIndex}`, positions: Float64Array.from(positions), indices: Uint32Array.from(indices) });
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  const roots: number[] = scene?.nodes ?? (json.nodes ?? []).map((_: unknown, i: number) => i).filter((i: number) => !(json.nodes ?? []).some((n: any) => (n.children ?? []).includes(i)));
  for (const root of roots) visit(root, identity(), 0);
  const kept = uniqueNames(nonEmpty(meshes));
  return {
    format, meshes: kept, componentStructure: kept.length > 1 ? "named" : "none",
    units: "m", unitsSource: "format-spec", unitsNote: "glTF 2.0 defines all linear distances in metres.",
    conversion: null, warnings: [...warnings],
  };
}

export function parseMeshFormat(buf: Buffer, format: Exclude<GeometryFormat, "step">, limits: ParseLimits): ParsedModel {
  if (format === "stl") return parseStl(buf, limits);
  if (format === "obj") return parseObj(buf, limits);
  return parseGltf(buf, format, limits);
}
