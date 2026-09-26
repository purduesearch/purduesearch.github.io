// Constellation Vault — Phase 9 geometry measurement and diff (pure).
//
// Input: two parsed models (vaultGeometryParsers.ts / vaultGeometryStep.ts).
// Output: a JSON-safe report that states, for every number, what it is and
// how far it can be trusted:
//
//  * Bounding boxes are exact for the stored triangles.
//  * Volume is reported only for a closed, edge-manifold, consistently
//    oriented component with a known unit. It is "exact for the stored mesh"
//    for mesh formats and a "tessellation approximation" for STEP. Anything
//    else carries a status (OPEN_MESH, NON_MANIFOLD, …) and no number.
//  * Surface deviation comes from deterministic, area-weighted surface
//    samples measured against the other model's exact triangles. A sample is
//    "changed" only when it lies farther than the tolerance from the other
//    surface. Deviating areas are therefore sampled estimates and labelled so.
//  * Added/removed *material* is decided by an inside/outside test and is
//    only claimed when the other model is a valid closed solid; otherwise the
//    sample is "changed surface" with the material side unknown.
//  * A rigid translation is reported only when shifting one model by its
//    bounding-box offset brings every sample within tolerance. Rotations are
//    not detected; a rotated part shows as removed + added material.
//
// Every choice that changes numbers is covered by GEOMETRY_ALGORITHM_VERSION,
// which is part of the cache key. Bump it whenever this file's output can
// change for the same input.

import { UNIT_TO_MM, type LengthUnit, type Mesh, type ParsedModel } from "./vaultGeometryParsers.js";

export const GEOMETRY_ALGORITHM_VERSION = "vault-geometry-diff/1";

export const DEFAULT_SAMPLE_CAP = 40_000;
export const OVERLAY_POINT_CAP = 3_000;
export const COMPONENT_DIFF_CAP = 200;
/** Automatic tolerance as a fraction of the larger bounding-box diagonal. */
export const AUTO_TOLERANCE_RATIO = 1e-4;
/**
 * Full-range distance searches stop at this multiple of the model diagonal;
 * anything farther is reported as "at least". Every sample first gets a cheap
 * search bounded by the tolerance; only a strided subset of the deviating
 * samples (the ones drawn in the overlay) gets a full-range search.
 */
export const SEARCH_LIMIT_RATIO = 2;

type V3 = [number, number, number];

// ── Small numeric helpers ─────────────────────────────────────

/** Round to 6 significant digits so reports are compact and byte-stable across runs. */
export function sig(v: number, digits = 6): number {
  if (!Number.isFinite(v) || v === 0) return v === 0 ? 0 : v;
  return Number(v.toPrecision(digits));
}
const sig3 = (v: V3): V3 => [sig(v[0]), sig(v[1]), sig(v[2])];

type Box = { min: V3; max: V3 };
const emptyBox = (): Box => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
function growBox(box: Box, x: number, y: number, z: number) {
  if (x < box.min[0]) box.min[0] = x; if (y < box.min[1]) box.min[1] = y; if (z < box.min[2]) box.min[2] = z;
  if (x > box.max[0]) box.max[0] = x; if (y > box.max[1]) box.max[1] = y; if (z > box.max[2]) box.max[2] = z;
}
const boxSize = (b: Box): V3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const boxCenter = (b: Box): V3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
const boxDiag = (b: Box) => Math.hypot(...boxSize(b));

// ── Triangle soup: one flat array per model (or component) ───

/** 9 coordinates per triangle plus the component each triangle came from. */
export type Soup = { tris: Float64Array; component: Uint32Array; box: Box };

export function toSoup(meshes: Mesh[], scale = 1): Soup {
  let count = 0;
  for (const m of meshes) count += m.indices.length / 3;
  const tris = new Float64Array(count * 9);
  const component = new Uint32Array(count);
  const box = emptyBox();
  let t = 0;
  meshes.forEach((m, ci) => {
    for (let i = 0; i < m.indices.length; i += 3, t++) {
      for (let k = 0; k < 3; k++) {
        const v = m.indices[i + k] * 3;
        const x = m.positions[v] * scale, y = m.positions[v + 1] * scale, z = m.positions[v + 2] * scale;
        tris[t * 9 + k * 3] = x; tris[t * 9 + k * 3 + 1] = y; tris[t * 9 + k * 3 + 2] = z;
        growBox(box, x, y, z);
      }
      component[t] = ci;
    }
  });
  return { tris, component, box };
}

/** Split a soup into one soup per component in a single pass. */
function splitSoup(soup: Soup, components: number): Soup[] {
  const counts = new Uint32Array(components);
  for (let t = 0; t < soup.component.length; t++) counts[soup.component[t]]++;
  const parts: Soup[] = Array.from(counts, (c) => ({ tris: new Float64Array(c * 9), component: new Uint32Array(c), box: emptyBox() }));
  const fill = new Uint32Array(components);
  for (let t = 0; t < soup.component.length; t++) {
    const part = parts[soup.component[t]];
    const i = fill[soup.component[t]]++;
    for (let k = 0; k < 9; k++) part.tris[i * 9 + k] = soup.tris[t * 9 + k];
    for (let k = 0; k < 9; k += 3) growBox(part.box, soup.tris[t * 9 + k], soup.tris[t * 9 + k + 1], soup.tris[t * 9 + k + 2]);
  }
  return parts;
}

// ── Topology and volume ───────────────────────────────────────

export type Topology = {
  triangleCount: number; vertexCount: number; degenerateTriangles: number;
  boundaryEdges: number; nonManifoldEdges: number; inconsistentEdges: number;
  closed: boolean; manifold: boolean; oriented: boolean;
};

export type VolumeStatus = "COMPUTED" | "UNITS_UNKNOWN" | "OPEN_MESH" | "NON_MANIFOLD" | "INCONSISTENT_ORIENTATION";
export type Volume = {
  status: VolumeStatus;
  /** In cubic comparison units; null unless status is COMPUTED. */
  value: number | null;
  exactness: "EXACT_FOR_STORED_MESH" | "TESSELLATION_APPROXIMATION" | null;
  inverted: boolean;
  note: string;
};

/**
 * Weld coincident vertices (within `eps`) and classify every undirected edge.
 * Closed = no boundary edges; manifold = no edge used more than twice;
 * oriented = every shared edge is traversed once in each direction.
 */
export function topologyOf(soup: Soup, eps: number): Topology & { signedVolume: number } {
  const n = soup.tris.length / 9;
  const ids = new Map<string, number>();
  const q = eps > 0 ? 1 / eps : 1;
  const vid = (x: number, y: number, z: number) => {
    const key = eps > 0 ? `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}` : `${x},${y},${z}`;
    let id = ids.get(key);
    if (id === undefined) { id = ids.size; ids.set(key, id); }
    return id;
  };
  const edges = new Map<number, { count: number; dir: number }>();
  let degenerate = 0;
  let signedVolume = 0;
  const vIdx = new Uint32Array(3);
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const T = soup.tris;
    for (let k = 0; k < 3; k++) vIdx[k] = vid(T[o + k * 3], T[o + k * 3 + 1], T[o + k * 3 + 2]);
    // Divergence theorem: sum of signed tetrahedra against the origin.
    signedVolume += (T[o] * (T[o + 4] * T[o + 8] - T[o + 5] * T[o + 7]) - T[o + 1] * (T[o + 3] * T[o + 8] - T[o + 5] * T[o + 6]) + T[o + 2] * (T[o + 3] * T[o + 7] - T[o + 4] * T[o + 6])) / 6;
    if (vIdx[0] === vIdx[1] || vIdx[1] === vIdx[2] || vIdx[0] === vIdx[2]) { degenerate++; continue; }
    for (let k = 0; k < 3; k++) {
      const a = vIdx[k], b = vIdx[(k + 1) % 3];
      const key = a < b ? a * 0x4000000 + b : b * 0x4000000 + a;
      const e = edges.get(key);
      if (e) { e.count++; e.dir += a < b ? 1 : -1; }
      else edges.set(key, { count: 1, dir: a < b ? 1 : -1 });
    }
  }
  let boundary = 0, nonManifold = 0, inconsistent = 0;
  for (const e of edges.values()) {
    if (e.count === 1) boundary++;
    else if (e.count > 2) nonManifold++;
    else if (e.dir !== 0) inconsistent++;
  }
  return {
    triangleCount: n, vertexCount: ids.size, degenerateTriangles: degenerate,
    boundaryEdges: boundary, nonManifoldEdges: nonManifold, inconsistentEdges: inconsistent,
    closed: boundary === 0 && n > 0, manifold: nonManifold === 0, oriented: inconsistent === 0,
    signedVolume,
  };
}

export function volumeOf(topo: Topology & { signedVolume: number }, unit: LengthUnit | null, fromTessellation: boolean): Volume {
  const base = { value: null, exactness: null, inverted: false } as const;
  if (topo.nonManifoldEdges > 0) return { ...base, status: "NON_MANIFOLD", note: `${topo.nonManifoldEdges} edge(s) are shared by more than two triangles, so the mesh does not bound a single solid. No volume is reported.` };
  if (!topo.closed) return { ...base, status: "OPEN_MESH", note: `${topo.boundaryEdges} boundary edge(s): the mesh has holes, so it encloses no volume. No volume is reported.` };
  if (!topo.oriented) return { ...base, status: "INCONSISTENT_ORIENTATION", note: `${topo.inconsistentEdges} edge(s) join triangles facing opposite ways, so inside and outside are ambiguous. No volume is reported.` };
  if (!unit) return { ...base, status: "UNITS_UNKNOWN", note: "The mesh is closed, but the file declares no unit. Declare the export unit to get a volume." };
  const inverted = topo.signedVolume < 0;
  return {
    status: "COMPUTED", value: Math.abs(topo.signedVolume), inverted,
    exactness: fromTessellation ? "TESSELLATION_APPROXIMATION" : "EXACT_FOR_STORED_MESH",
    note: (fromTessellation
      ? "Computed from the OpenCascade tessellation; curved faces are approximated by chords, so this is not the exact B-rep volume."
      : "Computed exactly from the stored triangles. A mesh export only approximates curved CAD surfaces.")
      + (inverted ? " The triangles face inward; the magnitude is reported." : "")
      + " Self-intersections are not checked.",
  };
}

// ── Spatial grid over triangles ───────────────────────────────

function closestPointDistSq(px: number, py: number, pz: number, T: Float64Array, o: number): number {
  // Ericson, Real-Time Collision Detection §5.1.5.
  const ax = T[o], ay = T[o + 1], az = T[o + 2];
  const abx = T[o + 3] - ax, aby = T[o + 4] - ay, abz = T[o + 5] - az;
  const acx = T[o + 6] - ax, acy = T[o + 7] - ay, acz = T[o + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const dsq = (x: number, y: number, z: number) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
  if (d1 <= 0 && d2 <= 0) return dsq(ax, ay, az);
  const bpx = px - T[o + 3], bpy = py - T[o + 4], bpz = pz - T[o + 5];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return dsq(T[o + 3], T[o + 4], T[o + 5]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return dsq(ax + v * abx, ay + v * aby, az + v * abz); }
  const cpx = px - T[o + 6], cpy = py - T[o + 7], cpz = pz - T[o + 8];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return dsq(T[o + 6], T[o + 7], T[o + 8]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return dsq(ax + w * acx, ay + w * acy, az + w * acz); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return dsq(T[o + 3] + w * (T[o + 6] - T[o + 3]), T[o + 4] + w * (T[o + 7] - T[o + 4]), T[o + 5] + w * (T[o + 8] - T[o + 5]));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return dsq(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

export class TriangleGrid {
  private cellStart: Uint32Array;
  private cellItems: Uint32Array;
  private stamp: Uint32Array;
  private query = 0;
  readonly dims: V3;
  readonly cell: number;
  readonly origin: V3;

  constructor(readonly soup: Soup, bounds: Box, maxCells = 48 ** 3) {
    const size = boxSize(bounds);
    const volume = Math.max(size[0], 1e-12) * Math.max(size[1], 1e-12) * Math.max(size[2], 1e-12);
    const target = Math.min(maxCells, Math.max(1, soup.tris.length / 9));
    this.cell = Math.max(Math.cbrt(volume / target), Math.max(...size) / 256, 1e-9);
    this.origin = [...bounds.min] as V3;
    this.dims = size.map((s) => Math.max(1, Math.ceil(s / this.cell))) as V3;
    const cells = this.dims[0] * this.dims[1] * this.dims[2];
    const counts = new Uint32Array(cells + 1);
    const n = soup.tris.length / 9;
    const range = (t: number) => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < 9; k++) { const a = k % 3; lo[a] = Math.min(lo[a], soup.tris[t * 9 + k]); hi[a] = Math.max(hi[a], soup.tris[t * 9 + k]); }
      return [this.cellOf(lo as V3), this.cellOf(hi as V3)];
    };
    for (let t = 0; t < n; t++) {
      const [a, b] = range(t);
      for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) counts[this.index(x, y, z) + 1]++;
    }
    for (let i = 1; i <= cells; i++) counts[i] += counts[i - 1];
    this.cellStart = counts;
    this.cellItems = new Uint32Array(counts[cells]);
    const fill = counts.slice(0, cells);
    for (let t = 0; t < n; t++) {
      const [a, b] = range(t);
      for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) this.cellItems[fill[this.index(x, y, z)]++] = t;
    }
    this.stamp = new Uint32Array(n);
  }

  private index(x: number, y: number, z: number) { return (x * this.dims[1] + y) * this.dims[2] + z; }
  private cellOf(p: V3): V3 {
    return [0, 1, 2].map((a) => Math.min(this.dims[a] - 1, Math.max(0, Math.floor((p[a] - this.origin[a]) / this.cell)))) as V3;
  }
  private nextQuery() {
    if (++this.query === 0xffffffff) { this.stamp.fill(0); this.query = 1; }
    return this.query;
  }

  /** Distance from p to the nearest triangle, or `maxDist` when nothing is that close. */
  nearest(p: V3, maxDist: number): number {
    const q = this.nextQuery();
    const c = this.cellOf(p);
    let best = maxDist * maxDist;
    const maxRing = Math.max(this.dims[0], this.dims[1], this.dims[2]);
    for (let r = 0; r <= maxRing; r++) {
      if (r > 0 && ((r - 1) * this.cell) ** 2 > best) break;
      const x0 = Math.max(0, c[0] - r), x1 = Math.min(this.dims[0] - 1, c[0] + r);
      const y0 = Math.max(0, c[1] - r), y1 = Math.min(this.dims[1] - 1, c[1] + r);
      const z0 = Math.max(0, c[2] - r), z1 = Math.min(this.dims[2] - 1, c[2] + r);
      // Visit only the shell at Chebyshev distance r: O(r²) cells per ring.
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const onSide = Math.abs(x - c[0]) === r || Math.abs(y - c[1]) === r;
        for (let z = onSide ? z0 : c[2] - r; z <= (onSide ? z1 : c[2] + r); z += onSide ? 1 : Math.max(1, 2 * r)) {
        if (z < 0 || z >= this.dims[2]) continue;
        const id = this.index(x, y, z);
        for (let i = this.cellStart[id]; i < this.cellStart[id + 1]; i++) {
          const t = this.cellItems[i];
          if (this.stamp[t] === q) continue;
          this.stamp[t] = q;
          const d = closestPointDistSq(p[0], p[1], p[2], this.soup.tris, t * 9);
          if (d < best) best = d;
        }
        }
      }
    }
    return Math.sqrt(best);
  }

  /** Parity of crossings of an axis-aligned ray from p (in +axis direction). */
  private rayParity(p: V3, axis: 0 | 1 | 2): number {
    const b = ((axis + 1) % 3) as 0 | 1 | 2, cAx = ((axis + 2) % 3) as 0 | 1 | 2;
    const cell = this.cellOf(p);
    const inside = (a: number) => p[a] >= this.origin[a] && p[a] <= this.origin[a] + this.dims[a] * this.cell;
    if (!inside(b) || !inside(cAx)) return 0;
    const q = this.nextQuery();
    let crossings = 0;
    const T = this.soup.tris;
    const coord = [0, 0, 0];
    for (let s = cell[axis]; s < this.dims[axis]; s++) {
      coord[axis] = s; coord[b] = cell[b]; coord[cAx] = cell[cAx];
      const id = this.index(coord[0], coord[1], coord[2]);
      for (let i = this.cellStart[id]; i < this.cellStart[id + 1]; i++) {
        const t = this.cellItems[i];
        if (this.stamp[t] === q) continue;
        this.stamp[t] = q;
        const o = t * 9;
        // 2-D point-in-triangle in the (b, c) plane, then compare the hit's axis coordinate.
        const u0 = T[o + b] - p[b], v0 = T[o + cAx] - p[cAx];
        const u1 = T[o + 3 + b] - p[b], v1 = T[o + 3 + cAx] - p[cAx];
        const u2 = T[o + 6 + b] - p[b], v2 = T[o + 6 + cAx] - p[cAx];
        const w0 = u1 * v2 - u2 * v1, w1 = u2 * v0 - u0 * v2, w2 = u0 * v1 - u1 * v0;
        if (!((w0 > 0 && w1 > 0 && w2 > 0) || (w0 < 0 && w1 < 0 && w2 < 0))) continue;
        const sum = w0 + w1 + w2;
        const hit = (w0 * T[o + axis] + w1 * T[o + 3 + axis] + w2 * T[o + 6 + axis]) / sum;
        if (hit > p[axis]) crossings++;
      }
    }
    return crossings & 1;
  }

  /** Majority vote of three slightly offset axis rays; robust to a ray grazing an edge. */
  contains(p: V3, jitter: number): boolean {
    const votes = this.rayParity([p[0], p[1] + jitter * 0.618, p[2] + jitter * 0.382], 0)
      + this.rayParity([p[0] + jitter * 0.382, p[1], p[2] + jitter * 0.618], 1)
      + this.rayParity([p[0] + jitter * 0.618, p[1] + jitter * 0.382, p[2]], 2);
    return votes >= 2;
  }
}

// ── Deterministic surface sampling ────────────────────────────

export type Samples = { points: Float64Array; component: Uint32Array; areaEach: number; totalArea: number };

/**
 * Area-weighted samples with error diffusion (so the count is exact) and an
 * R2 low-discrepancy sequence inside each triangle (so positions are
 * deterministic and evenly spread). Same soup in, same samples out.
 */
export function sampleSurface(soup: Soup, cap: number): Samples {
  const T = soup.tris;
  const n = T.length / 9;
  const areas = new Float64Array(n);
  let total = 0;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const abx = T[o + 3] - T[o], aby = T[o + 4] - T[o + 1], abz = T[o + 5] - T[o + 2];
    const acx = T[o + 6] - T[o], acy = T[o + 7] - T[o + 1], acz = T[o + 8] - T[o + 2];
    areas[t] = 0.5 * Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    total += areas[t];
  }
  const count = total > 0 ? cap : 0;
  const pts: number[] = [];
  const comp: number[] = [];
  let carry = 0;
  let k = 0;
  const a1 = 0.7548776662466927, a2 = 0.5698402909980532;
  for (let t = 0; t < n && total > 0; t++) {
    carry += (areas[t] / total) * count;
    let m = Math.floor(carry);
    carry -= m;
    const o = t * 9;
    while (m-- > 0) {
      k++;
      let u = (0.5 + a1 * k) % 1, v = (0.5 + a2 * k) % 1;
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      for (let d = 0; d < 3; d++) pts.push(T[o + d] + u * (T[o + 3 + d] - T[o + d]) + v * (T[o + 6 + d] - T[o + d]));
      comp.push(soup.component[t]);
    }
  }
  const got = comp.length;
  return { points: Float64Array.from(pts), component: Uint32Array.from(comp), areaEach: got ? total / got : 0, totalArea: total };
}

// ── Report types ──────────────────────────────────────────────

export type ModelSummary = {
  format: string;
  units: { unit: LengthUnit | null; source: "file" | "format-spec" | "declared" | null; note: string };
  scaleToComparison: number;
  bbox: { min: V3; max: V3; size: V3 } | null;
  triangleCount: number;
  topology: Topology;
  volume: Volume;
  componentCount: number;
  componentStructure: "named" | "none";
  conversion: ParsedModel["conversion"];
  warnings: string[];
};

export type OverlayKind = "added" | "removed" | "changed";
export type ComponentRow = {
  name: string;
  status: "UNCHANGED" | "MOVED" | "MODIFIED" | "ADDED" | "REMOVED" | "NOT_COMPARED";
  before: { size: V3; volume: Volume } | null;
  after: { size: V3; volume: Volume } | null;
  translation: V3 | null;
  maxDeviation: number | null;
  volumeDelta: number | null;
};

export type GeometryDiffReport = {
  algorithmVersion: string;
  status: "COMPLETE";
  units: { comparison: LengthUnit | null; note: string };
  tolerance: { value: number; unit: LengthUnit | null; source: "auto" | "requested"; note: string };
  before: ModelSummary;
  after: ModelSummary;
  summary: {
    verdict: "IDENTICAL_WITHIN_TOLERANCE" | "TRANSLATED" | "CHANGED";
    translation: V3 | null;
    maxDeviation: { beforeToAfter: number; afterToBefore: number; capped: boolean; searchLimit: number };
    deviatingArea: { added: number; removed: number; changed: number; estimate: true; sampleCount: { before: number; after: number } };
    materialClassification: "INSIDE_OUTSIDE_TEST" | "UNAVAILABLE";
    volumeDelta: { value: number; exactness: "EXACT_FOR_STORED_MESH" | "TESSELLATION_APPROXIMATION" } | null;
    bboxDelta: V3;
  };
  components: { compared: boolean; note: string; rows: ComponentRow[] };
  overlay: {
    frame: { center: V3; radius: number };
    /** [x, y, z, kind (0 added, 1 removed, 2 changed), deviation] in comparison units, on each model's own surface. */
    before: number[][];
    after: number[][];
    arrows: { from: V3; to: V3; label: string }[];
    pointCaps: { before: boolean; after: boolean };
  };
  limitations: string[];
};

const KIND_CODE: Record<OverlayKind, number> = { added: 0, removed: 1, changed: 2 };

// ── Diff ──────────────────────────────────────────────────────

export type DiffOptions = {
  declaredUnits?: LengthUnit | null;
  tolerance?: number | null;
  sampleCap?: number;
};

type Side = { model: ParsedModel; soup: Soup; unit: LengthUnit | null; unitSource: ModelSummary["units"]["source"]; scale: number; topo: ReturnType<typeof topologyOf>; volume: Volume; solid: boolean };

function resolveUnits(before: ParsedModel, after: ParsedModel, declared: LengthUnit | null | undefined) {
  const pick = (m: ParsedModel) => m.units
    ? { unit: m.units, source: m.unitsSource }
    : declared ? { unit: declared, source: "declared" as const } : { unit: null, source: null };
  const b = pick(before), a = pick(after);
  const comparison = b.unit ?? a.unit ?? null;
  const notes: string[] = [];
  if (declared) {
    const ignored = [before, after].filter((m) => m.units && m.units !== declared);
    if (ignored.length) notes.push(`The declared unit (${declared}) was ignored for ${ignored.map((m) => m.format.toUpperCase()).join(" and ")}, which declares its own unit.`);
  }
  if (b.unit && a.unit && b.unit !== a.unit) notes.push(`The after model (${a.unit}) was rescaled into ${b.unit} before comparing.`);
  if (!b.unit !== !a.unit) notes.push("Only one model has a known unit; both are compared as if they used it. Declare the missing unit to be sure.");
  if (!comparison) notes.push("Neither file declares a unit. Lengths are in the file's own model units and no volume is reported.");
  const scaleOf = (u: LengthUnit | null) => (u && comparison ? UNIT_TO_MM[u] / UNIT_TO_MM[comparison] : 1);
  return { b, a, comparison, scaleB: scaleOf(b.unit), scaleA: scaleOf(a.unit), note: notes.join(" ") || `Both models are in ${comparison}.` };
}

function makeSide(model: ParsedModel, unit: LengthUnit | null, unitSource: Side["unitSource"], scale: number, weldEps: number): Side {
  const soup = toSoup(model.meshes, scale);
  const topo = topologyOf(soup, weldEps);
  const volume = volumeOf(topo, unit, model.format === "step");
  return { model, soup, unit, unitSource, scale, topo, volume, solid: topo.closed && topo.manifold && topo.oriented };
}

function componentVolume(side: Side, soup: Soup, weldEps: number): { soup: Soup; volume: Volume; solid: boolean } {
  const topo = topologyOf(soup, weldEps);
  return { soup, volume: volumeOf(topo, side.unit, side.model.format === "step"), solid: topo.closed && topo.manifold && topo.oriented };
}

function summarize(side: Side, unitNote: string): ModelSummary {
  const b = side.soup.box;
  const { signedVolume: _ignored, ...topology } = side.topo;
  return {
    format: side.model.format,
    units: { unit: side.unit, source: side.unitSource, note: unitNote },
    scaleToComparison: side.scale,
    bbox: Number.isFinite(b.min[0]) ? { min: sig3(b.min), max: sig3(b.max), size: sig3(boxSize(b)) } : null,
    triangleCount: side.topo.triangleCount,
    topology,
    volume: { ...side.volume, value: side.volume.value === null ? null : sig(side.volume.value) },
    componentCount: side.model.meshes.length,
    componentStructure: side.model.componentStructure,
    conversion: side.model.conversion,
    warnings: side.model.warnings,
  };
}

/** Largest distance from any sample to the other grid, and whether a shift by `d` makes every sample fit within tol. */
function fitsWithShift(samples: Samples, grid: TriangleGrid, d: V3, tol: number): boolean {
  const p: V3 = [0, 0, 0];
  for (let i = 0; i < samples.points.length; i += 3) {
    p[0] = samples.points[i] + d[0]; p[1] = samples.points[i + 1] + d[1]; p[2] = samples.points[i + 2] + d[2];
    if (grid.nearest(p, tol * 1.0001) > tol) return false;
  }
  return true;
}

function translationBetween(a: Soup, b: Soup, sa: Samples, sb: Samples, ga: TriangleGrid, gb: TriangleGrid, tol: number): V3 | null {
  const sizeA = boxSize(a.box), sizeB = boxSize(b.box);
  if (sizeA.some((s, i) => Math.abs(s - sizeB[i]) > tol)) return null;
  const ca = boxCenter(a.box), cb = boxCenter(b.box);
  const d: V3 = [cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]];
  if (Math.hypot(...d) <= tol) return null;
  if (!fitsWithShift(sa, gb, d, tol)) return null;
  if (!fitsWithShift(sb, ga, [-d[0], -d[1], -d[2]], tol)) return null;
  return d;
}

function strided<T>(items: T[], cap: number): { items: T[]; capped: boolean } {
  if (items.length <= cap) return { items, capped: false };
  const step = items.length / cap;
  return { items: Array.from({ length: cap }, (_, i) => items[Math.floor(i * step)]), capped: true };
}

type Scan = { deviating: number[]; shown: number[]; full: Map<number, number>; max: number; capped: boolean; exhaustive: boolean };

/** Tolerance-bounded pass over every sample, then full distances for the strided subset that the overlay shows. */
function scanDeviations(s: Samples, grid: TriangleGrid, tol: number, fullLimit: number, noise: number, subsetCap: number): Scan {
  const probe = tol * 1.0001;
  const p: V3 = [0, 0, 0];
  const deviating: number[] = [];
  let max = 0;
  for (let i = 0; i < s.points.length / 3; i++) {
    p[0] = s.points[i * 3]; p[1] = s.points[i * 3 + 1]; p[2] = s.points[i * 3 + 2];
    const d = grid.nearest(p, probe);
    if (d >= probe) deviating.push(i); else if (d > max) max = d;
  }
  const { items: shown } = strided(deviating, subsetCap);
  const full = new Map<number, number>();
  let capped = false;
  for (const i of shown) {
    p[0] = s.points[i * 3]; p[1] = s.points[i * 3 + 1]; p[2] = s.points[i * 3 + 2];
    const d = grid.nearest(p, fullLimit);
    if (d >= fullLimit) capped = true;
    full.set(i, d);
    if (d > max) max = d;
  }
  return { deviating, shown, full, max: max < noise ? 0 : max, capped, exhaustive: shown.length === deviating.length };
}

export function diffModels(beforeModel: ParsedModel, afterModel: ParsedModel, opts: DiffOptions = {}): GeometryDiffReport {
  const units = resolveUnits(beforeModel, afterModel, opts.declaredUnits);
  // Weld epsilon: far below any real feature, above float32 noise in STL/glTF.
  const rawDiag = Math.max(boxDiag(toSoup(beforeModel.meshes, units.scaleB).box), boxDiag(toSoup(afterModel.meshes, units.scaleA).box), 1e-12);
  const weldEps = rawDiag * 1e-9;
  const before = makeSide(beforeModel, units.b.unit, units.b.source, units.scaleB, weldEps);
  const after = makeSide(afterModel, units.a.unit, units.a.source, units.scaleA, weldEps);
  const diag = Math.max(boxDiag(before.soup.box), boxDiag(after.soup.box));

  // Tolerance: requested, or a small fraction of the model size — never below
  // the STEP tessellation's own chordal error, which would flag unchanged
  // curved faces as different.
  const deflection = Math.max(beforeModel.conversion?.linearDeflection ?? 0, afterModel.conversion?.linearDeflection ?? 0) * (units.comparison ? 1 / UNIT_TO_MM[units.comparison] : 1);
  const requested = opts.tolerance != null && opts.tolerance > 0;
  const tol = requested ? opts.tolerance! : Math.max(diag * AUTO_TOLERANCE_RATIO, deflection * 2);
  const tolNotes: string[] = [];
  if (!requested) tolNotes.push(deflection > 0 && deflection * 2 > diag * AUTO_TOLERANCE_RATIO ? "Automatic: twice the STEP tessellation deflection, so re-tessellated but unchanged curved faces are not flagged." : `Automatic: ${AUTO_TOLERANCE_RATIO * 100}% of the larger bounding-box diagonal.`);
  if (requested && deflection > 0 && tol < deflection * 2) tolNotes.push(`This tolerance is below twice the STEP tessellation deflection (${sig(deflection * 2, 3)}); unchanged curved faces may be flagged as changed.`);
  tolNotes.push("Two surfaces closer than this are treated as the same surface.");

  const cap = opts.sampleCap ?? DEFAULT_SAMPLE_CAP;
  const union = emptyBox();
  for (const b of [before.soup.box, after.soup.box]) { growBox(union, ...b.min); growBox(union, ...b.max); }
  const pad = tol * 2 + diag * 1e-6;
  const bounds: Box = { min: union.min.map((v) => v - pad) as V3, max: union.max.map((v) => v + pad) as V3 };
  const gridB = new TriangleGrid(before.soup, bounds);
  const gridA = new TriangleGrid(after.soup, bounds);
  const sampB = sampleSurface(before.soup, cap);
  const sampA = sampleSurface(after.soup, cap);
  const searchLimit = Math.max(diag * SEARCH_LIMIT_RATIO, tol * 4);
  const jitter = diag * 1e-7;
  const materialKnown = before.solid && after.solid;

  const noise = weldEps * 10;
  const scanB = scanDeviations(sampB, gridA, tol, searchLimit, noise, OVERLAY_POINT_CAP); // before surface → after model
  const scanA = scanDeviations(sampA, gridB, tol, searchLimit, noise, OVERLAY_POINT_CAP); // after surface → before model
  const maxBA = scanB.max, maxAB = scanA.max;
  const changed = scanB.deviating.length > 0 || scanA.deviating.length > 0;

  const translation = changed ? translationBetween(before.soup, after.soup, sampB, sampA, gridB, gridA, tol) : null;
  const verdict: GeometryDiffReport["summary"]["verdict"] = !changed ? "IDENTICAL_WITHIN_TOLERANCE" : translation ? "TRANSLATED" : "CHANGED";

  // Classify deviating samples. Before-surface outside the after solid was
  // removed; inside it, the after model added material around it. After-surface
  // outside the before solid is added material; inside it, a cut.
  const area = { added: 0, removed: 0, changed: 0 };
  const classify = (s: Samples, scan: Scan, otherGrid: TriangleGrid, side: "before" | "after"): number[][] => {
    if (verdict !== "CHANGED") return [];
    const p: V3 = [0, 0, 0];
    const kinds = new Map<number, OverlayKind>();
    for (const i of scan.deviating) {
      p[0] = s.points[i * 3]; p[1] = s.points[i * 3 + 1]; p[2] = s.points[i * 3 + 2];
      let kind: OverlayKind = "changed";
      if (materialKnown) {
        const inOther = otherGrid.contains(p, jitter);
        kind = side === "before" ? (inOther ? "added" : "removed") : (inOther ? "removed" : "added");
      }
      area[kind] += s.areaEach;
      kinds.set(i, kind);
    }
    return scan.shown.map((i) => [sig(s.points[i * 3]), sig(s.points[i * 3 + 1]), sig(s.points[i * 3 + 2]), KIND_CODE[kinds.get(i)!], sig(scan.full.get(i)!, 4)]);
  };
  const beforePts = classify(sampB, scanB, gridA, "before");
  const afterPts = classify(sampA, scanA, gridB, "after");

  const arrows: GeometryDiffReport["overlay"]["arrows"] = [];
  if (translation) arrows.push({ from: sig3(boxCenter(before.soup.box)), to: sig3(boxCenter(after.soup.box)), label: "Whole model moved" });

  // Components, matched by name.
  const components = compareComponents(before, after, tol, weldEps, bounds, cap, arrows);

  const volumeDelta = before.volume.status === "COMPUTED" && after.volume.status === "COMPUTED"
    ? { value: sig(after.volume.value! - before.volume.value!), exactness: before.volume.exactness === "EXACT_FOR_STORED_MESH" && after.volume.exactness === "EXACT_FOR_STORED_MESH" ? "EXACT_FOR_STORED_MESH" as const : "TESSELLATION_APPROXIMATION" as const }
    : null;

  const limitations = [
    "Rotations are not detected: a rotated part appears as removed plus added material.",
    "Deviating areas are estimates from deterministic surface samples; bounding boxes and mesh volumes are computed from every triangle.",
    `Maximum deviation is measured on up to ${OVERLAY_POINT_CAP.toLocaleString("en-US")} changed sample points per side (the ones drawn in the overlay), so it is a sampled estimate.`,
  ];
  if (!materialKnown) limitations.push("At least one model is not a closed, consistently oriented solid, so changed surfaces cannot be labelled as added or removed material.");
  if ([beforeModel, afterModel].some((m) => m.format === "step")) limitations.push("STEP files are compared through their tessellation, not their exact B-rep surfaces.");

  const frameBox = union;
  return {
    algorithmVersion: GEOMETRY_ALGORITHM_VERSION,
    status: "COMPLETE",
    units: { comparison: units.comparison, note: units.note },
    tolerance: { value: sig(tol, 4), unit: units.comparison, source: requested ? "requested" : "auto", note: tolNotes.join(" ") },
    before: summarize(before, units.b.source === "declared" ? "Declared by the member who requested this diff." : beforeModel.unitsNote),
    after: summarize(after, units.a.source === "declared" ? "Declared by the member who requested this diff." : afterModel.unitsNote),
    summary: {
      verdict, translation: translation ? sig3(translation) : null,
      maxDeviation: { beforeToAfter: sig(maxBA, 4), afterToBefore: sig(maxAB, 4), capped: scanB.capped || scanA.capped, searchLimit: sig(searchLimit, 4) },
      deviatingArea: { added: sig(area.added, 4), removed: sig(area.removed, 4), changed: sig(area.changed, 4), estimate: true, sampleCount: { before: sampB.component.length, after: sampA.component.length } },
      materialClassification: materialKnown ? "INSIDE_OUTSIDE_TEST" : "UNAVAILABLE",
      volumeDelta,
      bboxDelta: sig3(boxSize(after.soup.box).map((s, i) => s - boxSize(before.soup.box)[i]) as V3),
    },
    components,
    overlay: {
      frame: { center: sig3(boxCenter(frameBox)), radius: sig(boxDiag(frameBox) / 2) },
      before: beforePts, after: afterPts, arrows, pointCaps: { before: !scanB.exhaustive, after: !scanA.exhaustive },
    },
    limitations,
  };
}

function compareComponents(before: Side, after: Side, tol: number, weldEps: number, bounds: Box, cap: number, arrows: GeometryDiffReport["overlay"]["arrows"]): GeometryDiffReport["components"] {
  const structured = [before, after].filter((s) => s.model.componentStructure === "named");
  if (structured.length === 0) {
    return { compared: false, note: `${[...new Set([before.model.format, after.model.format])].map((f) => f.toUpperCase()).join(" and ")} ${before.model.format === after.model.format ? "has" : "have"} no component structure in these files, so only the whole model is compared.`, rows: [] };
  }
  const names = new Set([...before.model.meshes.map((m) => m.name), ...after.model.meshes.map((m) => m.name)]);
  const tooMany = names.size > COMPONENT_DIFF_CAP;
  const rows: ComponentRow[] = [];
  const beforeParts = splitSoup(before.soup, before.model.meshes.length);
  const afterParts = splitSoup(after.soup, after.model.meshes.length);
  const perCap = Math.max(500, Math.floor(cap / Math.max(1, Math.min(names.size, 20))));
  for (const name of [...names].sort((x, y) => x.localeCompare(y))) {
    const bi = before.model.meshes.findIndex((m) => m.name === name);
    const ai = after.model.meshes.findIndex((m) => m.name === name);
    const bc = bi >= 0 ? componentVolume(before, beforeParts[bi], weldEps) : null;
    const ac = ai >= 0 ? componentVolume(after, afterParts[ai], weldEps) : null;
    const pack = (c: typeof bc) => (c ? { size: sig3(boxSize(c.soup.box)), volume: { ...c.volume, value: c.volume.value === null ? null : sig(c.volume.value) } } : null);
    const row: ComponentRow = { name, status: bc && ac ? "NOT_COMPARED" : bc ? "REMOVED" : "ADDED", before: pack(bc), after: pack(ac), translation: null, maxDeviation: null, volumeDelta: null };
    if (bc && ac) {
      if (bc.volume.status === "COMPUTED" && ac.volume.status === "COMPUTED") row.volumeDelta = sig(ac.volume.value! - bc.volume.value!);
      if (!tooMany) {
        const gb = new TriangleGrid(bc.soup, bounds, 24 ** 3), ga = new TriangleGrid(ac.soup, bounds, 24 ** 3);
        const sb = sampleSurface(bc.soup, perCap), sa = sampleSurface(ac.soup, perCap);
        const limit = Math.max(Math.max(boxDiag(bc.soup.box), boxDiag(ac.soup.box)) * SEARCH_LIMIT_RATIO, tol * 4);
        const scans = [scanDeviations(sb, ga, tol, limit, weldEps * 10, 500), scanDeviations(sa, gb, tol, limit, weldEps * 10, 500)];
        const maxDev = Math.max(scans[0].max, scans[1].max);
        row.maxDeviation = sig(maxDev, 4);
        if (scans.every((x) => x.deviating.length === 0)) row.status = "UNCHANGED";
        else {
          const t = translationBetween(bc.soup, ac.soup, sb, sa, gb, ga, tol);
          if (t) {
            row.status = "MOVED"; row.translation = sig3(t);
            arrows.push({ from: sig3(boxCenter(bc.soup.box)), to: sig3(boxCenter(ac.soup.box)), label: name });
          } else row.status = "MODIFIED";
        }
      }
    }
    rows.push(row);
  }
  const oneSided = structured.length === 1;
  const notes = ["Components are matched by name; a renamed component appears as one removed and one added."];
  if (oneSided) notes.push(`Only the ${structured[0] === before ? "before" : "after"} file has named components, so most rows will show as added or removed.`);
  if (tooMany) notes.push(`More than ${COMPONENT_DIFF_CAP} components: presence and volumes are listed, but per-component deviation was skipped to bound the run time.`);
  return { compared: true, note: notes.join(" "), rows };
}
