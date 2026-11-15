// Reviewed against the committed O*NET 31.0 subset. No fuzzy/model matches.
// BROADER means the O*NET concept covers more than the starter skill; RELATED
// means a relevant application/example, rather than an equivalent concept.
// Unlisted skills have no sufficiently specific reviewed mapping yet.
import { normalizeExample } from "./onetCsvCore.js";

export interface CuratedOnetLink {
  slug: string;
  kind: "SOFTWARE" | "ELEMENT" | "DWA";
  ref: string;
  relation: "EXACT" | "BROADER" | "RELATED";
}

export const CURATED_LINKS: CuratedOnetLink[] = [
  // Software refs use the loader's shared example identity, not seed aliases.
  { slug: "solidworks", kind: "SOFTWARE", ref: normalizeExample("Dassault Systemes SolidWorks"), relation: "EXACT" },
  { slug: "fusion-360", kind: "SOFTWARE", ref: normalizeExample("Autodesk Fusion 360"), relation: "EXACT" },
  { slug: "onshape", kind: "SOFTWARE", ref: normalizeExample("OnShape"), relation: "EXACT" },
  { slug: "catia", kind: "SOFTWARE", ref: normalizeExample("Dassault Systemes CATIA"), relation: "EXACT" },
  { slug: "nx", kind: "SOFTWARE", ref: normalizeExample("Siemens NX"), relation: "EXACT" },
  { slug: "inventor", kind: "SOFTWARE", ref: normalizeExample("Autodesk Inventor"), relation: "EXACT" },
  { slug: "creo", kind: "SOFTWARE", ref: normalizeExample("PTC Creo Parametric"), relation: "RELATED" },
  { slug: "creo", kind: "SOFTWARE", ref: normalizeExample("PTC Creo Elements/Pro"), relation: "RELATED" },
  { slug: "autocad", kind: "SOFTWARE", ref: normalizeExample("Autodesk AutoCAD"), relation: "EXACT" },
  { slug: "ansys", kind: "SOFTWARE", ref: normalizeExample("ANSYS simulation software"), relation: "EXACT" },
  { slug: "ansys", kind: "SOFTWARE", ref: normalizeExample("ANSYS Mechanical"), relation: "RELATED" },
  { slug: "abaqus", kind: "SOFTWARE", ref: normalizeExample("Dassault Systemes Abaqus"), relation: "EXACT" },
  { slug: "kicad", kind: "SOFTWARE", ref: normalizeExample("KiCad"), relation: "EXACT" },
  { slug: "altium", kind: "SOFTWARE", ref: normalizeExample("Altium Designer"), relation: "EXACT" },
  { slug: "python", kind: "SOFTWARE", ref: normalizeExample("Python"), relation: "EXACT" },
  { slug: "javascript", kind: "SOFTWARE", ref: normalizeExample("JavaScript"), relation: "EXACT" },
  { slug: "typescript", kind: "SOFTWARE", ref: normalizeExample("TypeScript"), relation: "EXACT" },
  { slug: "react", kind: "SOFTWARE", ref: normalizeExample("React"), relation: "EXACT" },
  { slug: "nodejs", kind: "SOFTWARE", ref: normalizeExample("Node.js"), relation: "EXACT" },
  { slug: "rust", kind: "SOFTWARE", ref: normalizeExample("Rust programming language"), relation: "EXACT" },
  { slug: "java", kind: "SOFTWARE", ref: normalizeExample("Oracle Java"), relation: "EXACT" },
  { slug: "matlab", kind: "SOFTWARE", ref: normalizeExample("The MathWorks MATLAB"), relation: "EXACT" },
  // Simulink is an existing MATLAB alias; retain the seed identity, but do not
  // assert that the two products are equivalent.
  { slug: "matlab", kind: "SOFTWARE", ref: normalizeExample("MathWorks Simulink"), relation: "RELATED" },
  { slug: "sql", kind: "SOFTWARE", ref: normalizeExample("Structured query language SQL"), relation: "EXACT" },
  { slug: "sql", kind: "SOFTWARE", ref: normalizeExample("Structure query language SQL"), relation: "EXACT" },
  { slug: "git", kind: "SOFTWARE", ref: normalizeExample("Git"), relation: "EXACT" },
  { slug: "linux", kind: "SOFTWARE", ref: normalizeExample("Linux"), relation: "EXACT" },
  { slug: "docker", kind: "SOFTWARE", ref: normalizeExample("Docker"), relation: "EXACT" },
  { slug: "pytorch", kind: "SOFTWARE", ref: normalizeExample("PyTorch"), relation: "EXACT" },
  { slug: "scikit-learn", kind: "SOFTWARE", ref: normalizeExample("Scikit-learn"), relation: "EXACT" },
  { slug: "pandas", kind: "SOFTWARE", ref: normalizeExample("pandas"), relation: "EXACT" },
  { slug: "chatgpt", kind: "SOFTWARE", ref: normalizeExample("OpenAI ChatGPT"), relation: "EXACT" },
  { slug: "aws", kind: "SOFTWARE", ref: normalizeExample("Amazon Web Services AWS software"), relation: "EXACT" },
  { slug: "jira", kind: "SOFTWARE", ref: normalizeExample("Atlassian JIRA"), relation: "EXACT" },
  { slug: "ms-project", kind: "SOFTWARE", ref: normalizeExample("Microsoft Project"), relation: "EXACT" },

  // Skills and knowledge. Avoid software named after a technique (for example,
  // "Thermal analysis software"): using that product does not equal the skill.
  { slug: "manufacturing", kind: "ELEMENT", ref: "2.C.2.a", relation: "BROADER" },
  { slug: "mechanical-engineering", kind: "ELEMENT", ref: "2.C.3.e", relation: "RELATED" },
  { slug: "electrical-engineering", kind: "ELEMENT", ref: "2.C.3.a", relation: "RELATED" },
  { slug: "aerospace-engineering", kind: "ELEMENT", ref: "2.C.3.b", relation: "BROADER" },
  { slug: "software-engineering", kind: "ELEMENT", ref: "2.B.3.e", relation: "RELATED" },
  // normalizeExample collapses C, C++, and C# to "c". A SOFTWARE link would
  // falsely identify three languages as one; retain distinct seed identities
  // and link to the broader Programming skill instead.
  { slug: "c-language", kind: "ELEMENT", ref: "2.B.3.e", relation: "BROADER" },
  { slug: "cpp", kind: "ELEMENT", ref: "2.B.3.e", relation: "BROADER" },
  { slug: "systems-engineering", kind: "ELEMENT", ref: "2.B.4.g", relation: "RELATED" },
  { slug: "systems-architecture", kind: "ELEMENT", ref: "2.B.4.g", relation: "RELATED" },
  { slug: "requirements-engineering", kind: "ELEMENT", ref: "2.B.3.a", relation: "RELATED" },
  { slug: "verification-and-validation", kind: "ELEMENT", ref: "2.B.4.h", relation: "RELATED" },
  { slug: "software-testing", kind: "ELEMENT", ref: "2.B.3.m", relation: "BROADER" },
  { slug: "electronics-testing", kind: "ELEMENT", ref: "2.B.3.k", relation: "RELATED" },
  { slug: "testing-and-troubleshooting", kind: "ELEMENT", ref: "2.B.3.k", relation: "RELATED" },
  { slug: "problem-solving", kind: "ELEMENT", ref: "2.B.2.i", relation: "RELATED" },
  { slug: "technical-writing", kind: "ELEMENT", ref: "2.A.1.c", relation: "BROADER" },
  { slug: "presenting", kind: "ELEMENT", ref: "2.A.1.d", relation: "BROADER" },
  { slug: "task-coordination", kind: "ELEMENT", ref: "2.B.1.b", relation: "BROADER" },
  { slug: "collaboration", kind: "ELEMENT", ref: "2.B.1.b", relation: "RELATED" },
  { slug: "cross-functional-collaboration", kind: "ELEMENT", ref: "2.B.1.b", relation: "RELATED" },
  { slug: "mentoring", kind: "ELEMENT", ref: "2.B.1.e", relation: "RELATED" },
  { slug: "instructing", kind: "ELEMENT", ref: "2.B.1.e", relation: "EXACT" },
  { slug: "team-leadership", kind: "ELEMENT", ref: "2.B.5.d", relation: "RELATED" },
  { slug: "planning-and-scheduling", kind: "ELEMENT", ref: "2.B.5.a", relation: "RELATED" },
  { slug: "materials-selection", kind: "ELEMENT", ref: "2.B.3.c", relation: "RELATED" },
  { slug: "budgeting-and-procurement", kind: "ELEMENT", ref: "2.B.5.b", relation: "RELATED" },
  { slug: "budgeting-and-procurement", kind: "ELEMENT", ref: "2.B.5.c", relation: "RELATED" },

  // Detailed work activities: actual DWA ids, never the enclosing GWA/IWA.
  { slug: "cad", kind: "DWA", ref: "4.A.3.b.2.d.1", relation: "RELATED" }, // Create models of engineering designs or methods.
  { slug: "engineering-drawings", kind: "DWA", ref: "4.A.2.b.2.o.1", relation: "RELATED" }, // Prepare drawings or diagrams of products or services.
  { slug: "circuit-design", kind: "DWA", ref: "4.A.2.b.2.o.8", relation: "RELATED" }, // Create schematic drawings for electronics.
  { slug: "cnc-machining", kind: "DWA", ref: "4.A.3.a.2.aa.3", relation: "BROADER" }, // Fabricate products or components using machine tools.
  { slug: "manual-machining", kind: "DWA", ref: "4.A.3.a.2.aa.3", relation: "BROADER" },
  { slug: "welding", kind: "DWA", ref: "4.A.3.a.2.ai.2", relation: "EXACT" }, // Weld metal components.
  { slug: "soldering", kind: "DWA", ref: "4.A.3.a.2.ai.3", relation: "EXACT" }, // Solder parts or connections between parts.
  { slug: "assembly-and-integration", kind: "DWA", ref: "4.A.3.a.2.d.2", relation: "RELATED" }, // Assemble equipment or components.
  { slug: "controls", kind: "DWA", ref: "4.A.3.b.2.c.6", relation: "RELATED" }, // Design control systems for mechanical or other equipment.
  { slug: "environmental-testing", kind: "DWA", ref: "4.A.3.b.2.f.15", relation: "RELATED" }, // Develop testing routines or procedures.
  { slug: "design-reviews", kind: "DWA", ref: "4.A.2.a.1.j.1", relation: "RELATED" }, // Evaluate project designs to determine adequacy or feasibility.
  { slug: "risk-management", kind: "DWA", ref: "4.A.2.a.4.c.3", relation: "RELATED" }, // Analyze risks to minimize losses or damages.
  { slug: "cybersecurity-fundamentals", kind: "DWA", ref: "4.A.3.b.1.b.1", relation: "RELATED" }, // Implement security measures for computer or information systems.
  { slug: "grant-writing", kind: "DWA", ref: "4.A.3.b.6.g.2", relation: "EXACT" }, // Write grant proposals.
  { slug: "graphic-design", kind: "DWA", ref: "4.A.2.b.2.o.14", relation: "RELATED" }, // Prepare graphics or other visual representations of information.
  { slug: "video-production", kind: "DWA", ref: "4.A.3.a.3.e.4", relation: "RELATED" }, // Operate still or video cameras or related equipment.
  { slug: "photography", kind: "DWA", ref: "4.A.3.a.3.e.4", relation: "RELATED" },
  { slug: "project-management", kind: "DWA", ref: "4.A.2.b.6.b.8", relation: "RELATED" }, // Develop detailed project plans.
];
