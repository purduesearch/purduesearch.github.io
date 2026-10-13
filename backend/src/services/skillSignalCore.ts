// Deterministic skill signals (pure). Before the model reads an artifact, the file
// types and names in it already say a lot: a SolidWorks part was made in SolidWorks,
// a PR with 300 changed lines of Python is Python work. These signals do three jobs:
//
//   1. the skills they point at are always in the model's candidate list, even when
//      a large taxonomy is prefiltered;
//   2. the prompt lists them as hints the model must confirm against the work;
//   3. a few STRONG signals (native CAD/EDA files, substantial authored code) are a
//      floor: if the model leaves one out, it is added at a modest fit, because the
//      file type alone proves the tool was used.
//
// Signal names are resolved through the alias index, so a name the taxonomy does
// not have simply produces no signal; nothing here can invent a skill.

import { extOf } from "./skillArtifactCore.js";
import { rankSkillCandidates, resolveSkillName, type AliasIndex, type SkillLite } from "./skillMatchCore.js";
import type { SkillArtifact } from "./skillPrompts.js";

export interface SkillSignal {
  skillId: string;
  reason: string;
  /** Strong signals are a floor (see applySignalFloor); the rest are hints. */
  strong: boolean;
}

/** Fit given to a strong signal the model left out. Below a mapped proposal (0.6): the work may still be minor. */
export const SIGNAL_FLOOR_FIT = 0.5;
/** Changed lines in one language before an authored PR counts as a strong signal for it. */
export const STRONG_CODE_LINES = 40;
const MAX_TEXT_HINTS = 6;

/**
 * File extension -> concepts. Each concept is "Name|Alternate|…": the first that
 * resolves in the taxonomy wins. `native` marks files only that tool writes.
 */
const EXT_SIGNALS: Record<string, { concepts: string[]; kind: "code" | "native" | "format" }> = {
  py: { concepts: ["Python"], kind: "code" },
  ipynb: { concepts: ["Python", "Scientific Computing|Data Science"], kind: "code" },
  ts: { concepts: ["TypeScript"], kind: "code" },
  tsx: { concepts: ["TypeScript", "React"], kind: "code" },
  jsx: { concepts: ["JavaScript", "React"], kind: "code" },
  js: { concepts: ["JavaScript"], kind: "code" },
  mjs: { concepts: ["JavaScript"], kind: "code" },
  cjs: { concepts: ["JavaScript"], kind: "code" },
  cpp: { concepts: ["C++"], kind: "code" },
  cc: { concepts: ["C++"], kind: "code" },
  cxx: { concepts: ["C++"], kind: "code" },
  hpp: { concepts: ["C++"], kind: "code" },
  c: { concepts: ["C"], kind: "code" },
  ino: { concepts: ["Arduino", "Embedded Systems|Embedded Programming"], kind: "code" },
  rs: { concepts: ["Rust"], kind: "code" },
  go: { concepts: ["Go|Golang"], kind: "code" },
  java: { concepts: ["Java"], kind: "code" },
  kt: { concepts: ["Kotlin"], kind: "code" },
  swift: { concepts: ["Swift"], kind: "code" },
  cs: { concepts: ["C#"], kind: "code" },
  m: { concepts: ["MATLAB"], kind: "code" },
  mlx: { concepts: ["MATLAB"], kind: "native" },
  slx: { concepts: ["Simulink|MATLAB"], kind: "native" },
  sql: { concepts: ["SQL"], kind: "code" },
  sh: { concepts: ["Shell Scripting|Bash|Linux"], kind: "code" },
  v: { concepts: ["FPGA Design|Verilog"], kind: "code" },
  sv: { concepts: ["FPGA Design|SystemVerilog"], kind: "code" },
  vhd: { concepts: ["FPGA Design|VHDL"], kind: "code" },
  vhdl: { concepts: ["FPGA Design|VHDL"], kind: "code" },
  scad: { concepts: ["OpenSCAD|CAD"], kind: "code" },
  urdf: { concepts: ["ROS|Robotics"], kind: "code" },
  xacro: { concepts: ["ROS|Robotics"], kind: "code" },
  launch: { concepts: ["ROS"], kind: "code" },
  css: { concepts: ["HTML and CSS|CSS"], kind: "code" },
  scss: { concepts: ["HTML and CSS|CSS"], kind: "code" },
  html: { concepts: ["HTML and CSS|HTML"], kind: "code" },
  tf: { concepts: ["Terraform"], kind: "code" },
  sldprt: { concepts: ["SolidWorks", "3D CAD Modeling|CAD"], kind: "native" },
  sldasm: { concepts: ["SolidWorks", "Assembly Design|3D CAD Modeling|CAD"], kind: "native" },
  slddrw: { concepts: ["SolidWorks", "Engineering Drawings|Technical Drawing"], kind: "native" },
  f3d: { concepts: ["Fusion 360", "3D CAD Modeling|CAD"], kind: "native" },
  f3z: { concepts: ["Fusion 360", "3D CAD Modeling|CAD"], kind: "native" },
  ipt: { concepts: ["Autodesk Inventor|Inventor", "3D CAD Modeling|CAD"], kind: "native" },
  iam: { concepts: ["Autodesk Inventor|Inventor", "Assembly Design|3D CAD Modeling|CAD"], kind: "native" },
  idw: { concepts: ["Autodesk Inventor|Inventor", "Engineering Drawings|Technical Drawing"], kind: "native" },
  catpart: { concepts: ["CATIA", "3D CAD Modeling|CAD"], kind: "native" },
  catproduct: { concepts: ["CATIA", "Assembly Design|3D CAD Modeling|CAD"], kind: "native" },
  par: { concepts: ["Solid Edge", "3D CAD Modeling|CAD"], kind: "native" },
  dwg: { concepts: ["AutoCAD", "Engineering Drawings|Technical Drawing"], kind: "native" },
  kicad_pcb: { concepts: ["KiCad", "PCB Design"], kind: "native" },
  kicad_sch: { concepts: ["KiCad", "Schematic Capture|Circuit Design"], kind: "native" },
  kicad_pro: { concepts: ["KiCad"], kind: "native" },
  brd: { concepts: ["Autodesk EAGLE|Eagle", "PCB Design"], kind: "native" },
  step: { concepts: ["3D CAD Modeling|CAD"], kind: "format" },
  stp: { concepts: ["3D CAD Modeling|CAD"], kind: "format" },
  iges: { concepts: ["3D CAD Modeling|CAD"], kind: "format" },
  igs: { concepts: ["3D CAD Modeling|CAD"], kind: "format" },
  stl: { concepts: ["3D Printing|Additive Manufacturing"], kind: "format" },
  "3mf": { concepts: ["3D Printing|Additive Manufacturing"], kind: "format" },
  gcode: { concepts: ["3D Printing|Additive Manufacturing|CNC Machining"], kind: "format" },
  dxf: { concepts: ["Laser Cutting|CNC Machining"], kind: "format" },
};

/** Whole-path hints that no extension carries. */
const PATH_SIGNALS: { test: RegExp; concepts: string[] }[] = [
  { test: /(^|\/)\.github\/workflows\//i, concepts: ["CI/CD|GitHub Actions|DevOps"] },
  { test: /(^|\/)dockerfile$|docker-compose\.ya?ml$/i, concepts: ["Docker|Containers"] },
  { test: /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[a-z]+$/i, concepts: ["Software Testing|Unit Testing|Testing"] },
  { test: /(^|\/)prisma\/schema\.prisma$|(^|\/)migrations?\//i, concepts: ["Databases|SQL"] },
];

const FILE_LINE = /^(\S.*?) \(\+(\d+)\/-(\d+)\)$/;

/** Files listed in a GitHub artifact body ("path (+a/-d)"); CAD artifacts carry one file name in facts. */
export function filesOf(a: SkillArtifact): { path: string; lines: number }[] {
  if (a.source === "CAD") {
    const name = typeof a.facts.file_name === "string" ? a.facts.file_name : "";
    return name ? [{ path: name, lines: 0 }] : [];
  }
  if (a.source !== "GITHUB" && a.source !== "REVIEW") return [];
  const out: { path: string; lines: number }[] = [];
  for (const raw of a.body.split("\n")) {
    const m = FILE_LINE.exec(raw.trim());
    if (m) out.push({ path: m[1], lines: Number(m[2]) + Number(m[3]) });
  }
  return out;
}

function resolveConcept(concept: string, index: AliasIndex): string | null {
  for (const name of concept.split("|")) {
    const id = resolveSkillName(name, index);
    if (id) return id;
  }
  return null;
}

/**
 * Signals for one artifact. Strong only when this person made the thing: a CAD
 * check-in of a native tool file, or an authored PR with enough changed lines in a
 * language. Reviews, tasks and manual entries only ever produce hints.
 */
export function detectSignals(a: SkillArtifact, index: AliasIndex, skills: SkillLite[]): SkillSignal[] {
  const out = new Map<string, SkillSignal>();
  const add = (skillId: string | null, reason: string, strong: boolean) => {
    if (!skillId) return;
    const cur = out.get(skillId);
    if (!cur) out.set(skillId, { skillId, reason, strong });
    else if (strong && !cur.strong) out.set(skillId, { skillId, reason, strong });
  };
  const authored = a.source === "CAD" || a.source === "GITHUB";

  // File types, weighted by changed lines per extension.
  const linesByExt = new Map<string, number>();
  for (const f of filesOf(a)) {
    const ext = extOf(f.path);
    if (EXT_SIGNALS[ext]) linesByExt.set(ext, (linesByExt.get(ext) ?? 0) + f.lines);
    for (const p of PATH_SIGNALS) if (p.test.test(f.path)) for (const c of p.concepts) add(resolveConcept(c, index), `touched ${f.path.split("/").slice(-2).join("/")}`, false);
  }
  for (const [ext, lines] of linesByExt) {
    const sig = EXT_SIGNALS[ext];
    const strong = authored && (sig.kind === "native" || (sig.kind === "code" && lines >= STRONG_CODE_LINES));
    const reason = a.source === "CAD" ? `checked in a .${ext} file` : `${lines} changed line${lines === 1 ? "" : "s"} in .${ext} files`;
    sig.concepts.forEach((c, i) => add(resolveConcept(c, index), reason, strong && i === 0));
  }

  // Skill names written in the work itself (title, description, facts). Hints only.
  const text = `${a.title}\n${a.body}\n${Object.values(a.facts).join(" ")}`;
  for (const hit of rankSkillCandidates(text, skills, MAX_TEXT_HINTS * 2)) {
    if (hit.score < 1) continue; // whole-name matches only; partial token overlap is too noisy to mention
    if (!out.has(hit.id)) add(hit.id, "named in the work", false);
    if ([...out.values()].filter((s) => s.reason === "named in the work").length >= MAX_TEXT_HINTS) break;
  }
  return [...out.values()];
}

/**
 * Strong signals the model left out are added at SIGNAL_FLOOR_FIT. Never raises a
 * fit the model gave, never adds a hint, and never re-adds a skill for a member
 * who had it upheld as wrong (the caller filters that later anyway).
 */
export function applySignalFloor<T extends { skills: { skillId: string; fit: number }[]; warnings: string[] }>(analysis: T, signals: SkillSignal[], maxSkills: number): T {
  const have = new Set(analysis.skills.map((s) => s.skillId));
  const added = signals.filter((s) => s.strong && !have.has(s.skillId));
  if (!added.length) return analysis;
  const skills = [...analysis.skills, ...added.map((s) => ({ skillId: s.skillId, fit: SIGNAL_FLOOR_FIT }))]
    .sort((x, y) => y.fit - x.fit || x.skillId.localeCompare(y.skillId))
    .slice(0, maxSkills);
  return { ...analysis, skills, warnings: [...analysis.warnings, `${added.length} skill${added.length === 1 ? "" : "s"} added from file-type signals`] };
}
