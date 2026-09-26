// Constellation Vault — Phase 9 geometry fixture generators. Every fixture the
// geometry-diff tests use is produced here from a few numbers, so a fixture
// pair's expected dimensions and volumes can be read straight off the call
// site ("a 10×20×30 box moved 5 along X") instead of trusted from a binary
// blob. Nothing here is imported by production code.

export type Vec3 = [number, number, number];
export type Tri = [Vec3, Vec3, Vec3];
export type FixtureComponent = { name: string; tris: Tri[] };

/** Twelve outward-facing (counter-clockwise from outside) triangles of an axis-aligned box. */
export function boxTris(min: Vec3, max: Vec3): Tri[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const p = (x: number, y: number, z: number): Vec3 => [x, y, z];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Tri[] => [[a, b, c], [a, c, d]];
  return [
    ...quad(p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)), // -Z
    ...quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)), // +Z
    ...quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)), // -Y
    ...quad(p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0)), // +Y
    ...quad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)), // -X
    ...quad(p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)), // +X
  ];
}

export function translateTris(tris: Tri[], d: Vec3): Tri[] {
  return tris.map((t) => t.map((v) => [v[0] + d[0], v[1] + d[1], v[2] + d[2]]) as Tri);
}

/** Two boxes that share exactly one edge: that edge is used by four triangles, so the mesh is non-manifold. */
export function edgeSharingBoxes(): Tri[] {
  return [...boxTris([0, 0, 0], [10, 10, 10]), ...boxTris([10, 10, 0], [20, 20, 10])];
}

export function stlBinary(tris: Tri[]): Buffer {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write("constellation vault fixture", 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => {
    const o = 84 + i * 50;
    // Normal left zero: readers must not trust it, and ours recomputes.
    t.forEach((v, k) => v.forEach((c, j) => buf.writeFloatLE(c, o + 12 + k * 12 + j * 4)));
  });
  return buf;
}

export function stlAscii(components: FixtureComponent[]): Buffer {
  const lines: string[] = [];
  for (const c of components) {
    lines.push(`solid ${c.name}`);
    for (const t of c.tris) {
      lines.push("  facet normal 0 0 0", "    outer loop");
      for (const v of t) lines.push(`      vertex ${v[0]} ${v[1]} ${v[2]}`);
      lines.push("    endloop", "  endfacet");
    }
    lines.push(`endsolid ${c.name}`);
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

/** OBJ with one `o` block per component and shared, 1-based vertex indices. */
export function objText(components: FixtureComponent[]): Buffer {
  const lines = ["# constellation vault fixture"];
  let base = 1;
  for (const c of components) {
    lines.push(`o ${c.name}`);
    for (const t of c.tris) for (const v of t) lines.push(`v ${v[0]} ${v[1]} ${v[2]}`);
    c.tris.forEach((_, i) => lines.push(`f ${base + i * 3} ${base + i * 3 + 1} ${base + i * 3 + 2}`));
    base += c.tris.length * 3;
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

/** glTF 2.0 with one named node + mesh per component; `glb` wraps the same JSON and buffer. */
export function gltfModel(components: FixtureComponent[], opts: { glb?: boolean; nodeTranslation?: Vec3 } = {}): Buffer {
  const chunks: Buffer[] = [];
  const accessors: unknown[] = [];
  const bufferViews: unknown[] = [];
  const meshes: unknown[] = [];
  const nodes: unknown[] = [];
  let offset = 0;
  components.forEach((c, i) => {
    const data = Buffer.alloc(c.tris.length * 9 * 4);
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    let k = 0;
    for (const t of c.tris) for (const v of t) for (let j = 0; j < 3; j++) {
      data.writeFloatLE(v[j], k); k += 4;
      min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]);
    }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    accessors.push({ bufferView: i, componentType: 5126, count: c.tris.length * 3, type: "VEC3", min, max });
    meshes.push({ name: `${c.name}-mesh`, primitives: [{ attributes: { POSITION: i }, mode: 4 }] });
    nodes.push({ name: c.name, mesh: i, ...(opts.nodeTranslation ? { translation: opts.nodeTranslation } : {}) });
    chunks.push(data);
    offset += data.length;
  });
  const bin = Buffer.concat(chunks);
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "constellation vault fixture" },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors, bufferViews,
    buffers: [opts.glb ? { byteLength: bin.length } : { byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString("base64")}` }],
  };
  if (!opts.glb) return Buffer.from(JSON.stringify(json), "utf8");
  const pad = (b: Buffer, fill: number) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (len: number, type: number) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  return Buffer.concat([header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(binChunk.length, 0x004e4942), binChunk]);
}

/**
 * A minimal AP214 STEP file holding one axis-aligned block as a B-rep solid,
 * in millimetres (or inches), named `name`. Written entity-by-entity so the
 * fixture's exact geometry is visible here rather than hidden in a CAD export.
 */
export function stepBox(name: string, min: Vec3, max: Vec3, unit: "mm" | "inch" = "mm"): Buffer {
  const lines: string[] = [];
  let n = 0;
  const e = (body: string) => { n += 1; lines.push(`#${n}=${body};`); return `#${n}`; };
  const num = (v: number) => (Number.isInteger(v) ? `${v}.` : String(v));
  const pt = (v: Vec3) => e(`CARTESIAN_POINT('',(${v.map(num).join(",")}))`);
  const dir = (v: Vec3) => e(`DIRECTION('',(${v.map(num).join(",")}))`);
  const [x0, y0, z0] = min; const [x1, y1, z1] = max;
  const corners: Vec3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const vertices = corners.map((c) => e(`VERTEX_POINT('',${pt(c)})`));
  const edgeCache = new Map<string, string>();
  const edge = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    let id = edgeCache.get(key);
    if (!id) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const d = corners[hi].map((v, i) => v - corners[lo][i]) as Vec3;
      const len = Math.hypot(...d);
      const line = e(`LINE('',${pt(corners[lo])},${e(`VECTOR('',${dir(d.map((v) => v / len) as Vec3)},${num(len)})`)})`);
      id = e(`EDGE_CURVE('',${vertices[lo]},${vertices[hi]},${line},.T.)`);
      edgeCache.set(key, id);
    }
    return { id, sameSense: a < b };
  };
  // Each face lists its corners counter-clockwise seen from outside.
  const faces: { loop: number[]; normal: Vec3; ref: Vec3 }[] = [
    { loop: [0, 3, 2, 1], normal: [0, 0, -1], ref: [1, 0, 0] },
    { loop: [4, 5, 6, 7], normal: [0, 0, 1], ref: [1, 0, 0] },
    { loop: [0, 1, 5, 4], normal: [0, -1, 0], ref: [1, 0, 0] },
    { loop: [3, 7, 6, 2], normal: [0, 1, 0], ref: [1, 0, 0] },
    { loop: [0, 4, 7, 3], normal: [-1, 0, 0], ref: [0, 1, 0] },
    { loop: [1, 2, 6, 5], normal: [1, 0, 0], ref: [0, 1, 0] },
  ];
  const faceIds = faces.map((f) => {
    const oriented = f.loop.map((a, i) => {
      const { id, sameSense } = edge(a, f.loop[(i + 1) % 4]);
      return e(`ORIENTED_EDGE('',*,*,${id},${sameSense ? ".T." : ".F."})`);
    });
    const loop = e(`EDGE_LOOP('',(${oriented.join(",")}))`);
    const bound = e(`FACE_OUTER_BOUND('',${loop},.T.)`);
    const plane = e(`PLANE('',${e(`AXIS2_PLACEMENT_3D('',${pt(corners[f.loop[0]])},${dir(f.normal)},${dir(f.ref)})`)})`);
    return e(`ADVANCED_FACE('',(${bound}),${plane},.T.)`);
  });
  const shell = e(`CLOSED_SHELL('',(${faceIds.join(",")}))`);
  const solid = e(`MANIFOLD_SOLID_BREP('${name}',${shell})`);
  const lengthUnit = unit === "mm"
    ? e("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))")
    : (() => {
        const metre = e("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT($,.METRE.))");
        const measure = e(`LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.0254),${metre})`);
        const dims = e("DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.)");
        return e(`(CONVERSION_BASED_UNIT('INCH',${measure})LENGTH_UNIT()NAMED_UNIT(${dims}))`);
      })();
  const angle = e("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))");
  const solidAngle = e("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
  const uncertainty = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${lengthUnit},'distance_accuracy_value','')`);
  const ctx = e(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${lengthUnit},${angle},${solidAngle}))REPRESENTATION_CONTEXT('',''))`);
  const origin = e(`AXIS2_PLACEMENT_3D('',${pt([0, 0, 0])},${dir([0, 0, 1])},${dir([1, 0, 0])})`);
  const rep = e(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${origin},${solid}),${ctx})`);
  const appCtx = e("APPLICATION_CONTEXT('automotive design')");
  e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
  const productCtx = e(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`);
  const product = e(`PRODUCT('${name}','${name}','',(${productCtx}))`);
  const formation = e(`PRODUCT_DEFINITION_FORMATION('','',${product})`);
  const defCtx = e(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`);
  const definition = e(`PRODUCT_DEFINITION('design','',${formation},${defCtx})`);
  const shape = e(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);
  e(`SHAPE_DEFINITION_REPRESENTATION(${shape},${rep})`);
  return Buffer.from([
    "ISO-10303-21;", "HEADER;",
    "FILE_DESCRIPTION(('constellation vault fixture'),'2;1');",
    `FILE_NAME('${name}.step','2026-09-26T00:00:00',(''),(''),'','','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", "ENDSEC;", "DATA;",
    ...lines, "ENDSEC;", "END-ISO-10303-21;", "",
  ].join("\n"), "utf8");
}
