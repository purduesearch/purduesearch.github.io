import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTitleIndex, isInternship, matchOccupations, matchSkills, stripSeniority } from "./opportunityMatchCore.js";
import { buildAliasIndex } from "./skillMatchCore.js";

const index = buildTitleIndex(
  [
    { occupationCode: "17-2011.00", titleNorm: "aerospace engineer" },
    { occupationCode: "17-2011.00", titleNorm: "flight test engineer" },
    { occupationCode: "15-1252.00", titleNorm: "software engineer" },
    { occupationCode: "15-1251.00", titleNorm: "software engineer" },
    { occupationCode: "15-1299.00", titleNorm: "software engineer" },
    { occupationCode: "15-1211.00", titleNorm: "software engineer" },
  ],
  [
    { code: "17-2011.00", title: "Aerospace Engineers" },
    { code: "15-1252.00", title: "Software Developers" },
    { code: "17-2141.00", title: "Mechanical Engineers" },
    { code: "17-2199.01", title: "Biomedical Engineers" },
    { code: "11-9041.00", title: "Architectural and Engineering Managers" },
  ],
);

test("tier 1: exact titleNorm, capped at 3 codes, sorted", () => {
  assert.deepEqual(matchOccupations("Flight Test Engineer", index), ["17-2011.00"]);
  assert.deepEqual(matchOccupations("Software Engineer", index), ["15-1211.00", "15-1251.00", "15-1252.00"]);
});

test("tier 2: seniority and roman numerals stripped", () => {
  assert.equal(stripSeniority("senior aerospace engineer ii"), "aerospace engineer");
  assert.equal(stripSeniority("student trainee co op"), "");
  assert.deepEqual(matchOccupations("Aerospace Engineer II", index), ["17-2011.00"]);
  assert.deepEqual(matchOccupations("Summer Intern - Aerospace Engineer", index), ["17-2011.00"]);
  assert.deepEqual(matchOccupations("Junior Aerospace Engineer (Co-op)", index), ["17-2011.00"]);
});

test("tier 3: token overlap >= 0.6 against occupation titles", () => {
  assert.deepEqual(matchOccupations("Mechanical Engineer Intern", index), ["17-2141.00"]);
  assert.deepEqual(matchOccupations("Software Developer", index), ["15-1252.00"]);
  assert.deepEqual(matchOccupations("Barista", index), []);
  assert.deepEqual(matchOccupations("", index), []);
  assert.deepEqual(matchOccupations("Intern", index), []);
});

test("tier 3 caps at 3 and is deterministic", () => {
  const many = buildTitleIndex([], ["A", "B", "C", "D", "E"].map((x, i) => ({ code: `0${i}-0000.00`, title: `Rocket Engineer ${x}x` })));
  const r = matchOccupations("Rocket Engineer", many);
  assert.equal(r.length, 3);
  assert.deepEqual(r, matchOccupations("Rocket Engineer", many));
});

const aliasIndex = buildAliasIndex([
  { id: "cpp", name: "C++", aliases: [] },
  { id: "cs", name: "C#", aliases: [] },
  { id: "net", name: ".NET", aliases: ["dotnet"] },
  { id: "node", name: "Node.js", aliases: [] },
  { id: "java", name: "Java", aliases: [] },
  { id: "js", name: "JavaScript", aliases: ["JS"] },
  { id: "ml", name: "Machine Learning", aliases: [] },
  { id: "c", name: "C", aliases: [] },
]);

test("matchSkills handles symbol aliases with explicit boundaries", () => {
  assert.deepEqual(matchSkills("We use C++, C# and .NET daily.", aliasIndex), ["cpp", "cs", "net"]);
  assert.deepEqual(matchSkills("Backend in Node.js.", aliasIndex), ["node"]);
  assert.deepEqual(matchSkills("(C++)/Java", aliasIndex), ["cpp", "java"]);
});

test("matchSkills never matches partial words and dedupes", () => {
  assert.deepEqual(matchSkills("JavaScript only", aliasIndex), ["js"]);
  assert.deepEqual(matchSkills("Javascripting and Javanese", aliasIndex), []);
  assert.deepEqual(matchSkills("Java java JAVA", aliasIndex), ["java"]);
  assert.deepEqual(matchSkills("Experience with machine learning.", aliasIndex), ["ml"]);
  assert.deepEqual(matchSkills("Vitamin C is good", aliasIndex), []);
  assert.deepEqual(matchSkills("", aliasIndex), []);
});

test("isInternship uses fixed keywords", () => {
  assert.equal(isInternship("Software Engineering Intern"), true);
  assert.equal(isInternship("Co-op Mechanical"), true);
  assert.equal(isInternship("Student Trainee (IT)"), true);
  assert.equal(isInternship("Internal Auditor"), false);
  assert.equal(isInternship("Engineer", "Join our summer internship program"), true);
  assert.equal(isInternship("Engineer", "Full time role"), false);
});
