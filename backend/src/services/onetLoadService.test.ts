import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { loadOnetFile, type OnetLoadStore } from "./onetLoadService.js";
import type { OnetSubset } from "./onetCsvCore.js";

type Row = Record<string, any>;
const tableNames = ["onetOccupation", "onetElement", "onetRating", "onetSoftware", "onetOccupationDwa",
  "onetJobTitle", "onetEmergingTask", "onetRelatedOccupation"];
function memoryStore() {
  const state: Record<string, Row[]> = Object.fromEntries(tableNames.map(name => [name, [{ old: true }]]));
  state.onetRelease = [{ version: "30.0", active: true, sourceSha256: "old-hash" }];
  state.skillOnetLink = [];
  const calls: { name: string; operation: string; size?: number }[] = [];
  let failure = "", transactions = 0;
  const store = {
    async $transaction(run: (tx: any) => Promise<any>, options: { timeout: number; maxWait: number }) {
      transactions++;
      assert.equal(options.timeout, 300_000);
      assert.equal(options.maxWait, 20_000);
      const draft = structuredClone(state);
      const tx: Record<string, any> = {
        async $executeRaw(strings: TemplateStringsArray) {
          assert.match(strings.join(""), /pg_advisory_xact_lock.*skills-catalog/);
          calls.push({ name: "lock", operation: "lock" });
        },
      };
      for (const name of tableNames) tx[name] = {
        async deleteMany() { calls.push({ name, operation: "delete" }); draft[name] = []; },
        async createMany({ data }: { data: Row[] }) {
          calls.push({ name, operation: "insert", size: data.length });
          if (failure === name) throw new Error("injected insert failure");
          draft[name].push(...structuredClone(data));
          return { count: data.length };
        },
      };
      tx.onetRelease = {
        async updateMany() { draft.onetRelease.forEach(row => { row.active = false; }); },
        async upsert({ where, create, update }: Row) {
          const row = draft.onetRelease.find(row => row.version === where.version);
          if (row) Object.assign(row, update); else draft.onetRelease.push(create);
        },
      };
      tx.skillOnetLink = { async findMany() {
        if (failure === "skillOnetLink") throw new Error("injected report failure");
        return structuredClone(draft.skillOnetLink);
      } };
      const result = await run(tx);
      Object.assign(state, draft);
      return result;
    },
  } as OnetLoadStore;
  return { store, state, calls, fail: (table: string) => { failure = table; }, transactions: () => transactions };
}

// Ten source rows exercise every compact relation except related occupations (covered below).
function fixture(): OnetSubset {
  return {
    meta: { version: "31.0", releasedOn: "2026-08", files: {} },
    occ: [["17-2011.00", "Engineer", "Designs aircraft"]],
    el: [["4.A.1", "Actual GWA name", "GWA description"], ["4.A.1.a", "Actual IWA name", "IWA description"]],
    rat: [["17-2011.00", "2.A.1", "IM", 4.2, true, false]],
    sw: [["17-2011.00", "Dassault Systemes SolidWorks software", "2.E.9.c", true, false]],
    dwa: [["4.A.1", "4.A.1.a", "4.A.1.a.1", "Design aircraft"]],
    odwa: [["17-2011.00", "4.A.1.a.1"]], jt: [["17-2011.00", "AÉROSPACE Engineer"]],
    jz: [["17-2011.00", 4]], em: [["17-2011.00", "New aircraft task", "New"]], rel: [],
  };
}

const directory = await mkdtemp(join(tmpdir(), "onet-loader-"));
const path = join(directory, "fixture.json.gz");
async function write(value: unknown): Promise<Buffer> {
  const bytes = gzipSync(JSON.stringify(value)); await writeFile(path, bytes); return bytes;
}
let passed = 0;
async function test(name: string, run: () => Promise<void>) {
  await run(); passed++; console.log(`ok ${passed} - ${name}`);
}
try {
  await test("10-row fixture atomically loads all fields, normalization, SHA and hierarchy", async () => {
    const s = fixture(); assert.equal(Object.values(s).filter(Array.isArray).reduce((n, rows) => n + rows.length, 0), 10);
    const bytes = await write(s); const db = memoryStore();
    const result = await loadOnetFile(path, db.store);
    assert.equal(result.sourceSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(result.counts.elements, 3);
    assert.equal(db.calls[0].name, "lock");
    assert.equal(db.state.onetOccupation[0].jobZone, 4);
    assert.deepEqual(db.state.onetRating[0], { occupationCode: "17-2011.00", elementId: "2.A.1", scale: "IM", value: 4.2, suppress: true, notRelevant: false });
    assert.equal(db.state.onetSoftware[0].exampleNorm, "solidworks");
    assert.equal(db.state.onetJobTitle[0].titleNorm, "aerospace engineer");
    const elements = new Map(db.state.onetElement.map(row => [row.id, row]));
    assert.equal(elements.get("4.A.1")?.name, "Actual GWA name");
    assert.equal(elements.get("4.A.1")?.domain, "GWA");
    assert.equal(elements.get("4.A.1.a")?.name, "Actual IWA name");
    assert.equal(elements.get("4.A.1.a")?.domain, "IWA");
    assert.equal(elements.get("4.A.1.a")?.parentId, "4.A.1");
    assert.equal(elements.get("4.A.1.a.1")?.parentId, "4.A.1.a");
    assert.equal(elements.get("4.A.1.a.1")?.domain, "DWA");
    assert.deepEqual(db.state.onetEmergingTask[0], { occupationCode: "17-2011.00", task: "New aircraft task", category: "New" });
    assert.deepEqual(db.state.onetOccupationDwa[0], { occupationCode: "17-2011.00", dwaId: "4.A.1.a.1" });
  });
  await test("double load is idempotent, switches active release and retains history", async () => {
    await write(fixture()); const db = memoryStore();
    await loadOnetFile(path, db.store);
    const before = structuredClone(db.state);
    await loadOnetFile(path, db.store);
    for (const table of tableNames) assert.deepEqual(db.state[table], before[table]);
    assert.equal(db.state.onetRelease.length, 2);
    assert.equal(db.state.onetRelease.find(row => row.version === "30.0")?.sourceSha256, "old-hash");
    assert.deepEqual(db.state.onetRelease.filter(row => row.active).map(row => row.version), ["31.0"]);
  });
  await test("insert failure rolls back deletes, release switch and all partial writes", async () => {
    await write(fixture()); const db = memoryStore(); const before = structuredClone(db.state);
    db.fail("onetJobTitle");
    await assert.rejects(loadOnetFile(path, db.store), /injected insert failure/);
    assert.deepEqual(db.state, before);
  });
  await test("failure after release activation also rolls back reference rows and release history", async () => {
    await write(fixture()); const db = memoryStore(); const before = structuredClone(db.state);
    db.fail("skillOnetLink");
    await assert.rejects(loadOnetFile(path, db.store), /injected report failure/);
    assert.deepEqual(db.state, before);
  });
  await test("invalid version, corrupt gzip and malformed row fail before transaction", async () => {
    const db = memoryStore();
    await write({ ...fixture(), meta: { version: "32.0" } });
    await assert.rejects(loadOnetFile(path, db.store), /Expected O\*NET 31.0/);
    await writeFile(path, "corrupt"); await assert.rejects(loadOnetFile(path, db.store));
    await write({ ...fixture(), rat: [["bad"]] });
    await assert.rejects(loadOnetFile(path, db.store), /Invalid O\*NET rat row/);
    assert.equal(db.transactions(), 0);
  });
  await test("creates at most 5,000 rows per batch, with no lost tail", async () => {
    const s = fixture(); s.jt = Array.from({ length: 10_001 }, (_, i) => ["17-2011.00", `Title ${i}`]);
    await write(s); const db = memoryStore(); await loadOnetFile(path, db.store);
    assert.deepEqual(db.calls.filter(c => c.name === "onetJobTitle" && c.operation === "insert").map(c => c.size), [5000, 5000, 1]);
    assert.equal(db.state.onetJobTitle.length, 10_001);
    assert.ok(db.calls.filter(c => c.operation === "insert").every(c => c.size! <= 5000));
  });
  await test("dangling SOFTWARE, ELEMENT and DWA refs reported and links preserved", async () => {
    await write(fixture()); const db = memoryStore();
    const refs = [["SOFTWARE", "solidworks"], ["ELEMENT", "4.A.1"], ["DWA", "4.A.1.a.1"],
      ["SOFTWARE", "missing"], ["ELEMENT", "missing"], ["DWA", "missing"], ["DWA", "4.A.1"]];
    db.state.skillOnetLink = refs.map(([kind, ref], i) => ({ id: String(i), skillId: "skill", kind, ref }));
    const links = structuredClone(db.state.skillOnetLink);
    const report = await loadOnetFile(path, db.store);
    assert.deepEqual(report.danglingLinks.map(link => link.id), ["3", "4", "5", "6"]);
    assert.deepEqual(db.state.skillOnetLink, links);
  });
  await test("prefix domains, category parents, related rows and absent job zones", async () => {
    const s = fixture();
    const domains = ["ESSENTIAL_SKILL", "TRANSFERABLE_SKILL", "KNOWLEDGE", "WORK_STYLE", "SOFTWARE_CATEGORY", "OTHER"];
    const ids = ["2.A.1.a", "2.B.1.a", "2.C.1.a", "1.D.1.a", "2.E.9.c", "2.ABC.x"];
    s.el.push(...ids.map(id => [id, id, "Description"] as [string, string, string]));
    s.jz = []; s.rel = [["17-2011.00", "17-2012.00", "Primary-Short", 1]];
    await write(s); const db = memoryStore(); await loadOnetFile(path, db.store);
    ids.forEach((id, i) => {
      const row = db.state.onetElement.find(row => row.id === id)!;
      assert.equal(row.domain, domains[i]); assert.equal(row.parentId, id.slice(0, id.lastIndexOf(".")));
    });
    assert.equal(db.state.onetOccupation[0].jobZone, null);
    assert.deepEqual(db.state.onetRelatedOccupation[0], { occupationCode: "17-2011.00", relatedCode: "17-2012.00", tier: "Primary-Short", rank: 1 });
  });
  await test("missing GWA/IWA names and conflicting hierarchy fail without writes", async () => {
    for (const id of ["4.A.1", "4.A.1.a"]) {
      const s = fixture(); s.el = s.el.filter(row => row[0] !== id);
      await write(s); const db = memoryStore();
      await assert.rejects(loadOnetFile(path, db.store), /Missing O\*NET/);
      assert.equal(db.transactions(), 0);
    }
    const s = fixture(); s.el.push(["4.A.2", "Other GWA", ""]);
    s.dwa.push(["4.A.2", "4.A.1.a", "4.A.1.a.1", "Conflicting"]);
    await write(s); const db = memoryStore();
    await assert.rejects(loadOnetFile(path, db.store), /Conflicting O\*NET/);
    assert.equal(db.transactions(), 0);
  });
  console.log(`${passed} O*NET loader tests passed.`);
} finally {
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  await rm(directory, { recursive: true, force: true });
}
