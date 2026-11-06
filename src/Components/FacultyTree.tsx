import { useLayoutEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5hierarchy from "@amcharts/amcharts5/hierarchy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import am5themes_Dataviz from "@amcharts/amcharts5/themes/Dataviz";
import am5themes_Responsive from "@amcharts/amcharts5/themes/Responsive";
import type { TreeNodeData } from "../lib/programs";

/** Splits a name into lines of at most ~14 characters on word boundaries. */
function lineBreak(name: string, width = 14): string {
  const lines: string[] = [];
  for (const word of name.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + word).length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.join("\n");
}

/**
 * Collapsible force-directed tree of Faculty → Program → option, after the
 * amCharts "Collapsible force-directed tree" demo (Dataviz theme). The hidden
 * root is UNBC, so the faculties are the bubbles shown at rest; each click
 * opens one more level. Clicking an option (a leaf) reports it upward.
 */
export default function FacultyTree({
  tree,
  selectedOptionId,
  onOptionClick,
  resetKey,
}: {
  tree: TreeNodeData;
  /** Every copy of this option (e.g. a joint major under both programs) gets a ring. */
  selectedOptionId?: string | null;
  onOptionClick?: (node: TreeNodeData) => void;
  /** Change to collapse the tree back to the faculties. */
  resetKey?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<am5hierarchy.ForceDirected | null>(null);
  // Read from the one-time chart setup so a new callback doesn't rebuild the chart.
  const onOptionClickRef = useRef(onOptionClick);
  useLayoutEffect(() => {
    onOptionClickRef.current = onOptionClick;
  }, [onOptionClick]);

  // Create the chart once.
  useLayoutEffect(() => {
    if (!divRef.current) return;
    const root = am5.Root.new(divRef.current, { useSafeResolution: false });
    root.setThemes([am5themes_Animated.new(root), am5themes_Dataviz.new(root), am5themes_Responsive.new(root)]);

    const series = root.container.children.push(
      am5hierarchy.ForceDirected.new(root, {
        singleBranchOnly: false, // opening a node leaves the other branches open
        // The unnamed root is hidden, so the faculties are what shows at rest; a
        // click opens exactly one level (faculty → programs, program → options).
        topDepth: 1,
        initialDepth: 1,
        downDepth: 1,
        valueField: "value",
        categoryField: "name",
        childDataField: "children",
        idField: "id",
        fillField: "fill", // set per faculty below; programs and options inherit it
        manyBodyStrength: -10,
        centerStrength: 0.8,
        minRadius: 24,
        maxRadius: am5.percent(12),
      }),
    );

    series.links.template.set("strength", 0.5);
    series.circles.template.setAll({
      shadowColor: am5.color(0x000000),
      shadowOpacity: 0.3,
      shadowBlur: 6,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
    });

    // ForceDirected caps each label at its circle's diameter, and amCharts'
    // "wrap" breaks names a letter per line in the small circles, so names are
    // pre-broken into short lines (see lineBreak) and "fit" scales them down.
    series.labels.template.setAll({ fontSize: 11, textAlign: "center", oversizedBehavior: "fit", minScale: 0.3 });
    // Options show a label relative to their program ("Major", "Joint · Physics");
    // the full name is in the tooltip and the side panel.
    series.labels.template.adapters.add("text", (text, target) => {
      const d = target.dataItem?.dataContext as TreeNodeData | undefined;
      if (!d) return text;
      return lineBreak(d.nodeType === "option" ? (d.label ?? d.name) : d.name);
    });
    series.nodes.template.adapters.add("tooltipText", (_text, target) => {
      const d = target.dataItem?.dataContext as TreeNodeData | undefined;
      if (!d) return "{category}";
      if (d.nodeType === "option") return `[bold]{category}[/]\n${d.kind}`;
      if (d.nodeType === "faculty") return `[bold]${d.fullName ?? d.name}[/]\n${d.children?.length ?? 0} programs`;
      return `[bold]{category}[/]\n${d.children?.length ?? 0} options`;
    });
    series.nodes.template.events.on("click", (ev) => {
      const d = ev.target.dataItem?.dataContext as TreeNodeData | undefined;
      if (d?.nodeType === "option") onOptionClickRef.current?.(d);
    });
    series.nodes.template.adapters.add("cursorOverStyle", () => "pointer");

    // Keyboard access: every bubble is a focusable button (Tab to move,
    // Enter/Space to open), named for screen readers.
    series.nodes.template.setAll({ focusable: true, role: "button" });
    series.nodes.template.adapters.add("ariaLabel", (_label, target) => {
      const d = target.dataItem?.dataContext as TreeNodeData | undefined;
      if (!d?.nodeType) return undefined; // the hidden UNBC root
      if (d.nodeType === "option") return `${d.name}, ${d.kind}`;
      if (d.nodeType === "faculty") return `${d.fullName ?? d.name}, ${d.children?.length ?? 0} programs`;
      return `${d.name}, ${d.children?.length ?? 0} options`;
    });

    seriesRef.current = series;
    return () => {
      root.dispose();
      seriesRef.current = null;
    };
  }, []);

  // (Re)load data: on first render, when the tree changes, and on reset.
  useLayoutEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.data.setAll([
      { ...tree, children: tree.children?.map((f) => (f.color ? { ...f, fill: am5.color(f.color) } : f)) },
    ]);
    // Selecting the hidden root (as the demo does) opens the faculties but also
    // draws their programs as collapsed bubbles; fold those away once the first
    // frame has laid out, so only the faculties show at rest.
    series.set("selectedDataItem", series.dataItems[0]);
    series.root.events.once("frameended", () => {
      for (const faculty of series.dataItems[0]?.get("children") ?? []) {
        faculty.get("node").states.applyAnimate("disabled");
        series.disableDataItem(faculty, 0);
      }
    });
    series.appear(1000, 100);
  }, [tree, resetKey]);

  // Ring every copy of the selected option.
  useLayoutEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const walk = (items: am5.DataItem<am5hierarchy.IForceDirectedDataItem>[]) => {
      for (const di of items) {
        const d = di.dataContext as TreeNodeData | undefined;
        const outer = di.get("outerCircle");
        if (outer && d?.nodeType === "option") {
          const on = !!selectedOptionId && d.optionId === selectedOptionId;
          outer.setAll({ stroke: am5.color(0x111827), strokeWidth: on ? 3 : 0, strokeOpacity: on ? 0.9 : 0 });
        }
        walk((di.get("children") ?? []) as am5.DataItem<am5hierarchy.IForceDirectedDataItem>[]);
      }
    };
    walk(series.dataItems as am5.DataItem<am5hierarchy.IForceDirectedDataItem>[]);
  }, [selectedOptionId, tree, resetKey]);

  return <div ref={divRef} className="w-full h-full" />;
}
