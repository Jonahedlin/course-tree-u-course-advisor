# Course Tree (u-course advisor)

A collapsible, force-directed tree of UNBC's programs, built on the amCharts
[collapsible force-directed tree](https://www.amcharts.com/demos/collapsible-force-directed-tree/?theme=Dataviz)
(Dataviz theme). Originally forked from the U-Course Advisor frontend's course
tree; the page has since been rebuilt around programs.

## How it works

- **At rest:** one bubble per faculty — the five faculties plus the Division of
  Medical Sciences (it only offers graduate programs).
- **First click:** a faculty opens into its programs (Computer Science, School of
  Business → "Business", Geography, …). A program groups every calendar page for
  that discipline, undergraduate and graduate together.
- **Second click:** a program opens into its options — majors, joint majors,
  honours, minors, streams, certificates, diplomas, master's and doctorates.
- **Clicking an option** opens a details panel: credential, level, minimum
  credit hours, every program/faculty it belongs to, the calendar's description,
  and links to the calendar requirements and program website.

An option that belongs to more than one program appears under **each** of them,
and therefore under both faculties when they differ:

- joint majors sit under every UNBC program named in them (Joint Major in
  Economics and Political Science → Economics *and* Political Science);
- anything the calendar lists on more than one program's pages does too (Minor in
  Global Environmental Change → Geography and Environmental and Sustainability
  Studies; Public Administration and Community Development → Geography and
  Political Science).

Every copy shares one `optionId`, so the panel is identical from either side.

There is no backend and no login.

## Data

`public/data/program-tree.json` is exported from the `unbc_courses` Postgres
database (`~/unbc-course-db`). The program level is defined explicitly in
`PROGRAMS` in `scrapers/export_program_tree.js` (which calendar pages make up
each program, and which faculty it belongs to), so placement can be audited.
Each export also writes `~/unbc-course-db/data/program_tree_report.md`: every
option with more than one parent, the full tree, and notes.

```bash
cd ~/unbc-course-db
PGDATABASE=unbc_courses node scrapers/export_program_tree.js \
  ~/Documents/GitHub/course-tree-u-course-advisor/public/data/program-tree.json data/program_tree_report.md
```

The export fails loudly if a calendar page has no program mapping.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
```

## Structure

```
src/
├── App.tsx                     renders the program explorer
├── Pages/ProgramExplorer.tsx   loads the data, Reset, details panel
├── Components/FacultyTree.tsx  the amCharts ForceDirected chart
├── lib/programs.ts             data types, loading, short faculty labels
├── lib/utils.ts                cn() helper
└── index.css                   Tailwind + the --brand accent colour
```

## Changes from the original

- Auth0 login and the U-Course Advisor API removed; data is a static export.
- The completed-courses tree (search, add / edit / remove courses, DUNE easter
  egg) was replaced by the faculty → program → option tree. It is in git history
  (`6ed4538`) if it's needed again.
- Bubbles are keyboard-accessible (Tab to move, Enter/Space to open) and named
  for screen readers.
