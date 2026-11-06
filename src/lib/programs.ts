/**
 * Faculty → Program → option data for the faculty tree.
 *
 * `public/data/program-tree.json` is exported from the unbc_courses database
 * (~/unbc-course-db, `scrapers/export_program_tree.js`). An option that belongs
 * to several programs (joint majors, options the calendar lists on more than
 * one program's pages) appears once under each; every copy carries the same
 * `optionId`.
 */

export type OptionKind =
  | "Major"
  | "Joint Major"
  | "Honours"
  | "Minor"
  | "Stream"
  | "Degree"
  | "Certificate"
  | "Diploma"
  | "Master"
  | "Doctorate";

export interface TreeNodeData {
  id: string;
  name: string;
  nodeType?: "faculty" | "program" | "option";
  fullName?: string; // faculties: the full name (the bubble shows a short one)
  color?: string; // faculties: hex fill, inherited by their programs and options
  label?: string; // options: short label relative to the program, e.g. "Major", "Joint · Physics"
  optionId?: string;
  kind?: OptionKind;
  value?: number;
  children?: TreeNodeData[];
}

export interface ProgramOption {
  optionId: string;
  kind: OptionKind;
  name: string;
  calendarHeading: string;
  credential: string | null;
  credentialLabel: string | null;
  career: string;
  minCreditHours: number | null;
  description: string | null;
  calendarUrl: string | null;
  websiteUrl: string | null;
  programs: { key: string; name: string; faculty: string }[];
}

export interface ProgramTreeFile {
  generatedAt: string;
  tree: TreeNodeData;
  options: Record<string, ProgramOption>;
}

// Bubble labels for the faculties; the full name stays in the tooltip.
const FACULTY_SHORT: Record<string, string> = {
  FBE: "Business & Economics",
  FENV: "Environment",
  FHHS: "Human & Health Sciences",
  FISSH: "Indigenous Studies, Social Sciences & Humanities",
  FSE: "Science & Engineering",
  DMS: "Medical Sciences",
};

// One clearly different hue per faculty (each dark enough for white labels).
const FACULTY_COLOR: Record<string, string> = {
  FBE: "#2563eb", // blue
  FENV: "#16a34a", // green
  FHHS: "#dc2626", // red
  FISSH: "#7c3aed", // purple
  FSE: "#ea580c", // orange
  DMS: "#0d9488", // teal
};

export async function loadProgramTree(): Promise<ProgramTreeFile> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/program-tree.json`);
  if (!res.ok) throw new Error(`Couldn't load the program data (${res.status}).`);
  const data = (await res.json()) as ProgramTreeFile;
  for (const f of data.tree.children ?? []) {
    f.fullName = f.name;
    f.name = FACULTY_SHORT[f.id] ?? f.name;
    f.color = FACULTY_COLOR[f.id];
  }
  return data;
}
