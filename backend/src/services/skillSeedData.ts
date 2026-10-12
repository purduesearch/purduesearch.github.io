// Starter skill taxonomy. Pure data, validated by skillTaxonomy.test.ts.
//
// `source` records which standard the skill's *concept* is drawn from (ESCO,
// O*NET, SFIA) or CLUB for skills specific to a student engineering team. No
// externalId is set: this is a curated starter set, not an import of those
// standards. A full ESCO/O*NET import can fill externalId later without
// changing slugs. Parents are slugs; a skill may have several.

import type { SkillType } from "@prisma/client";

export interface SeedSkill {
  slug: string;
  name: string;
  type: SkillType;
  source: "ESCO" | "ONET" | "SFIA" | "CLUB";
  aliases: string[];
  parents: string[];
  related?: string[];
  prerequisites?: string[];
}

const D: SkillType = "DOMAIN";
const T: SkillType = "TECHNIQUE";
const L: SkillType = "TOOL";
const S: SkillType = "SOFT_SKILL";

function s(
  slug: string, name: string, type: SkillType, source: SeedSkill["source"],
  aliases: string[] = [], parents: string[] = [], extra: Pick<SeedSkill, "related" | "prerequisites"> = {},
): SeedSkill {
  return { slug, name, type, source, aliases, parents, ...extra };
}

export const SEED_SKILLS: SeedSkill[] = [
  // ── Top-level domains ──
  s("mechanical-engineering", "Mechanical Engineering", D, "ONET", ["Mechanical Design"]),
  s("electrical-engineering", "Electrical Engineering", D, "ONET", ["EE"]),
  s("software-engineering", "Software Engineering", D, "SFIA", ["Software Development", "Programming"]),
  s("aerospace-engineering", "Aerospace Engineering", D, "ONET", ["Aerospace", "Aeronautics"]),
  s("systems-engineering", "Systems Engineering", D, "SFIA", ["SE", "Systems Design"]),
  s("manufacturing", "Manufacturing", D, "ONET", ["Fabrication"]),
  s("data-science", "Data Science", D, "SFIA", ["Data Analysis", "Analytics"]),
  s("project-management", "Project Management", D, "SFIA", ["PM", "Program Management"]),
  s("communication", "Communication", S, "ESCO", ["Communications"]),
  s("outreach-and-media", "Outreach and Media", D, "CLUB", ["Public Outreach"]),
  s("life-support-and-biology", "Life Support and Biology", D, "CLUB", ["Bioengineering", "Environmental Control and Life Support", "ECLSS"]),

  // ── Mechanical / CAD ──
  s("cad", "CAD", T, "ONET", ["Computer-Aided Design", "3D Modeling", "Solid Modeling"], ["mechanical-engineering"]),
  s("solidworks", "SolidWorks", L, "CLUB", ["Solid Works", "SW"], ["cad"]),
  s("fusion-360", "Fusion 360", L, "CLUB", ["Autodesk Fusion", "Fusion360"], ["cad"]),
  s("onshape", "Onshape", L, "CLUB", [], ["cad"]),
  s("catia", "CATIA", L, "CLUB", [], ["cad"]),
  s("nx", "Siemens NX", L, "CLUB", ["NX", "Unigraphics"], ["cad"]),
  s("inventor", "Autodesk Inventor", L, "CLUB", ["Inventor"], ["cad"]),
  s("assembly-design", "Assembly Design", T, "CLUB", ["Assemblies", "Mates and Constraints"], ["cad"], { prerequisites: ["cad"] }),
  s("surface-modeling", "Surface Modeling", T, "CLUB", ["Surfacing", "Class A Surfaces"], ["cad"], { prerequisites: ["cad"] }),
  s("sheet-metal-design", "Sheet Metal Design", T, "CLUB", ["Sheet Metal"], ["cad", "manufacturing"]),
  s("gdt", "GD&T", T, "ONET", ["Geometric Dimensioning and Tolerancing", "GDT", "Tolerancing"], ["mechanical-engineering"]),
  s("engineering-drawings", "Engineering Drawings", T, "ONET", ["Technical Drawings", "Drafting", "Blueprints"], ["mechanical-engineering"], { related: ["gdt"] }),
  s("design-for-manufacturing", "Design for Manufacturing", T, "CLUB", ["DFM", "DFMA", "Design for Assembly"], ["mechanical-engineering", "manufacturing"]),
  s("bom-management", "BOM Management", T, "CLUB", ["Bill of Materials", "BOM"], ["systems-engineering"]),
  s("pdm-and-change-control", "PDM and Change Control", T, "CLUB", ["Product Data Management", "PDM", "Engineering Change Orders", "ECO"], ["systems-engineering"]),
  s("structural-analysis", "Structural Analysis", T, "ONET", ["Stress Analysis", "Structures"], ["mechanical-engineering", "aerospace-engineering"]),
  s("fea", "Finite Element Analysis", T, "ONET", ["FEA", "FEM", "Finite Element Method", "Structural Simulation"], ["structural-analysis"], { prerequisites: ["structural-analysis"] }),
  s("ansys", "ANSYS", L, "CLUB", ["Ansys Mechanical"], ["fea", "cfd"]),
  s("abaqus", "Abaqus", L, "CLUB", [], ["fea"]),
  s("thermal-analysis", "Thermal Analysis", T, "ONET", ["Thermal Modeling", "Heat Transfer Analysis", "Thermal Design"], ["mechanical-engineering", "aerospace-engineering"]),
  s("cfd", "Computational Fluid Dynamics", T, "ONET", ["CFD", "Fluid Simulation"], ["mechanical-engineering", "aerospace-engineering"]),
  s("openfoam", "OpenFOAM", L, "CLUB", [], ["cfd"]),
  s("fluid-mechanics", "Fluid Mechanics", D, "ONET", ["Fluids", "Fluid Dynamics"], ["mechanical-engineering"]),
  s("thermodynamics", "Thermodynamics", D, "ONET", [], ["mechanical-engineering"]),
  s("materials-selection", "Materials Selection", T, "ONET", ["Materials Engineering", "Material Science"], ["mechanical-engineering"]),
  s("mechanism-design", "Mechanism Design", T, "CLUB", ["Kinematics", "Linkages"], ["mechanical-engineering"]),
  s("vibration-analysis", "Vibration Analysis", T, "ONET", ["Modal Analysis", "Dynamics"], ["structural-analysis"]),
  s("tolerance-stackup", "Tolerance Stack-up", T, "CLUB", ["Stackup Analysis"], ["gdt"], { prerequisites: ["gdt"] }),

  // ── Manufacturing / fabrication ──
  s("3d-printing", "3D Printing", T, "CLUB", ["Additive Manufacturing", "FDM", "SLA", "Rapid Prototyping"], ["manufacturing"]),
  s("cnc-machining", "CNC Machining", T, "ONET", ["CNC", "Milling", "Machining"], ["manufacturing"]),
  s("manual-machining", "Manual Machining", T, "ONET", ["Lathe", "Mill Operation"], ["manufacturing"]),
  s("cam", "CAM Programming", T, "ONET", ["CAM", "Toolpath Generation", "G-code"], ["cnc-machining"]),
  s("welding", "Welding", T, "ONET", ["TIG Welding", "MIG Welding"], ["manufacturing"]),
  s("composites-layup", "Composites Layup", T, "CLUB", ["Carbon Fiber Layup", "Composites", "Fiberglass"], ["manufacturing", "aerospace-engineering"]),
  s("laser-cutting", "Laser Cutting", T, "CLUB", ["Laser Cutter"], ["manufacturing"]),
  s("assembly-and-integration", "Assembly and Integration", T, "CLUB", ["Hardware Integration", "System Integration"], ["manufacturing", "systems-engineering"]),
  s("soldering", "Soldering", T, "ONET", ["Hand Soldering", "SMD Soldering", "Rework"], ["electrical-engineering", "manufacturing"]),

  // ── Electronics ──
  s("circuit-design", "Circuit Design", T, "ONET", ["Analog Design", "Schematic Design", "Circuit Analysis"], ["electrical-engineering"]),
  s("pcb-design", "PCB Design", T, "ONET", ["Printed Circuit Board Layout", "PCB Layout", "Board Design"], ["electrical-engineering"], { prerequisites: ["circuit-design"] }),
  s("kicad", "KiCad", L, "CLUB", [], ["pcb-design"]),
  s("altium", "Altium Designer", L, "CLUB", ["Altium"], ["pcb-design"]),
  s("eagle", "Autodesk EAGLE", L, "CLUB", ["Eagle PCB"], ["pcb-design"]),
  s("embedded-systems", "Embedded Systems", D, "SFIA", ["Firmware", "Embedded Programming", "Microcontrollers"], ["electrical-engineering", "software-engineering"]),
  s("arduino", "Arduino", L, "CLUB", [], ["embedded-systems"]),
  s("stm32", "STM32", L, "CLUB", ["STM32 HAL"], ["embedded-systems"]),
  s("esp32", "ESP32", L, "CLUB", ["ESP-IDF"], ["embedded-systems"]),
  s("rtos", "Real-Time Operating Systems", T, "SFIA", ["RTOS", "FreeRTOS", "Zephyr"], ["embedded-systems"]),
  s("power-electronics", "Power Electronics", D, "ONET", ["Power Supply Design", "Motor Drivers", "DC-DC Converters"], ["electrical-engineering"]),
  s("rf-and-antennas", "RF and Antennas", D, "ONET", ["RF Design", "Radio Frequency", "Antenna Design"], ["electrical-engineering"]),
  s("sensor-integration", "Sensor Integration", T, "CLUB", ["Sensors", "Instrumentation", "Data Acquisition"], ["electrical-engineering", "embedded-systems"]),
  s("signal-processing", "Signal Processing", D, "ONET", ["DSP", "Filtering"], ["electrical-engineering", "data-science"]),
  s("electronics-testing", "Electronics Testing and Debugging", T, "ONET", ["Oscilloscope", "Bring-up", "Hardware Debugging", "Multimeter"], ["electrical-engineering"]),
  s("wiring-and-harnesses", "Wiring and Harnesses", T, "CLUB", ["Cable Harness", "Wire Routing", "Cable Management"], ["electrical-engineering"]),
  s("fpga", "FPGA Design", T, "SFIA", ["FPGA", "Verilog", "VHDL"], ["electrical-engineering"]),

  // ── Software ──
  s("python", "Python", L, "SFIA", ["Python3", "Python 3"], ["software-engineering"]),
  s("javascript", "JavaScript", L, "SFIA", ["JS", "ECMAScript"], ["software-engineering"]),
  s("typescript", "TypeScript", L, "SFIA", ["TS"], ["javascript"]),
  s("react", "React", L, "SFIA", ["ReactJS", "React.js"], ["javascript", "frontend-development"]),
  s("nodejs", "Node.js", L, "SFIA", ["Node", "NodeJS", "Express"], ["javascript", "backend-development"]),
  s("c-language", "C", L, "SFIA", ["C Programming", "ANSI C"], ["software-engineering", "embedded-systems"]),
  s("cpp", "C++", L, "SFIA", ["cpp", "C plus plus", "CPlusPlus"], ["software-engineering"]),
  s("rust", "Rust", L, "SFIA", [], ["software-engineering"]),
  s("java", "Java", L, "SFIA", [], ["software-engineering"]),
  s("matlab", "MATLAB", L, "ONET", ["Simulink"], ["data-science", "systems-engineering"]),
  s("frontend-development", "Frontend Development", D, "SFIA", ["Front-end", "Web UI"], ["software-engineering"]),
  s("backend-development", "Backend Development", D, "SFIA", ["Back-end", "Server-side Development"], ["software-engineering"]),
  s("html-css", "HTML and CSS", L, "SFIA", ["HTML", "CSS", "Tailwind"], ["frontend-development"]),
  s("rest-api-design", "REST API Design", T, "SFIA", ["REST", "API Design", "Web APIs"], ["backend-development"]),
  s("databases", "Databases", D, "SFIA", ["Database Design", "Data Modeling"], ["backend-development", "data-science"]),
  s("sql", "SQL", L, "SFIA", ["PostgreSQL", "Postgres", "MySQL"], ["databases"]),
  s("prisma-orm", "Prisma", L, "CLUB", ["Prisma ORM"], ["databases", "typescript"]),
  s("git", "Git", L, "SFIA", ["GitHub", "Version Control"], ["software-engineering"]),
  s("ci-cd", "CI/CD", T, "SFIA", ["Continuous Integration", "GitHub Actions", "DevOps"], ["software-engineering"]),
  s("linux", "Linux", L, "SFIA", ["Unix", "Bash", "Shell Scripting"], ["software-engineering"]),
  s("docker", "Docker", L, "SFIA", ["Containers"], ["ci-cd"]),
  s("software-testing", "Software Testing", T, "SFIA", ["Unit Testing", "Test Automation", "QA"], ["software-engineering"]),
  s("code-review", "Code Review", T, "SFIA", ["Peer Review", "Pull Request Review"], ["software-engineering"]),
  s("threejs", "Three.js", L, "CLUB", ["Three", "WebGL", "3D Web Graphics"], ["frontend-development"]),
  s("ros", "ROS", L, "CLUB", ["ROS2", "Robot Operating System"], ["robotics", "software-engineering"]),
  s("computer-vision", "Computer Vision", D, "SFIA", ["OpenCV", "Image Processing"], ["data-science", "software-engineering"]),
  s("machine-learning", "Machine Learning", D, "SFIA", ["ML", "Deep Learning", "AI"], ["data-science"]),
  s("data-visualization", "Data Visualization", T, "SFIA", ["Charts", "Dashboards"], ["data-science"]),
  s("scientific-computing", "Scientific Computing", T, "ONET", ["NumPy", "SciPy", "Numerical Methods"], ["data-science", "python"]),

  // ── Aerospace / controls / robotics ──
  s("robotics", "Robotics", D, "ONET", ["Robotic Systems"], ["systems-engineering", "electrical-engineering"]),
  s("controls", "Control Systems", D, "ONET", ["Control Theory", "Controls Engineering", "PID Control"], ["electrical-engineering", "aerospace-engineering"]),
  s("gnc", "Guidance, Navigation and Control", D, "ONET", ["GNC", "Flight Dynamics", "Attitude Control"], ["controls", "aerospace-engineering"]),
  s("orbital-mechanics", "Orbital Mechanics", D, "ONET", ["Astrodynamics", "Trajectory Design"], ["aerospace-engineering"]),
  s("propulsion", "Propulsion", D, "ONET", ["Rocket Propulsion", "Engines"], ["aerospace-engineering"]),
  s("aerodynamics", "Aerodynamics", D, "ONET", ["Aero"], ["aerospace-engineering", "fluid-mechanics"]),
  s("spacecraft-systems", "Spacecraft Systems", D, "CLUB", ["Space Systems", "Spacecraft Design", "Satellite Design"], ["aerospace-engineering", "systems-engineering"]),
  s("space-suit-design", "Space Suit Design", D, "CLUB", ["Spacesuit Design", "EVA Suits", "Pressure Garments"], ["spacecraft-systems", "mechanical-engineering"]),
  s("habitat-design", "Habitat Design", D, "CLUB", ["Planetary Habitat", "Crew Habitat"], ["spacecraft-systems"]),
  s("human-factors", "Human Factors", D, "ONET", ["Ergonomics", "Human Systems Integration", "HSI"], ["systems-engineering"]),
  s("environmental-testing", "Environmental Testing", T, "ONET", ["Thermal Vac", "Vibration Testing", "Qualification Testing"], ["systems-engineering"]),
  s("hydroponics", "Hydroponics", D, "CLUB", ["Plant Growth Systems", "Controlled Environment Agriculture", "CEA"], ["life-support-and-biology"]),
  s("life-support-systems", "Life Support Systems", D, "CLUB", ["Life Support", "Atmosphere Control", "CO2 Scrubbing"], ["life-support-and-biology", "spacecraft-systems"]),

  // ── Systems engineering / process ──
  s("requirements-engineering", "Requirements Engineering", T, "SFIA", ["Requirements Analysis", "Requirements Definition"], ["systems-engineering"]),
  s("systems-architecture", "Systems Architecture", T, "SFIA", ["Architecture Design", "Trade Studies"], ["systems-engineering"]),
  s("mbse", "Model-Based Systems Engineering", T, "SFIA", ["MBSE", "SysML"], ["systems-engineering"]),
  s("verification-and-validation", "Verification and Validation", T, "SFIA", ["V&V", "Test Planning", "Test Procedures"], ["systems-engineering"]),
  s("risk-management", "Risk Management", T, "SFIA", ["Risk Analysis", "FMEA"], ["project-management", "systems-engineering"]),
  s("technical-writing", "Technical Writing", T, "ESCO", ["Documentation", "Technical Documentation", "Report Writing"], ["communication"]),
  s("design-reviews", "Design Reviews", T, "CLUB", ["PDR", "CDR", "Design Review Facilitation"], ["systems-engineering", "communication"]),

  // ── Soft skills / leadership ──
  s("team-leadership", "Team Leadership", S, "ESCO", ["Leadership", "Leading Teams", "Subteam Lead"], ["project-management"]),
  s("mentoring", "Mentoring", S, "ESCO", ["Coaching", "Onboarding New Members", "Teaching"], ["communication"]),
  s("planning-and-scheduling", "Planning and Scheduling", T, "SFIA", ["Scheduling", "Roadmapping", "Sprint Planning"], ["project-management"]),
  s("task-coordination", "Task Coordination", S, "ESCO", ["Coordination", "Cross-team Coordination"], ["project-management"]),
  s("presenting", "Presenting", S, "ESCO", ["Public Speaking", "Presentations"], ["communication"]),
  s("collaboration", "Collaboration", S, "ESCO", ["Teamwork"], ["communication"]),
  s("problem-solving", "Problem Solving", S, "ESCO", ["Troubleshooting", "Root Cause Analysis"]),
  s("testing-and-troubleshooting", "Testing and Troubleshooting", T, "ONET", ["Test and Debug", "Fault Finding"], ["problem-solving"]),
  s("budgeting-and-procurement", "Budgeting and Procurement", T, "ESCO", ["Purchasing", "Sourcing", "Vendor Management"], ["project-management"]),
  s("grant-writing", "Grant Writing", T, "ESCO", ["Sponsorship Proposals", "Fundraising"], ["communication"]),

  // ── Outreach / media ──
  s("social-media", "Social Media", T, "ESCO", ["Social Media Management", "Content Creation"], ["outreach-and-media"]),
  s("graphic-design", "Graphic Design", T, "ESCO", ["Visual Design", "Illustration", "Figma", "Photoshop"], ["outreach-and-media"]),
  s("video-production", "Video Production", T, "ESCO", ["Video Editing", "Videography"], ["outreach-and-media"]),
  s("photography", "Photography", T, "ESCO", [], ["outreach-and-media"]),
  s("public-outreach", "STEM Outreach", T, "CLUB", ["Education Outreach", "K-12 Outreach", "Community Events"], ["outreach-and-media"]),
  s("event-organization", "Event Organization", T, "ESCO", ["Event Planning", "Event Management"], ["project-management", "outreach-and-media"]),
];
