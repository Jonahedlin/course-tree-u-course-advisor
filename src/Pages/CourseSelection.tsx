import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Plus, X, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useApi, ApiError } from "../lib/api";
import { getAttendedTerms, termLabelFromKey, type OpenTerm, type SemesterCode } from "../lib/enrollment";
import { menuContainerVerticalVariants, menuItemVariants } from "../lib/menuAnimation";
import { cn } from "../lib/utils";
import { usePreferences } from "../context/PreferencesContext";
import CourseTree, { type TreeNode } from "../Components/CourseTree";

// The Fremen litany shown when every DUNE course lands on the tree.
const SPICE_QUOTE =
  "Four things cannot be hidden: love, smoke, a pillar of fire and a man striding across the open bled.";
const SPICE_QUOTE_ATTRIBUTION = "— The Fremen";
// How long the tree glows gold before the reveal blurs in.
const SPICE_REVEAL_DELAY_MS = 5000;

// "Passed" / "Failed" cover pass/fail (non-disclosed-grade) courses; the
// letter scale stops at D+ since UNBC's lowest passing/failing letters are
// folded into those two tiles rather than listed individually.
const GRADE_OPTIONS = ["Passed", "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "Failed"];

interface SearchResult {
  course_id: string;
  course_code: string;
  title: string;
  credits?: number;
  level?: number;
}

interface SearchResponse {
  query: string;
  count: number;
  results: SearchResult[];
}

interface CompletedCourse {
  course_id: string;
  course_code: string;
  title: string;
  semester_taken: string;
  year_taken: number;
  grade: string | null;
  passed: boolean;
  credit_earned: number | null;
}

interface ProfileResponse {
  enrollment_year: number;
  enrollment_semester: string;
}

// Easter egg: filling every course from the "DUNE" department into the tree
// rings those nodes with a gold pulse (see CourseTree's pulseIds prop).
const DUNE_DEPARTMENT = "DUNE";

interface DepartmentCoursesResponse {
  courses: { course_id: string }[];
}

interface CourseDetail {
  course_id: string;
  course_code: string;
  title: string;
  credits: number;
  prerequisites: {
    group_index: number;
    notes: string | null;
    courses: { course_id: string; course_code: string; title: string; min_grade: string | null }[];
  }[];
}

/** A prerequisite course plus which sibling course_ids (if any) are
 * OR-alternatives to it within the same backend prerequisite group. */
interface PrereqInfo {
  id: string;
  code: string;
  orWith: string[];
}

/** Add/refresh a completed course and its prerequisite nodes in the node map. */
function mergeCourse(
  prev: Record<string, TreeNode>,
  course: { id: string; code: string; credits?: number },
  prereqs: PrereqInfo[],
  meta: { grade?: string | null; semesterLabel?: string | null },
): Record<string, TreeNode> {
  const next = { ...prev };
  next[course.id] = {
    id: course.id,
    code: course.code,
    credits: course.credits,
    added: true,
    grade: meta.grade ?? null,
    semesterLabel: meta.semesterLabel ?? null,
    prereqIds: prereqs.map((p) => p.id),
    // A prereq is an OR-alternative if it has siblings in its own group.
    orPrereqIds: prereqs.filter((p) => p.orWith.length > 0).map((p) => p.id),
  };
  for (const p of prereqs) {
    // Add prerequisites as muted nodes, but never downgrade one the student
    // has themselves completed.
    if (!next[p.id]) {
      next[p.id] = { id: p.id, code: p.code, added: false, prereqIds: [] };
    }
  }
  return next;
}

const CourseSelection = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const api = useApi();
  const { spiceUnlocked, unlockSpice } = usePreferences();

  const [nodesById, setNodesById] = useState<Record<string, TreeNode>>({});
  const [attendedTerms, setAttendedTerms] = useState<OpenTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duneCourseIds, setDuneCourseIds] = useState<string[]>([]);
  const [spiceRevealOpen, setSpiceRevealOpen] = useState(false);
  // Full backend record per completed course_id — feeds the edit form's
  // current values (CourseTree's TreeNode only carries display-ready fields).
  const [completedById, setCompletedById] = useState<Record<string, CompletedCourse>>({});

  // Search.
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Add course" form (semester + grade), reused for editing an existing
  // node's details — `formMode` picks which behaviour "Save" and the header
  // copy use. Only one of add/edit is ever open at a time, so sharing this
  // state avoids a near-duplicate second modal.
  const [pending, setPending] = useState<SearchResult | null>(null);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [pickedTerm, setPickedTerm] = useState<OpenTerm | null>(null);
  const [grade, setGrade] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Flatten a course's prerequisite groups into a de-duped list of courses,
  // keeping track of which courses are OR-alternatives within the same group
  // (e.g. MATH115 OR CPSC141 — completing either one clears that group; a
  // separate group is independently required, i.e. AND'd against this one).
  const fetchPrereqs = useCallback(
    async (courseId: string): Promise<PrereqInfo[]> => {
      try {
        const d = await api<CourseDetail>(`/courses/${courseId}`);
        const seen = new Set<string>();
        const list: PrereqInfo[] = [];
        for (const g of d.prerequisites ?? []) {
          const groupIds = g.courses.map((c) => c.course_id);
          for (const c of g.courses) {
            if (!seen.has(c.course_id)) {
              seen.add(c.course_id);
              list.push({
                id: c.course_id,
                code: c.course_code,
                orWith: groupIds.filter((id) => id !== c.course_id),
              });
            }
          }
        }
        return list;
      } catch {
        return [];
      }
    },
    [api],
  );

  // Fetch the DUNE department's course_ids once, for the pulse easter egg
  // below. Public endpoint (no profile needed) — a failure here just means
  // the egg never lights up, so it's kept off the critical load path.
  useEffect(() => {
    let cancelled = false;
    api<DepartmentCoursesResponse>("/courses", { query: { department: DUNE_DEPARTMENT } })
      .then((res) => {
        if (!cancelled) setDuneCourseIds(res.courses.map((c) => c.course_id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Initial load: attended terms + the tree built from completed courses.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profile, completed] = await Promise.all([
          api<ProfileResponse>("/profile").catch(() => null),
          api<CompletedCourse[]>("/profile/completed-courses").catch((e) => {
            if (e instanceof ApiError && e.status === 404) return [] as CompletedCourse[];
            throw e;
          }),
        ]);

        // Populate the semester picker from the enrolment start. Fall back to
        // the last few years if the profile couldn't be read, so it's never empty.
        const nowYear = new Date().getFullYear();
        setAttendedTerms(
          profile
            ? getAttendedTerms(profile.enrollment_year, profile.enrollment_semester as SemesterCode)
            : getAttendedTerms(nowYear - 4, "september"),
        );

        const entries = await Promise.all(
          completed.map(async (c) => ({
            course: { id: c.course_id, code: c.course_code },
            prereqs: await fetchPrereqs(c.course_id),
            grade: c.grade,
            semesterLabel: termLabelFromKey(`${c.semester_taken}-${c.year_taken}`),
          })),
        );

        if (cancelled) return;
        setNodesById((prev) => {
          let next = { ...prev };
          for (const entry of entries) {
            next = mergeCourse(next, entry.course, entry.prereqs, {
              grade: entry.grade,
              semesterLabel: entry.semesterLabel,
            });
          }
          return next;
        });
        setCompletedById((prev) => {
          const next = { ...prev };
          for (const c of completed) next[c.course_id] = c;
          return next;
        });
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load your courses.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, fetchPrereqs]);

  function handleSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api<SearchResponse>("/courses/search", { query: { q } });
        setSearchResults(res.results ?? []);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
  }

  // Deep-link from a recommended course's "I have done this course" link —
  // open the add-course form directly for that course, skipping search.
  useEffect(() => {
    const incoming = location.state as
      | { courseId?: string; courseCode?: string; title?: string; credits?: number }
      | null;
    if (incoming?.courseId && incoming.courseCode && incoming.title) {
      openForm({
        course_id: incoming.courseId,
        course_code: incoming.courseCode,
        title: incoming.title,
        credits: incoming.credits,
      });
      // Clear the state so a refresh or back-navigation doesn't reopen it.
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openForm = (r: SearchResult) => {
    setFormMode("add");
    setPending(r);
    setPickedTerm(null);
    setGrade("");
    setPickerOpen(false);
    setFormError(null);
    setConfirmingDelete(false);
    setQuery("");
    setSearchResults([]);
  };

  // Opens the same form pre-filled with a completed node's current details,
  // for viewing/editing/removing — triggered by clicking a bubble in the tree.
  const openEdit = useCallback(
    (courseId: string) => {
      const c = completedById[courseId];
      if (!c) return;
      setFormMode("edit");
      setPending({ course_id: c.course_id, course_code: c.course_code, title: c.title, credits: c.credit_earned ?? undefined });
      setPickedTerm({
        key: `${c.semester_taken}-${c.year_taken}`,
        label: termLabelFromKey(`${c.semester_taken}-${c.year_taken}`),
        semester: c.semester_taken as SemesterCode,
        year: c.year_taken,
      });
      setGrade(c.grade ?? "");
      setPickerOpen(false);
      setFormError(null);
      setConfirmingDelete(false);
    },
    [completedById],
  );

  const canSave = !!pending && !!pickedTerm && grade.trim() !== "" && !saving;

  const saveCourse = async () => {
    if (!pending || !pickedTerm) {
      setFormError("Pick the semester you took this course.");
      return;
    }
    if (grade.trim() === "") {
      setFormError("Select the grade you got.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (formMode === "edit") {
        const updated = await api<CompletedCourse>(
          `/profile/completed-courses/${encodeURIComponent(pending.course_code)}`,
          {
            method: "PATCH",
            body: {
              semester_taken: pickedTerm.semester,
              year_taken: pickedTerm.year,
              grade: grade.trim(),
            },
          },
        );
        setCompletedById((prev) => ({ ...prev, [pending.course_id]: updated }));
        setNodesById((prev) => {
          const node = prev[pending.course_id];
          if (!node) return prev;
          return {
            ...prev,
            [pending.course_id]: { ...node, grade: grade.trim(), semesterLabel: pickedTerm.label },
          };
        });
      } else {
        await api("/profile/completed-courses", {
          method: "POST",
          body: {
            course_code: pending.course_code,
            semester_taken: pickedTerm.semester,
            year_taken: pickedTerm.year,
            grade: grade.trim(),
          },
        }).catch((e) => {
          // Already recorded — treat as success and refresh the node.
          if (e instanceof ApiError && e.status === 409) return;
          throw e;
        });

        const prereqs = await fetchPrereqs(pending.course_id);
        setNodesById((prev) =>
          mergeCourse(
            prev,
            { id: pending.course_id, code: pending.course_code, credits: pending.credits },
            prereqs,
            { grade: grade.trim(), semesterLabel: pickedTerm.label },
          ),
        );
        setCompletedById((prev) => ({
          ...prev,
          [pending.course_id]: {
            course_id: pending.course_id,
            course_code: pending.course_code,
            title: pending.title,
            semester_taken: pickedTerm.semester,
            year_taken: pickedTerm.year,
            grade: grade.trim(),
            passed: true,
            credit_earned: pending.credits ?? null,
          },
        }));
      }
      setPending(null);
      setSaving(false);
    } catch (e) {
      setFormError(
        e instanceof ApiError ? e.message : `Failed to ${formMode === "edit" ? "update" : "save"} the course.`,
      );
      setSaving(false);
    }
  };

  // Removes a course from the tree entirely — only reachable from the edit
  // form, since prerequisite-only (muted) nodes were never the student's own.
  const deleteCourse = async () => {
    if (!pending) return;
    setDeleting(true);
    setFormError(null);
    try {
      await api(`/profile/completed-courses/${encodeURIComponent(pending.course_code)}`, {
        method: "DELETE",
      });
      const courseId = pending.course_id;
      setNodesById((prev) => {
        const next = { ...prev };
        // If another course still lists this one as a prerequisite, downgrade
        // it to a muted prerequisite-only node so that branch stays drawn;
        // otherwise drop it entirely.
        const stillAPrereq = Object.values(next).some(
          (n) => n.id !== courseId && n.prereqIds.includes(courseId),
        );
        if (stillAPrereq) {
          next[courseId] = { id: courseId, code: next[courseId].code, added: false, prereqIds: [] };
        } else {
          delete next[courseId];
        }
        // Drop prerequisite-only nodes nothing links to anymore (e.g. the
        // removed course's own prereqs). Muted nodes never carry prereqIds,
        // so a single pass catches every orphan.
        const referenced = new Set(Object.values(next).flatMap((n) => n.prereqIds));
        for (const n of Object.values(next)) {
          if (!n.added && !referenced.has(n.id)) delete next[n.id];
        }
        return next;
      });
      setCompletedById((prev) => {
        const next = { ...prev };
        delete next[courseId];
        return next;
      });
      setPending(null);
      setDeleting(false);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to remove the course.");
      setDeleting(false);
    }
  };

  const treeNodes = useMemo(() => Object.values(nodesById), [nodesById]);
  const hasOrGroup = useMemo(
    () => treeNodes.some((n) => (n.orPrereqIds?.length ?? 0) > 0),
    [treeNodes],
  );
  const completedCount = treeNodes.filter((n) => n.added).length;

  // DUNE easter egg: once every DUNE course is on the tree, ring them all
  // with the gold pulse. `duneCourseIds` arrives empty until the fetch above
  // resolves, so this stays off until there's an actual set to check against.
  const dunePulseIds = useMemo(() => {
    if (duneCourseIds.length === 0) return [];
    const allComplete = duneCourseIds.every((id) => nodesById[id]?.added);
    return allComplete ? duneCourseIds : [];
  }, [duneCourseIds, nodesById]);
  const duneComplete = dunePulseIds.length > 0;

  // Let the gold pulse play alone for a few seconds, then blur the tree and
  // reveal the Fremen litany + "You have unlocked 'The Spice'". Only fires
  // once ever — `spiceUnlocked` gates it so returning to an already-complete
  // tree on a later visit doesn't replay the reveal.
  useEffect(() => {
    if (!duneComplete || spiceUnlocked) return;
    const t = setTimeout(() => {
      setSpiceRevealOpen(true);
      unlockSpice();
    }, SPICE_REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [duneComplete, spiceUnlocked, unlockSpice]);

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">Your course tree</h1>
        <p className="text-black text-sm mt-1">
          Search a course you've completed, add the semester and grade, and it joins the tree —
          linked to its prerequisites.
        </p>
      </div>

      {/* Search — find a course to add */}
      <div className="mb-6">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search for a course by code or title…"
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-black outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 transition-colors"
          />
        </div>

        {query.trim().length >= 2 && (
          <div className="mt-2 bg-white rounded-xl shadow-sm border border-gray-100">
            {searching ? (
              <div className="p-4 text-center text-black text-sm">Searching…</div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                No courses found for “{query.trim()}”.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {searchResults.map((r) => (
                  <li key={r.course_id}>
                    <button
                      type="button"
                      onClick={() => openForm(r)}
                      className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-gray-100 text-black shrink-0">
                        {r.course_code}
                      </span>
                      <span className="flex-1 text-sm text-black">{r.title}</span>
                      <Plus className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Tree */}
      <div className="relative bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="h-[60vh] min-h-[420px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-black text-sm">
              Loading your course tree…
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-red-500 text-sm">{error}</div>
          ) : treeNodes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-gray-400 text-sm px-6">
              Search a course above to start building your tree.
            </div>
          ) : (
            <CourseTree nodes={treeNodes} pulseIds={dunePulseIds} onNodeClick={openEdit} />
          )}
        </div>

        {/* "The Spice" reveal — blurs the tree once all DUNE courses are in */}
        <AnimatePresence>
          {spiceRevealOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              onClick={() => setSpiceRevealOpen(false)}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center bg-black/60 backdrop-blur-md cursor-pointer"
            >
              <button
                type="button"
                onClick={() => setSpiceRevealOpen(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="max-w-md text-sm sm:text-base italic text-amber-100 leading-relaxed"
              >
                “{SPICE_QUOTE}”
                <span className="block not-italic text-xs sm:text-sm text-amber-200/70 mt-2">
                  {SPICE_QUOTE_ATTRIBUTION}
                </span>
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="text-lg sm:text-xl font-bold tracking-tight"
                style={{ color: "#d4af37" }}
              >
                You have unlocked "The Spice"
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {hasOrGroup && (
        <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block w-5 border-t border-dashed border-gray-400" />
          Dashed branch = either one of the connected courses satisfies that requirement
        </p>
      )}

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-black">
          {completedCount} course{completedCount === 1 ? "" : "s"} on your tree
        </span>
        <button
          type="button"
          onClick={() => navigate("/review")}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white transition active:scale-[0.98] active:brightness-110"
          style={{ backgroundColor: "var(--brand)" }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--brand-light)")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--brand)")}
        >
          Continue
        </button>
      </div>

      {/* Add/edit-course form (semester + grade) — the same modal serves both:
          "add" comes from search, "edit" comes from clicking a tree bubble. */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => !saving && !deleting && setPending(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 12, opacity: 0 }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  {formMode === "edit" && (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                      Editing course
                    </p>
                  )}
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-gray-100 text-black">
                    {pending.course_code}
                  </span>
                  <p className="text-sm font-medium text-black mt-2">{pending.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => !saving && !deleting && setPending(null)}
                  className="text-gray-400 hover:text-black transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Semester enrolled — enroll-style pill + pop-out */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-black mb-2">Semester enrolled *</label>
                {pickedTerm ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: "rgba(6,26,64,0.08)", color: "var(--brand)" }}
                    >
                      {pickedTerm.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPickedTerm(null);
                        setPickerOpen(true);
                      }}
                      className="text-xs text-gray-400 hover:text-[var(--brand)] transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => setPickerOpen((o) => !o)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-full transition-transform active:scale-95"
                      style={{ backgroundColor: "var(--brand)" }}
                    >
                      <Plus className={cn("w-3.5 h-3.5 transition-transform", pickerOpen && "rotate-45")} />
                      Select semester
                    </button>
                    <AnimatePresence>
                      {pickerOpen && (
                        <motion.div
                          variants={menuContainerVerticalVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="flex flex-col items-start gap-2 overflow-hidden max-h-52 overflow-y-auto"
                        >
                          <div className="h-2 shrink-0" />
                          {attendedTerms.length === 0 ? (
                            <p className="text-xs text-gray-400">No attended semesters found.</p>
                          ) : (
                            attendedTerms.map((t) => (
                              <motion.button
                                key={t.key}
                                variants={menuItemVariants}
                                type="button"
                                onClick={() => {
                                  setPickedTerm(t);
                                  setPickerOpen(false);
                                }}
                                className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-black hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors whitespace-nowrap shrink-0"
                              >
                                {t.label}
                              </motion.button>
                            ))
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Grade — tile picker. "Passed" covers a pass/fail course where
                  the actual letter grade isn't disclosed. */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-black mb-2">Grade *</label>
                <div className="grid grid-cols-4 gap-2">
                  {GRADE_OPTIONS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGrade(g)}
                      className={cn(
                        "py-2 rounded-lg text-sm font-medium border transition-colors",
                        grade === g
                          ? "text-white border-transparent"
                          : "text-black border-gray-200 hover:border-[var(--brand)]",
                      )}
                      style={grade === g ? { backgroundColor: "var(--brand)" } : undefined}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remove from tree — edit mode only, same confirm-inline
                  pattern as "Delete account" in Settings. */}
              {formMode === "edit" && (
                <div className="flex items-center justify-between mb-3">
                  {confirmingDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-black">Remove from tree?</span>
                      <button
                        type="button"
                        onClick={deleteCourse}
                        disabled={deleting || saving}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deleting ? "Removing…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        disabled={deleting}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-black bg-gray-100 hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      disabled={saving}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove from tree
                    </button>
                  )}
                </div>
              )}

              {formError && <p className="text-red-500 text-sm mb-3">{formError}</p>}

              <button
                type="button"
                onClick={saveCourse}
                disabled={!canSave || deleting}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] active:brightness-110"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {saving
                  ? formMode === "edit"
                    ? "Saving…"
                    : "Adding…"
                  : formMode === "edit"
                    ? "Save changes"
                    : "Add to tree"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CourseSelection;
