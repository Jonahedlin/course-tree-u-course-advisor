import { useLayoutEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5hierarchy from "@amcharts/amcharts5/hierarchy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";

export interface TreeNode {
  id: string; // course_id
  code: string; // course_code — the node label
  credits?: number;
  /** true = a course the student completed; false = a prerequisite-only node. */
  added: boolean;
  grade?: string | null;
  semesterLabel?: string | null;
  /** course_ids this course connects to as prerequisites (draws a branch). */
  prereqIds: string[];
  /** Subset of prereqIds that are OR-alternatives with each other — the
   * backend groups prerequisites so that satisfying ANY ONE course within the
   * same group clears it (e.g. MATH115 OR CPSC141), while separate groups are
   * each independently required (AND). These render as dashed branches
   * instead of solid ones so "either of these" reads differently from
   * "both of these are required". */
  orPrereqIds?: string[];
}

/** A course node's shape once flattened into amCharts data. */
interface ForceNode {
  id: string;
  name: string;
  value: number;
  linkWith: string[];
  orLinkIds: string[];
  added: boolean;
  grade?: string | null;
  semesterLabel?: string | null;
}

/** Reads the live `--brand` accent colour off the root element, falling back
 * to Forest (the app default) if it's unset or unparsable. */
function getBrandColor(): am5.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
  const hex = raw.replace(/^#/, "");
  const num = parseInt(hex, 16);
  return am5.color(hex.length === 6 && Number.isFinite(num) ? num : 0x355834);
}

// Gold glow-ring pulse — used to celebrate a themed course set (e.g. the DUNE
// easter egg) once every course in it has been added to the tree.
const PULSE_GOLD = 0xd4af37;

/**
 * Collapsible force-directed course tree. Completed courses use the current
 * accent colour (tracks the Settings theme picker live); prerequisite-only
 * nodes are muted. A branch connects every course to each of its prerequisites.
 */
export default function CourseTree({
  nodes,
  pulseIds = [],
  onNodeClick,
}: {
  nodes: TreeNode[];
  /** course_ids to ring with a looping gold pulse (e.g. a completed easter-egg set). */
  pulseIds?: string[];
  /** Fired with a course_id when a completed (added) node is clicked. */
  onNodeClick?: (id: string) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const seriesRef = useRef<am5hierarchy.ForceDirected | null>(null);
  // Last data pushed to the series — replayed to re-run the fill adapters
  // (picking up a fresh --brand) when the accent changes while mounted.
  const dataRef = useRef<ForceNode[]>([]);
  // Running pulse animations per node id, so we don't restart a loop that's
  // already playing and can cleanly stop it if the node drops out of pulseIds.
  const pulseAnimsRef = useRef<Map<string, Array<{ stop: () => void }>>>(new Map());
  // Latest click callback, read from the one-time chart-creation effect below
  // so the chart doesn't need to be torn down and rebuilt when it changes.
  const onNodeClickRef = useRef(onNodeClick);
  useLayoutEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  // Create the chart once.
  useLayoutEffect(() => {
    if (!divRef.current) return;

    // amCharts caps rendering resolution on memory-constrained platforms
    // (notably mobile Safari) to save render cost — at the expense of visible
    // sharpness. Force full-resolution rendering; a tree this small doesn't
    // need the perf guard.
    const root = am5.Root.new(divRef.current, { useSafeResolution: false });
    root.setThemes([am5themes_Animated.new(root)]);

    const series = root.container.children.push(
      am5hierarchy.ForceDirected.new(root, {
        downDepth: 2,
        initialDepth: 2,
        valueField: "value",
        categoryField: "name",
        idField: "id",
        linkWithField: "linkWith",
        manyBodyStrength: -14,
        centerStrength: 0.9,
        // Radius is overridden to a constant below (see NODE_RADIUS); these just
        // keep ForceDirected's internal spacing sane.
        minRadius: 34,
        maxRadius: 34,
      }),
    );

    // Node fill: accent for completed courses, muted for prerequisite-only.
    series.circles.template.adapters.add("fill", (_fill, target) => {
      const d = target.dataItem?.dataContext as ForceNode | undefined;
      return d?.added ? getBrandColor() : am5.color(0xcbd5e1);
    });
    series.outerCircles.template.setAll({ strokeOpacity: 0 });

    // Completed nodes are clickable (view/edit/remove); prerequisite-only
    // nodes aren't part of the student's record, so they don't respond.
    series.circles.template.adapters.add("cursorOverStyle", (_val, target) => {
      const d = target.dataItem?.dataContext as ForceNode | undefined;
      return d?.added ? "pointer" : "default";
    });
    series.circles.template.events.on("click", (ev) => {
      const d = ev.target.dataItem?.dataContext as ForceNode | undefined;
      if (d?.added) onNodeClickRef.current?.(d.id);
    });

    // Uniform node size: ForceDirected scales radius by (aggregated) value, so
    // override it to a constant. Change NODE_RADIUS to resize every bubble.
    const NODE_RADIUS = 34;
    series.circles.template.adapters.add("radius", () => NODE_RADIUS);
    series.outerCircles.template.adapters.add("radius", () => NODE_RADIUS);

    // Labels: white on the dark completed nodes, dark on the muted ones.
    series.labels.template.setAll({ fontSize: 11, text: "{category}", oversizedBehavior: "none" });
    series.labels.template.adapters.add("fill", (_fill, target) => {
      const d = target.dataItem?.dataContext as ForceNode | undefined;
      return d?.added ? am5.color(0xffffff) : am5.color(0x334155);
    });

    series.links.template.setAll({ strength: 0.5, strokeOpacity: 0.4, strokeWidth: 2.5 });

    // Dashed branch = "either of these" (OR-alternatives within one
    // prerequisite group); solid = independently required (AND across groups).
    series.links.template.adapters.add("strokeDasharray", (_val, target) => {
      const sourceCtx = target.get("source")?.dataContext as ForceNode | undefined;
      const targetCtx = target.get("target")?.dataContext as ForceNode | undefined;
      if (sourceCtx && targetCtx && sourceCtx.orLinkIds.includes(targetCtx.id)) {
        return [4, 3];
      }
      return undefined;
    });

    // Tooltip with grade / semester for completed courses.
    series.nodes.template.set(
      "tooltipText",
      "{category}",
    );
    series.nodes.template.adapters.add("tooltipText", (_text, target) => {
      const d = target.dataItem?.dataContext as ForceNode | undefined;
      if (!d?.added) return "{category} (prerequisite)";
      const bits = [d.name];
      if (d.semesterLabel) bits.push(d.semesterLabel);
      if (d.grade) bits.push(`Grade: ${d.grade}`);
      return bits.join("\n");
    });

    rootRef.current = root;
    seriesRef.current = series;

    // Re-run the fill adapters (picking up a fresh --brand) whenever the
    // accent changes — e.g. the theme slider, or the UNBC easter egg — while
    // this tree is mounted. Mirrors the observer in useAccentBubbleColors.
    const refreshBrandColor = () => series.data.setAll(dataRef.current);
    const observer = new MutationObserver(refreshBrandColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    return () => {
      observer.disconnect();
      root.dispose();
      rootRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push data whenever the node set changes.
  useLayoutEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const data: ForceNode[] = nodes.map((n) => ({
      id: n.id,
      name: n.code,
      value: 1, // uniform — bubble size is fixed via min/maxRadius, not value

      // Only link to prerequisites that exist in the node set.
      linkWith: n.prereqIds.filter((pid) => nodes.some((m) => m.id === pid)),
      orLinkIds: (n.orPrereqIds ?? []).filter((pid) => nodes.some((m) => m.id === pid)),
      added: n.added,
      grade: n.grade,
      semesterLabel: n.semesterLabel,
    }));

    dataRef.current = data;
    series.data.setAll(data);
    series.appear(600, 100);
  }, [nodes]);

  // Gold pulse ring on nodes in `pulseIds` — layered on each node's outer
  // (hit-target) circle so it never disturbs the accent-coloured fill. Runs
  // on the outer circle rather than the inner one so the "completed" colour
  // stays legible underneath the glow.
  useLayoutEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const pulseSet = new Set(pulseIds);
    const running = pulseAnimsRef.current;

    series.dataItems.forEach((di) => {
      const id = (di.dataContext as ForceNode | undefined)?.id;
      const outer = di.get("outerCircle");
      if (!outer || !id) return;

      if (pulseSet.has(id)) {
        if (running.has(id)) return; // already pulsing
        outer.set("stroke", am5.color(PULSE_GOLD));
        outer.set("strokeWidth", 3);
        outer.set("strokeOpacity", 0);
        outer.set("scale", 1);
        running.set(id, [
          outer.animate({
            key: "strokeOpacity",
            from: 0.9,
            to: 0,
            duration: 1400,
            loops: Infinity,
            easing: am5.ease.out(am5.ease.cubic),
          }),
          outer.animate({
            key: "scale",
            from: 1,
            to: 1.7,
            duration: 1400,
            loops: Infinity,
            easing: am5.ease.out(am5.ease.cubic),
          }),
        ]);
      } else if (running.has(id)) {
        running.get(id)!.forEach((a) => a.stop());
        running.delete(id);
        outer.set("strokeOpacity", 0);
        outer.set("scale", 1);
      }
    });
  }, [pulseIds, nodes]);

  return <div ref={divRef} className="w-full h-full" />;
}
