// Pure O*NET 31.0 extraction. No database, network, or model dependencies.
export function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Shared software identity for the loader and skill linking; keep vendor stripping bounded. */
export function normalizeExample(example: string): string {
  const withoutVendor = example.trim()
    .replace(/^Amazon Web Services\s+AWS\b/i, "aws")
    .replace(/^(?:Dassault Systemes|The MathWorks|MathWorks|Autodesk|PTC|Microsoft|Atlassian|National Instruments|Siemens|Oracle|IBM)\s+/i, "")
    .replace(/\s+software\s*$/i, "");
  return normalizeText(withoutVendor);
}

/** RFC 4180 records, accepting CRLF or LF and an optional UTF-8 BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (char === "," || char === "\r" || char === "\n") {
      row.push(field); field = ""; closed = false;
      if (char !== ",") {
        rows.push(row); row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error(`Invalid CSV quote at offset ${i}`);
      field += char;
    }
  }
  if (quoted) throw new Error("Unterminated CSV quoted field");
  if (row.length || field || closed) { row.push(field); rows.push(row); }
  return rows;
}

const ratingHeader = ["O*NET-SOC Code", "Title", "Element ID", "Element Name", "Scale ID", "Scale Name", "Data Value", "N", "Standard Error", "Lower CI Bound", "Upper CI Bound", "Recommend Suppress", "Not Relevant", "Date", "Domain Source"];
/** Exact upstream column order: schema drift must stop extraction. */
export const ONET_HEADERS = {
  "occupation_data.csv": ["O*NET-SOC Code", "Title", "Description"],
  "content_model_reference.csv": ["Element ID", "Element Name", "Description"],
  "essential_skills.csv": ratingHeader,
  "transferable_skills.csv": ratingHeader,
  "knowledge.csv": ratingHeader,
  "work_styles.csv": ["O*NET-SOC Code", "Title", "Element ID", "Element Name", "Scale ID", "Scale Name", "Data Value", "Date", "Domain Source"],
  "software_skills.csv": ["O*NET-SOC Code", "Title", "Workplace Example", "Element ID", "Element Name", "Hot Technology", "In Demand"],
  "gwas_to_iwas_to_dwas.csv": ["GWA Element ID", "GWA Element Name", "IWA Element ID", "IWA Element Name", "DWA Element ID", "DWA Element Name"],
  "tasks_to_dwas.csv": ["O*NET-SOC Code", "Title", "Task ID", "Task", "DWA Element ID", "DWA Element Name", "Date", "Domain Source"],
  "job_titles.csv": ["O*NET-SOC Code", "Title", "Job Title", "Short Title", "Source(s)"],
  "job_zones.csv": ["O*NET-SOC Code", "Title", "Job Zone", "Date", "Domain Source"],
  "emerging_tasks.csv": ["O*NET-SOC Code", "Title", "Task", "Category", "Original Task ID", "Original Task", "Date", "Domain Source"],
  "related_occupations.csv": ["O*NET-SOC Code", "Title", "Related O*NET-SOC Code", "Related Title", "Relatedness Tier", "Index"],
} as const;
export type OnetFileName = keyof typeof ONET_HEADERS;
export type OnetFiles = Record<OnetFileName, string>;
export type OnetSubset = {
  meta: { version: "31.0"; releasedOn: "2026-08"; files: Record<string, number> };
  occ: [string, string, string][];
  el: [string, string, string][];
  rat: [string, string, string, number, boolean, boolean][];
  sw: [string, string, string, boolean, boolean][];
  dwa: [string, string, string, string][];
  odwa: [string, string][];
  jt: [string, string][];
  jz: [string, number][];
  em: [string, string, string][];
  rel: [string, string, string, number][];
};

export function buildSubset(files: OnetFiles): OnetSubset {
  const counts: Record<string, number> = {};
  function read(name: OnetFileName): string[][] {
    if (typeof files[name] !== "string") throw new Error(`Missing O*NET file: ${name}`);
    const [header, ...rows] = parseCsv(files[name]);
    if (JSON.stringify(header) !== JSON.stringify(ONET_HEADERS[name])) {
      throw new Error(`Unexpected header in ${name}: ${JSON.stringify(header)}`);
    }
    rows.forEach((row, index) => {
      if (row.length !== header.length) throw new Error(`Invalid column count in ${name}, record ${index + 2}`);
    });
    counts[name] = rows.length;
    return rows;
  }
  function number(value: string): number {
    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`Invalid O*NET number: ${value}`);
    return Number(value);
  }
  function flag(value: string): boolean {
    if (!["", "N", "Y"].includes(value)) throw new Error(`Invalid O*NET flag: ${value}`);
    return value === "Y";
  }
  const subset: OnetSubset = {
    meta: { version: "31.0", releasedOn: "2026-08", files: counts },
    occ: read("occupation_data.csv").map(r => [r[0], r[1], r[2]]),
    el: read("content_model_reference.csv").map(r => [r[0], r[1], r[2]]),
    rat: [], sw: [], dwa: [], odwa: [], jt: [], jz: [], em: [], rel: [],
  };
  for (const name of ["essential_skills.csv", "transferable_skills.csv", "knowledge.csv", "work_styles.csv"] as const) {
    for (const r of read(name)) {
      if (name === "work_styles.csv" ? r[4] !== "DR" : !["IM", "LV"].includes(r[4])) continue;
      subset.rat.push([r[0], r[2], r[4], number(r[6]),
        name === "work_styles.csv" ? false : flag(r[11]),
        name === "work_styles.csv" ? false : flag(r[12])]);
    }
  }
  subset.sw = read("software_skills.csv").map(r => [r[0], r[2], r[3], flag(r[5]), flag(r[6])]);
  subset.dwa = read("gwas_to_iwas_to_dwas.csv").map(r => [r[0], r[2], r[4], r[5]]);
  const pairs = new Set<string>();
  for (const r of read("tasks_to_dwas.csv")) {
    const pair: [string, string] = [r[0], r[4]];
    const key = JSON.stringify(pair);
    if (!pairs.has(key)) { subset.odwa.push(pair); pairs.add(key); }
  }
  subset.jt = read("job_titles.csv").map(r => [r[0], r[2]]);
  subset.jz = read("job_zones.csv").map(r => [r[0], number(r[2])]);
  subset.em = read("emerging_tasks.csv").map(r => [r[0], r[2], r[3]]);
  subset.rel = read("related_occupations.csv").map(r => [r[0], r[2], r[4], number(r[5])]);
  return subset;
}
