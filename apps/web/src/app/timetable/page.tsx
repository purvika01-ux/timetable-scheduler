"use client";

import { useEffect, useMemo, useState } from "react";

import { ClassDialog } from "@/components/class-dialog";
import { DayAgenda } from "@/components/day-agenda";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { EmptyState, PageHeader, PageSkeleton, Panel, Segmented, Stamp, cx } from "@/components/ui";
import { SubjectLegend, WeekGrid } from "@/components/week-grid";
import { useDemoStore, useNow } from "@/lib/store";
import { DAY_ORDER } from "@/lib/timetable/grid";
import { makeLookup } from "@/lib/timetable/lookup";
import { dayIdFor, entriesOnDay, weeklyLoad } from "@/lib/timetable/queries";
import type { DayId, ScheduledEntry } from "@/lib/timetable/types";

type View = "day" | "week";

const SOURCE_LABEL = {
  sample: "Sample timetable",
  generated: "Generated timetable",
  edited: "Edited timetable",
} as const;

export default function TimetablePage() {
  const { ready, dataset, teacher, timetable, availability, saveTimetable } = useDemoStore();
  const now = useNow();
  const toast = useToast();
  const lookup = useMemo(() => makeLookup(dataset), [dataset]);
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<DayId>("mon");
  const [selected, setSelected] = useState<ScheduledEntry | null>(null);
  const [initialised, setInitialised] = useState(false);

  // Start on today (Monday on Sundays) and on the week grid for wide screens.
  useEffect(() => {
    if (!now || initialised) return;
    setDay(dayIdFor(now) ?? "mon");
    if (window.matchMedia("(min-width: 1024px)").matches) setView("week");
    setInitialised(true);
  }, [now, initialised]);

  const mine = useMemo(() => timetable.entries.filter((e) => e.teacherId === teacher.id), [timetable, teacher.id]);
  if (!ready || !now) return <PageSkeleton />;

  const today = dayIdFor(now);
  const grid = dataset.grid;
  const dayIndex = DAY_ORDER.indexOf(day);
  const dayCfg = grid.days.find((d) => d.id === day)!;
  const dayEntries = entriesOnDay(mine, day);
  const load = weeklyLoad(mine);
  const updated = new Date(timetable.updatedAt);

  return (
    <div>
      <PageHeader
        title="My Timetable"
        description={
          <>
            {load.classes} classes · {load.periods} teaching periods a week · {SOURCE_LABEL[timetable.source]}
            {timetable.source !== "sample" &&
              `, saved ${updated.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
          </>
        }
        actions={
          <Segmented<View>
            label="Timetable view"
            value={view}
            onChange={setView}
            options={[
              { value: "day", label: "Today / Day" },
              { value: "week", label: "Week" },
            ]}
          />
        }
      />

      {view === "day" ? (
        <Panel
          title={
            <span className="flex items-center gap-2">
              {dayCfg.label}
              {day === today && <Stamp tone="info">Today</Stamp>}
            </span>
          }
          action={
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDay(DAY_ORDER[dayIndex - 1])}
                disabled={dayIndex === 0}
                className="grid h-9 w-9 place-items-center rounded-md border border-line hover:bg-surface disabled:opacity-40"
                aria-label="Previous day"
              >
                <Icon name="chevronLeft" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDay(DAY_ORDER[dayIndex + 1])}
                disabled={dayIndex === DAY_ORDER.length - 1}
                className="grid h-9 w-9 place-items-center rounded-md border border-line hover:bg-surface disabled:opacity-40"
                aria-label="Next day"
              >
                <Icon name="chevronRight" className="h-4 w-4" />
              </button>
            </div>
          }
        >
          <div role="group" aria-label="Choose a day" className="-mx-1 mb-3 flex gap-1 overflow-x-auto pb-1">
            {grid.days.map((d) => {
              const count = entriesOnDay(mine, d.id).length;
              return (
                <button
                  key={d.id}
                  type="button"

                  aria-pressed={d.id === day}
                  onClick={() => setDay(d.id)}
                  className={cx(
                    "flex min-w-14 flex-1 flex-col items-center rounded-md border px-2 py-1.5 text-sm transition-colors",
                    d.id === day ? "border-primary bg-blue-50 text-primary" : "border-line text-ink hover:bg-surface",
                  )}
                >
                  <span className="font-semibold">{d.short}</span>
                  <span className="text-[11px] text-ink-muted">
                    {count} {count === 1 ? "class" : "classes"}
                  </span>
                  {d.id === today && <span className="sr-only">(today)</span>}
                </button>
              );
            })}
          </div>
          {dayEntries.length === 0 ? (
            <EmptyState icon="calendar" title={`No classes on ${dayCfg.label}`}>
              All {dayCfg.periodCount} periods are free.
            </EmptyState>
          ) : (
            <div className="-mx-4 -mb-4 border-t border-line-soft">
              <DayAgenda grid={grid} entries={mine} lookup={lookup} day={day} onSelect={setSelected} />
            </div>
          )}
        </Panel>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted lg:hidden">Scroll sideways to see all days, or use the Day view on small screens.</p>
          <WeekGrid
            grid={grid}
            entries={mine}
            lookup={lookup}
            perspective="teacher"
            onSelect={setSelected}
            highlightDay={today}
            caption={`Weekly timetable for ${teacher.name}`}
          />
          <SubjectLegend entries={mine} lookup={lookup} />
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">Select a class to see its details or move it. Moves are re-checked against the whole college timetable before saving.</p>

      <ClassDialog
        entry={selected}
        dataset={dataset}
        lookup={lookup}
        entries={timetable.entries}
        availability={availability}
        onClose={() => setSelected(null)}
        onMove={(entries, message) => {
          const ok = saveTimetable(entries, "edited", timetable.seed);
          if (ok) toast(message);
          return ok;
        }}
      />
    </div>
  );
}
