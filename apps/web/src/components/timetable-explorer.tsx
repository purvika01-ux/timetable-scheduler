"use client";

import { useMemo, useState } from "react";

import { makeLookup } from "@/lib/timetable/lookup";
import type { AvailabilityMap, Dataset, ScheduledEntry } from "@/lib/timetable/types";

import type { Perspective } from "./class-card";
import { ClassDialog } from "./class-dialog";
import { Segmented } from "./ui";
import { SubjectLegend, WeekGrid } from "./week-grid";

const PERSPECTIVES: { value: Perspective; label: string }[] = [
  { value: "section", label: "Section" },
  { value: "teacher", label: "Teacher" },
  { value: "room", label: "Room" },
  { value: "department", label: "Department" },
];

/** Whole-college timetable seen by section, teacher, room or department, with class details. */
export function TimetableExplorer({
  dataset,
  entries,
  availability,
  flaggedIds,
  onMove,
  heading,
}: {
  dataset: Dataset;
  entries: ScheduledEntry[];
  availability: AvailabilityMap;
  flaggedIds?: Set<string>;
  /** When given, coordinators can move classes from the details dialog. */
  onMove?: (entries: ScheduledEntry[], message: string) => boolean;
  heading: string;
}) {
  const lookup = useMemo(() => makeLookup(dataset), [dataset]);
  const [perspective, setPerspective] = useState<Perspective>("section");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScheduledEntry | null>(null);

  const options: { id: string; name: string }[] =
    perspective === "teacher"
      ? dataset.teachers
      : perspective === "section"
        ? dataset.sections
        : perspective === "room"
          ? dataset.rooms
          : dataset.departments.map((d) => ({ id: d.id, name: d.name }));
  const focus = options.find((o) => o.id === focusId)?.id ?? options[0]?.id;
  const shown = entries.filter((e) =>
    perspective === "teacher"
      ? e.teacherId === focus
      : perspective === "section"
        ? e.sectionId === focus
        : perspective === "room"
          ? e.roomId === focus
          : lookup.section(e.sectionId)?.departmentId === focus,
  );
  const focusName = options.find((o) => o.id === focus)?.name ?? "";
  const live = selected ? (entries.find((e) => e.id === selected.id) ?? null) : null;

  return (
    <section aria-labelledby="explorer-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="explorer-heading" className="text-base font-semibold text-ink">
          {heading}
          <span className="print-only text-sm font-normal"> · {focusName}</span>
        </h2>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Segmented<Perspective>
            label="View timetable by"
            value={perspective}
            onChange={(p) => {
              setPerspective(p);
              setFocusId(null);
            }}
            options={PERSPECTIVES}
          />
          <label className="sr-only" htmlFor="explorer-focus">
            Choose {perspective}
          </label>
          <select
            id="explorer-focus"
            value={focus ?? ""}
            onChange={(e) => setFocusId(e.target.value)}
            className="h-10 max-w-64 rounded-md border border-line bg-white px-2 text-sm"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing to show yet: add {perspective === "department" ? "departments" : `${perspective}s`} in Set up college.</p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {shown.length} {shown.length === 1 ? "class" : "classes"} · {shown.reduce((n, e) => n + e.span, 0)} periods a week for {focusName}
          </p>
          <WeekGrid
            grid={dataset.grid}
            entries={shown}
            lookup={lookup}
            perspective={perspective}
            onSelect={setSelected}
            flaggedIds={flaggedIds}
            caption={`${heading} for ${focusName}`}
          />
          <SubjectLegend entries={shown} lookup={lookup} />
        </>
      )}
      <ClassDialog
        entry={live}
        dataset={dataset}
        lookup={lookup}
        entries={entries}
        availability={availability}
        onClose={() => setSelected(null)}
        onMove={onMove}
      />
    </section>
  );
}
