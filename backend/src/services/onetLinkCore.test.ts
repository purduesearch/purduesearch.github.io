import assert from "node:assert/strict";
import { test } from "node:test";
import { proposeLinks } from "./onetLinkCore.js";

test("exact normalized names and aliases carry reasons; fuzzy neighbors never link", () => {
  const result = proposeLinks([
    { id: "sw", name: "SolidWorks", aliases: ["SW CAD"] },
    { id: "alias", name: "Other", aliases: [{ alias: "Python" }] },
    { id: "near", name: "Pythoon", aliases: [] },
    { id: "knowledge", name: "Mécanique", aliases: [] },
    { id: "activity", name: "Create models", aliases: [] },
  ], [{ example: "Dassault Systemes SolidWorks software" }, { example: "Python" }],
  [{ id: "k", name: "Mecanique", domain: "KNOWLEDGE" }, { id: "d", name: "Create models", domain: "DWA" }]);
  assert.equal(result.length, 4);
  assert.match(result.find(p => p.skillId === "alias")!.reason, /alias.*Python/);
  assert.match(result.find(p => p.skillId === "sw")!.reason, /name.*SolidWorks/);
  assert.equal(result.find(p => p.skillId === "activity")!.kind, "DWA");
  assert.equal(result.find(p => p.skillId === "knowledge")!.ref, "k");
  assert(!result.some(p => p.skillId === "near"));
});

test("ambiguous C software identity is always refused, even with just one local row", () => {
  for (const example of ["C", "C++", "C#"]) assert.deepEqual(proposeLinks(
    ["C", "C++", "C#"].map(name => ({ id: name, name, aliases: [] })), [{ example }], []), []);
});

test("deduplicated proposals and reasons have deterministic order independent of row order", () => {
  const skills = [{ id: "b", name: "Unknown", aliases: ["PYTHON", "Python"] }, { id: "a", name: "Python", aliases: ["Python"] }];
  const software = [{ example: "Python" }, { example: "Python software" }];
  const a = proposeLinks(skills, software, []);
  assert.equal(a.length, 2);
  assert.deepEqual(a, proposeLinks([...skills].reverse(), [...software].reverse(), []));
  assert.match(a[0].reason, /name/);
});
