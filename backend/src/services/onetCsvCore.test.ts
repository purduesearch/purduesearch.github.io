// Tiny inline fixtures only; no real O*NET files or network.
import assert from "node:assert/strict";
import { buildSubset, normalizeText, ONET_HEADERS, parseCsv, type OnetFiles, type OnetFileName } from "./onetCsvCore.js";

let passed = 0;
function test(name: string, run: () => void) {
  run(); passed++; console.log(`ok ${passed} - ${name}`);
}
function csv(rows: readonly (readonly string[])[]): string {
  return rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
}
function fixture(): OnetFiles {
  const files = Object.fromEntries(Object.entries(ONET_HEADERS).map(([name, header]) => [name, csv([header])])) as OnetFiles;
  const add = (name: OnetFileName, rows: string[][]) => { files[name] = csv([ONET_HEADERS[name], ...rows]); };
  add("occupation_data.csv", [["17-2011.00", "Aerospace Engineers", "Build aircraft, and more.\nSecond line."]]);
  add("content_model_reference.csv", [["2.A.1.a", "Reading", "Read technical material."]]);
  for (const name of ["essential_skills.csv", "transferable_skills.csv", "knowledge.csv"] as const) {
    add(name, [
      ["17-2011.00", "Engineers", "2.A.1.a", "Reading", "IM", "Importance", "4.12", "8", "0", "0", "0", "Y", "", "08/2026", "Analyst"],
      ["17-2011.00", "Engineers", "2.A.1.a", "Reading", "LV", "Level", "4.62", "8", "0", "0", "0", "N", "Y", "08/2026", "Analyst"],
      ["17-2011.00", "Engineers", "2.A.1.a", "Reading", "OTHER", "Other", "9", "8", "0", "0", "0", "N", "N", "08/2026", "Analyst"],
    ]);
  }
  add("work_styles.csv", [
    ["17-2011.00", "Engineers", "1.D.1.a", "Innovation", "DR", "Rank", "7.00", "08/2026", "AI/Expert"],
    ["17-2011.00", "Engineers", "1.D.1.a", "Innovation", "WI", "Impact", "2.30", "08/2026", "AI/Expert"],
  ]);
  add("software_skills.csv", [["17-2011.00", "Engineers", "CAD, \"Pro\"", "2.E.9.c", "CAD", "Y", "N"]]);
  add("gwas_to_iwas_to_dwas.csv", [["4.A", "GWA", "4.A.1", "IWA", "4.A.1.a", "Design"]]);
  add("tasks_to_dwas.csv", [
    ["17-2011.00", "Engineers", "1", "Task A", "4.A.1.a", "Design", "08/2026", "Analyst"],
    ["17-2011.00", "Engineers", "2", "Task B", "4.A.1.a", "Design", "08/2026", "Analyst"],
    ["17-2012.00", "Others", "3", "Task C", "4.A.1.a", "Design", "08/2026", "Analyst"],
  ]);
  add("job_titles.csv", [["17-2011.00", "Engineers", "Space Engineer", "", "Source"]]);
  add("job_zones.csv", [["17-2011.00", "Engineers", "4", "08/2026", "Analyst"]]);
  add("emerging_tasks.csv", [["17-2011.00", "Engineers", "Test autonomous aircraft.", "New", "", "", "08/2026", "Analyst"]]);
  add("related_occupations.csv", [["17-2011.00", "Engineers", "17-2012.00", "Others", "Primary-Short", "1"]]);
  return files;
}

test("BOM, commas, embedded CRLF, escaped quotes and trailing empty cells", () => {
  assert.deepEqual(parseCsv('\uFEFFa,b,c\r\n"a,b","line1\r\nline2","say ""yes"""\r\nx,,\r\n'),
    [["a", "b", "c"], ["a,b", "line1\r\nline2", 'say "yes"'], ["x", "", ""]]);
});
test("LF and missing final newline", () => assert.deepEqual(parseCsv('a,b\n"",z'), [["a", "b"], ["", "z"]]));
test("empty input and quoted empty final cell", () => {
  assert.deepEqual(parseCsv(""), []); assert.deepEqual(parseCsv('""'), [[""]]);
});
test("malformed quoting fails", () => {
  for (const text of ['"open', 'ab"c', '"a"extra', '"a""']) assert.throws(() => parseCsv(text), /CSV/);
});
test("normalization is lower-case, decomposed, diacritic-free and spaced", () => {
  assert.equal(normalizeText("  ÉLECTRO—Mágnetics / ﬃ １２３\tCAD++ "), "electro magnetics ffi 123 cad");
  assert.equal(normalizeText("..."), "");
  assert.equal(normalizeText(normalizeText("Café / CAD")), "cafe cad");
});
test("all compact row shapes preserve text and parse numeric and flag fields", () => {
  const s = buildSubset(fixture());
  assert.deepEqual(s.occ, [["17-2011.00", "Aerospace Engineers", "Build aircraft, and more.\nSecond line."]]);
  assert.deepEqual(s.el, [["2.A.1.a", "Reading", "Read technical material."]]);
  assert.deepEqual(s.sw, [["17-2011.00", 'CAD, "Pro"', "2.E.9.c", true, false]]);
  assert.deepEqual(s.dwa, [["4.A", "4.A.1", "4.A.1.a", "Design"]]);
  assert.deepEqual(s.jt, [["17-2011.00", "Space Engineer"]]);
  assert.deepEqual(s.jz, [["17-2011.00", 4]]);
  assert.deepEqual(s.em, [["17-2011.00", "Test autonomous aircraft.", "New"]]);
  assert.deepEqual(s.rel, [["17-2011.00", "17-2012.00", "Primary-Short", 1]]);
});
test("ratings filter IM/LV and work styles DR, retaining suppression and relevance", () => {
  const s = buildSubset(fixture());
  assert.equal(s.rat.length, 7);
  for (let i = 0; i < 6; i += 2) {
    assert.deepEqual(s.rat[i], ["17-2011.00", "2.A.1.a", "IM", 4.12, true, false]);
    assert.deepEqual(s.rat[i + 1], ["17-2011.00", "2.A.1.a", "LV", 4.62, false, true]);
  }
  assert.deepEqual(s.rat[6], ["17-2011.00", "1.D.1.a", "DR", 7, false, false]);
});
test("occupation-DWA deduplication is per pair and keeps source order", () => {
  assert.deepEqual(buildSubset(fixture()).odwa, [["17-2011.00", "4.A.1.a"], ["17-2012.00", "4.A.1.a"]]);
});
test("metadata counts input rows before filtering/dedup and extraction is deterministic", () => {
  const s = buildSubset(fixture());
  assert.equal(s.meta.version, "31.0"); assert.equal(s.meta.releasedOn, "2026-08");
  assert.equal(s.meta.files["tasks_to_dwas.csv"], 3);
  assert.equal(s.meta.files["work_styles.csv"], 2);
  assert.equal(Object.keys(s.meta.files).length, 13);
  assert.deepEqual(s, buildSubset(fixture()));
});
test("every changed header, including extra or reordered columns, fails", () => {
  for (const name of Object.keys(ONET_HEADERS) as OnetFileName[]) {
    for (const header of [[...ONET_HEADERS[name], "Extra"], [...ONET_HEADERS[name]].reverse(), ["Wrong"]]) {
      const files = fixture(); files[name] = csv([header]);
      assert.throws(() => buildSubset(files), new RegExp(`Unexpected header in ${name.replace(/\./g, "\\.")}`));
    }
  }
});
test("missing files and bad record widths fail", () => {
  const files = fixture(); delete (files as Partial<OnetFiles>)["job_titles.csv"];
  assert.throws(() => buildSubset(files), /Missing O\*NET file/);
  const bad = fixture(); bad["occupation_data.csv"] += "one,two\r\n";
  assert.throws(() => buildSubset(bad), /Invalid column count/);
});
test("invalid numbers and flags fail instead of silently changing data", () => {
  const files = fixture(); files["job_zones.csv"] = csv([ONET_HEADERS["job_zones.csv"], ["x", "X", "", "", ""]]);
  assert.throws(() => buildSubset(files), /Invalid O\*NET number/);
  files["job_zones.csv"] = fixture()["job_zones.csv"];
  files["software_skills.csv"] = csv([ONET_HEADERS["software_skills.csv"], ["x", "X", "CAD", "2.E", "CAD", "maybe", "N"]]);
  assert.throws(() => buildSubset(files), /Invalid O\*NET flag/);
});
console.log(`${passed} O*NET extractor tests passed.`);
