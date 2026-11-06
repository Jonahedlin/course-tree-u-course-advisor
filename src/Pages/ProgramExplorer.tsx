import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExternalLink, RotateCcw, X } from "lucide-react";
import FacultyTree from "../Components/FacultyTree";
import { loadProgramTree, type ProgramOption, type ProgramTreeFile, type TreeNodeData } from "../lib/programs";

const CAREER_LABEL: Record<string, string> = {
  Undergraduate: "Undergraduate",
  Graduate: "Graduate",
  Certificate: "Certificate",
  Diploma: "Diploma",
};

const ProgramExplorer = () => {
  const [data, setData] = useState<ProgramTreeFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProgramOption | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    loadProgramTree()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the program data."));
  }, []);

  const openOption = (node: TreeNodeData) => {
    if (node.optionId && data) setSelected(data.options[node.optionId] ?? null);
  };

  return (
    <div className="app-bg min-h-dvh flex flex-col p-4 sm:p-6 gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-black">UNBC programs</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Click a faculty to see its programs, then a program to see its majors, minors, honours and other
            options. Joint majors appear under each program they combine.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setResetKey((k) => k + 1);
          }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-black hover:bg-gray-50"
        >
          <RotateCcw className="size-4" aria-hidden />
          Reset
        </button>
      </header>

      <main className="relative flex-1 min-h-[480px] bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {error ? (
          <div className="h-full flex items-center justify-center p-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : !data ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Loading…</div>
        ) : (
          <div className="absolute inset-0">
            <FacultyTree
              tree={data.tree}
              selectedOptionId={selected?.optionId}
              onOptionClick={openOption}
              resetKey={resetKey}
            />
          </div>
        )}

        <AnimatePresence>
          {selected && (
            <motion.aside
              key={selected.optionId}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2 }}
              className="absolute z-10 bottom-0 inset-x-0 max-h-[60%] sm:inset-x-auto sm:top-3 sm:right-3 sm:bottom-3 sm:max-h-none sm:w-96 overflow-y-auto bg-white sm:rounded-xl rounded-t-xl shadow-lg border border-gray-200 p-5"
              aria-label={`${selected.name} details`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {selected.kind}
                  </span>
                  <h2 className="mt-2 text-lg font-semibold text-black leading-snug">{selected.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-black"
                  aria-label="Close details"
                >
                  <X className="size-5" />
                </button>
              </div>

              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {selected.credential && (
                  <>
                    <dt className="text-gray-500">Credential</dt>
                    <dd className="text-black">{selected.credential}</dd>
                  </>
                )}
                <dt className="text-gray-500">Level</dt>
                <dd className="text-black">{CAREER_LABEL[selected.career] ?? selected.career}</dd>
                {selected.minCreditHours != null && (
                  <>
                    <dt className="text-gray-500">Credit hours</dt>
                    <dd className="text-black">{selected.minCreditHours} minimum</dd>
                  </>
                )}
                <dt className="text-gray-500">{selected.programs.length > 1 ? "Programs" : "Program"}</dt>
                <dd className="text-black">
                  <ul className="space-y-1">
                    {selected.programs.map((p) => (
                      <li key={p.key}>
                        {p.name}
                        <span className="block text-xs text-gray-500">{p.faculty}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </dl>

              {selected.description && (
                <p className="mt-4 text-sm text-gray-700 leading-relaxed">{selected.description}</p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {selected.calendarUrl && (
                  <a
                    href={selected.calendarUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-dark)]"
                  >
                    Calendar requirements
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
                {selected.websiteUrl && (
                  <a
                    href={selected.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-black hover:bg-gray-50"
                  >
                    Program website
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default ProgramExplorer;
