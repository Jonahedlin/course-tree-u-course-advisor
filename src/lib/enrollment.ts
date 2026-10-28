/**
 * "Current Enrolment" — backed by the /profile/planned-courses API (status
 * 'enrolled'), so it carries over across devices instead of living only in
 * this browser's localStorage. Semesters open for enrolment are derived from
 * the current date (the backend's semester vocabulary is september/january/
 * may = Fall/Winter/Spring). A course lives in at most one term at a time.
 */

export type SemesterCode = "september" | "january" | "may";

export interface OpenTerm {
  key: string; // e.g. "september-2026"
  label: string; // e.g. "Fall Semester 2026"
  semester: SemesterCode;
  year: number;
}

export interface EnrolledCourse {
  courseCode: string;
  title: string;
  credits: string;
}

/** termKey -> enrolled courses */
export type EnrollmentMap = Record<string, EnrolledCourse[]>;

// UNBC's three terms. The academic year runs Fall (Sep) of one year → Winter
// (Jan) → Summer (May–Jul) of the next.
const SEMESTER_LABEL: Record<SemesterCode, string> = {
  september: "Fall",
  january: "Winter",
  may: "Summer",
};

// Semester start months, in calendar order within a year.
const ORDER: { semester: SemesterCode; startMonth: number }[] = [
  { semester: "january", startMonth: 1 }, // Winter
  { semester: "may", startMonth: 5 },     // Summer (May–July)
  { semester: "september", startMonth: 9 }, // Fall
];

/**
 * The next `count` upcoming terms from `from` (default: now). A term counts as
 * upcoming only if it hasn't started yet, so a term already in progress is
 * skipped. e.g. from July 2026 → Fall 2026, Winter 2027, Summer 2027.
 */
export function getOpenTerms(count = 3, from = new Date()): OpenTerm[] {
  const currentYear = from.getFullYear();
  const currentMonth = from.getMonth() + 1; // 1-12
  const terms: OpenTerm[] = [];

  for (let y = currentYear; terms.length < count; y++) {
    for (const { semester, startMonth } of ORDER) {
      if (y > currentYear || startMonth > currentMonth) {
        terms.push({
          key: `${semester}-${y}`,
          label: `${SEMESTER_LABEL[semester]} Semester ${y}`,
          semester,
          year: y,
        });
        if (terms.length >= count) break;
      }
    }
  }
  return terms;
}

/**
 * Every term the student has attended so far — from their enrolment start
 * (year + semester) up to and including the term currently in progress.
 * Ordered most-recent-first, which suits picking the semester a completed
 * course was taken in.
 */
export function getAttendedTerms(
  startYear: number,
  startSemester: SemesterCode,
  from = new Date(),
): OpenTerm[] {
  const curYear = from.getFullYear();
  const curMonth = from.getMonth() + 1; // 1-12
  const startIdx = Math.max(
    ORDER.findIndex((o) => o.semester === startSemester),
    0,
  );
  const terms: OpenTerm[] = [];

  const add = (semester: SemesterCode, year: number) =>
    terms.push({
      key: `${semester}-${year}`,
      label: `${SEMESTER_LABEL[semester]} Semester ${year}`,
      semester,
      year,
    });

  // Always offer the enrolment start term itself, then every term since that has
  // begun (past years, or this year's terms whose start month has arrived —
  // Summer counts from May). This keeps the picker useful even for a student who
  // just started: they still see at least their first term.
  add(ORDER[startIdx].semester, startYear);

  for (let y = startYear; y <= curYear; y++) {
    ORDER.forEach(({ semester, startMonth }, i) => {
      if (y === startYear && i <= startIdx) return; // start term already added
      const hasBegun = y < curYear || startMonth <= curMonth;
      if (hasBegun) add(semester, y);
    });
  }
  return terms.reverse();
}

/** Human label for a stored term key, even if the term is no longer "open". */
export function termLabelFromKey(key: string): string {
  const [sem, yr] = key.split("-");
  const label = SEMESTER_LABEL[sem as SemesterCode] ?? sem;
  return `${label} Semester ${yr}`;
}

/** Shape of a row returned by GET /profile/planned-courses. */
export interface PlannedCourseRow {
  course_id: string;
  course_code: string;
  title: string;
  credits: number;
  status: "interested" | "enrolled";
  semester: SemesterCode;
  year: number;
}

/** Group enrolled-status rows into the termKey -> courses map the UI uses. */
export function rowsToEnrollmentMap(rows: PlannedCourseRow[]): EnrollmentMap {
  const map: EnrollmentMap = {};
  for (const r of rows) {
    const key = `${r.semester}-${r.year}`;
    (map[key] ??= []).push({
      courseCode: r.course_code,
      title: r.title,
      credits: String(r.credits),
    });
  }
  return map;
}

/** Split a termKey ("september-2026") back into its semester + year. */
export function parseTermKey(termKey: string): { semester: SemesterCode; year: number } {
  const [semester, year] = termKey.split("-");
  return { semester: semester as SemesterCode, year: Number(year) };
}
