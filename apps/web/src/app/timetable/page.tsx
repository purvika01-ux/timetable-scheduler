"use client";

import { useEffect, useMemo, useState } from "react";

import { ClassDialog } from "@/components/class-dialog";
import { DayAgenda } from "@/components/day-agenda";
import { Icon } from "@/components/icons";
import { TimetableExplorer } from "@/components/timetable-explorer";
import { useToast } from "@/components/toast";
import { Banner, Button, ButtonLink, EmptyState, PageHeader, PageSkeleton, Panel, Segmented, Stamp, cx } from "@/components/ui";
import { SubjectLegend, WeekGrid } from "@/components/week-grid";
import { useNow, useWorkspace } from "@/lib/store";
import { makeLookup } from "@/lib/timetable/lookup";
import { dayIdFor, entriesOnDay, weeklyLoad } from "@/lib/timetable/queries";
import type { DayId, ScheduledEntry, Teacher } from "@/lib/timetable/types";
import { validateTimetable } from "@/lib/timetable/validator";

const SOURCE_LABEL = {
  sample: "Sample timetable",
  generated: "Generated timetable",
  edited: "Edited timetable",
} as const;

export default function TimetablePage() {
  const { ready, viewTeacher } = useWorkspace();
  if (!ready) return <PageSkeleton />;
  return viewTeacher ? <TeacherTimetable teacher={viewTeacher} /> : <CollegeTimetable />;
}

function savedLabel(updatedAt: string) {
  return new Date(updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function CollegeTimetable() {
  const { dataset, timetable, saveTimetable } = useWorkspace();
  const toast = useToast();
  const report = useMemo(
    () => (timetable ? validateTimetable(dataset, timetable.entries, dataset.availability) : null),
    [dataset, timetable],
  );

  if (!timetable || !report) {
    return (
      <div>
        <PageHeader title="Timetable" description="The college's current timetable, by section, teacher, room or department." />
        <EmptyState icon="calendar" title="No timetable yet" action={<ButtonLink href="/generate" variant="primary" icon="generate">Generate timetable</ButtonLink>}>
          Set up the college, then generate a timetable. It appears here and in every teacher&apos;s view.
        </EmptyState>
      </div>
    );
  }

  const missing = report.missing.reduce((n, m) => n + m.missing, 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Timetable"
        description={
          <>
            {SOURCE_LABEL[timetable.source]}, {timetable.entries.length} classes
            {timetable.source !== "sample" && `, saved ${savedLabel(timetable.updatedAt)}`}. Select a class to see its details or move it.
          </>
        }
        actions={
          <span className="no-print flex gap-2">
            <Button icon="print" onClick={() => window.print()}>
              Print or save as PDF
            </Button>
            <ButtonLink href="/generate" icon="generate">
              Generate again
            </ButtonLink>
          </span>
        }
      />
      <div className="no-print">
        {!report.valid ? (
          <Banner tone="error" title={`${report.issues.length} ${report.issues.length === 1 ? "rule is" : "rules are"} broken after data changes`}>
            Classes with problems are outlined in red. Move them, change the data back, or generate again.
            <ul className="mt-2 list-disc pl-4">
              {report.issues.slice(0, 4).map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          </Banner>
        ) : missing > 0 ? (
          <Banner tone="warning" title={`Clash-free, but ${missing} ${missing === 1 ? "session is" : "sessions are"} not scheduled`}>
            The validator found no clashes. Some courses are missing sessions; generate again or check the pre-check on the Generate page.
          </Banner>
        ) : (
          <p className="flex items-center gap-2 text-sm text-success">
            <Icon name="checkCircle" className="h-4 w-4" />
            Checked just now: no clashes, every rule holds, and every course has all its weekly sessions.
          </p>
        )}
      </div>
      <TimetableExplorer
        dataset={dataset}
        entries={timetable.entries}
        availability={dataset.availability}
        flaggedIds={new Set(report.issues.flatMap((i) => i.entryIds))}
        heading="College timetable"
        onMove={(entries, message) => {
          const ok = saveTimetable(entries, "edited", timetable.seed);
          if (ok) toast(message);
          return ok;
        }}
      />
    </div>
  );
}

type View = "day" | "week";

function TeacherTimetable({ teacher }: { teacher: Teacher }) {
  const { dataset, timetable } = useWorkspace();
  const now = useNow();
  const lookup = useMemo(() => makeLookup(dataset), [dataset]);
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<DayId>("mon");
  const [selected, setSelected] = useState<ScheduledEntry | null>(null);
  const [initialised, setInitialised] = useState(false);

  // Start on today (Monday on Sundays) and on the week grid for wide screens.
  useEffect(() => {
    if (!now || initialised) return;
    const today = dayIdFor(now);
    setDay(today && dataset.grid.days.some((d) => d.id === today) ? today : (dataset.grid.days[0]?.id ?? "mon"));
    if (window.matchMedia("(min-width: 1024px)").matches) setView("week");
    setInitialised(true);
  }, [now, initialised, dataset.grid.days]);

  const mine = useMemo(() => (timetable?.entries ?? []).filter((e) => e.teacherId === teacher.id), [timetable, teacher.id]);
  if (!now) return <PageSkeleton />;

  const grid = dataset.grid;
  const today = dayIdFor(now);
  const days = grid.days.map((d) => d.id);
  const dayIndex = days.indexOf(day);
  const dayCfg = grid.days.find((d) => d.id === day) ?? grid.days[0];
  const dayEntries = entriesOnDay(mine, day);
  const load = weeklyLoad(mine);

  if (!timetable || !dayCfg) {
    return (
      <div>
        <PageHeader title="My Timetable" />
        <EmptyState icon="calendar" title="No timetable published yet">
          The coordinator has not generated a timetable yet. Check back later.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Timetable"
        description={
          <>
            {load.classes} classes · {load.periods} teaching periods a week · {SOURCE_LABEL[timetable.source]}
            {timetable.source !== "sample" && `, saved ${savedLabel(timetable.updatedAt)}`}
          </>
        }
        actions={
          <span className="no-print flex flex-wrap gap-2">
            <Segmented<View>
              label="Timetable view"
              value={view}
              onChange={setView}
              options={[
                { value: "day", label: "Today / Day" },
                { value: "week", label: "Week" },
              ]}
            />
            <Button icon="print" onClick={() => window.print()} aria-label="Print or save as PDF">
              <span className="hidden sm:inline">Print</span>
            </Button>
          </span>
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
                onClick={() => setDay(days[dayIndex - 1])}
                disabled={dayIndex <= 0}
                className="grid h-9 w-9 place-items-center rounded-md border border-line hover:bg-surface disabled:opacity-40"
                aria-label="Previous day"
              >
                <Icon name="chevronLeft" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDay(days[dayIndex + 1])}
                disabled={dayIndex >= days.length - 1}
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
          <p className="no-print text-sm text-ink-muted lg:hidden">Scroll sideways to see all days, or use the Day view on small screens.</p>
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

      <p className="no-print mt-4 text-xs text-ink-muted">
        Select a class to see its details. Only the timetable coordinator can move classes; ask them if something needs to change.
      </p>

      <ClassDialog
        entry={selected}
        dataset={dataset}
        lookup={lookup}
        entries={timetable.entries}
        availability={dataset.availability}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
