"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ClassDialog } from "@/components/class-dialog";
import { DayAgenda } from "@/components/day-agenda";
import { Icon } from "@/components/icons";
import { SUBJECT_STYLE } from "@/components/subject-style";
import { Banner, ButtonLink, cx, EmptyState, PageSkeleton, Panel, StatTile, Stamp } from "@/components/ui";
import { useDemoStore, useNow } from "@/lib/store";
import { DAY_ORDER, entryTimes, formatRange, formatTime } from "@/lib/timetable/grid";
import { makeLookup } from "@/lib/timetable/lookup";
import { dayIdFor, entriesOnDay, freePeriods, nextClass, upcomingThisWeek, weeklyLoad } from "@/lib/timetable/queries";
import type { ScheduledEntry } from "@/lib/timetable/types";
import { validateTimetable } from "@/lib/timetable/validator";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function untilLabel(minutes: number, daysAhead: number, dayLabel: string) {
  if (daysAhead >= 2) return dayLabel;
  if (daysAhead === 1) return `Tomorrow`;
  if (minutes < 60) return `In ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `In ${h} h${m ? ` ${m} min` : ""}`;
}

export default function DashboardPage() {
  const { ready, dataset, teacher, timetable, availability } = useDemoStore();
  const now = useNow();
  const [selected, setSelected] = useState<ScheduledEntry | null>(null);
  const lookup = useMemo(() => makeLookup(dataset), [dataset]);
  const grid = dataset.grid;

  const mine = useMemo(() => timetable.entries.filter((e) => e.teacherId === teacher.id), [timetable, teacher.id]);
  const report = useMemo(() => validateTimetable(dataset, timetable.entries, availability), [dataset, timetable, availability]);
  const myIssues = report.issues.filter((i) => i.entryIds.some((id) => mine.some((e) => e.id === id)));

  if (!ready || !now) return <PageSkeleton />;

  const today = dayIdFor(now);
  const todays = today ? entriesOnDay(mine, today) : [];
  const next = nextClass(grid, mine, now);
  const upcoming = upcomingThisWeek(grid, mine, now).filter((e) => e.id !== next?.entry.id).slice(0, 5);
  const load = weeklyLoad(mine);
  const freeToday = today ? freePeriods(grid, mine, today) : [];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const current = todays.find((e) => {
    const t = entryTimes(grid, e);
    const [sh, sm] = t.start.split(":").map(Number);
    const [eh, em] = t.end.split(":").map(Number);
    return sh * 60 + sm <= nowMinutes && nowMinutes < eh * 60 + em;
  });
  const dateText = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-ink-muted">{dateText}</p>
          <h1 className="mt-0.5 text-2xl font-semibold text-ink">
            {greeting(now.getHours())}, {teacher.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {teacher.designation} · {teacher.department}
          </p>
        </div>
        <div className="flex gap-2 pt-2 sm:pt-0">
          <ButtonLink href="/availability" icon="availability">
            Update availability
          </ButtonLink>
          <ButtonLink href="/timetable" variant="primary" icon="calendar">
            My timetable
          </ButtonLink>
        </div>
      </div>

      {myIssues.length > 0 ? (
        <Banner
          tone="warning"
          title={`${myIssues.length} of your classes no longer fit your saved availability`}
          action={
            <ButtonLink href="/generate" variant="primary" icon="generate">
              Regenerate timetable
            </ButtonLink>
          }
        >
          <ul className="list-disc space-y-0.5 pl-4">
            {myIssues.slice(0, 3).map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        </Banner>
      ) : (
        <p className="flex items-center gap-2 text-sm text-success">
          <Icon name="checkCircle" className="h-4 w-4" />
          Your timetable was checked just now: no teacher, room or section clashes.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Next class */}
        <section aria-labelledby="next-heading" className="rounded-lg border border-line bg-white p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="next-heading" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {next?.status === "in-progress" ? "Happening now" : "Next class"}
            </h2>
            {next && (
              <Stamp tone={next.status === "in-progress" ? "success" : "info"}>
                {next.status === "in-progress"
                  ? "In progress"
                  : untilLabel(next.minutesUntil, next.daysAhead, grid.days.find((d) => d.id === next.entry.day)?.label ?? "")}
              </Stamp>
            )}
          </div>
          {next ? (
            <NextClassBody entry={next.entry} lookup={lookup} grid={grid} onOpen={() => setSelected(next.entry)} />
          ) : (
            <p className="mt-4 text-sm text-ink-muted">No classes are scheduled for you this week.</p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <StatTile label="Today" value={todays.length} hint={today ? `${todays.length === 1 ? "class" : "classes"} scheduled` : "Sunday: no classes"} />
          <StatTile label="Free today" value={today ? freeToday.length : "—"} hint={today ? "periods without a class" : "Rest day"} />
          <StatTile label="Weekly load" value={load.periods} hint={`periods across ${load.classes} classes`} />
          <StatTile label="Sections" value={load.sections} hint={`${load.subjects} subjects · ${load.labs} lab blocks`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title={today ? `Today · ${grid.days.find((d) => d.id === today)?.label}` : "Today"}
          action={
            <Link href="/timetable" className="text-sm font-medium text-primary hover:underline">
              Full timetable
            </Link>
          }
        >
          {!today ? (
            <EmptyState icon="calendar" title="No classes on Sunday">
              Enjoy the day off. Your next class is shown above.
            </EmptyState>
          ) : todays.length === 0 ? (
            <EmptyState icon="calendar" title="No classes today">
              You have no classes scheduled today. Use the free time for preparation or office hours.
            </EmptyState>
          ) : (
            <div className="-mx-4 -my-2">
              <DayAgenda grid={grid} entries={mine} lookup={lookup} day={today} onSelect={setSelected} currentId={current?.id} />
            </div>
          )}
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <Panel title="Coming up this week">
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing else this week after your next class.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {upcoming.map((e) => {
                  const s = lookup.subject(e.subjectId);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(e)}
                        className="flex w-full items-center gap-3 rounded px-1 py-2 text-left hover:bg-surface"
                      >
                        <span className={cx("h-8 w-1 shrink-0 rounded", SUBJECT_STYLE[s?.color ?? "stone"].accent)} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{s?.name}</span>
                          <span className="block text-xs text-ink-muted">
                            {lookup.section(e.sectionId)?.name} · {lookup.room(e.roomId)?.name}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs">
                          <span className="block font-semibold text-ink">{grid.days.find((d) => d.id === e.day)?.short}</span>
                          <span className="block text-ink-muted">{formatTime(entryTimes(grid, e).start)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Your week">
            <ul className="space-y-2">
              {DAY_ORDER.map((d) => {
                const dayCfg = grid.days.find((x) => x.id === d)!;
                const periods = entriesOnDay(mine, d).reduce((n, e) => n + e.span, 0);
                return (
                  <li key={d} className="flex items-center gap-3 text-sm">
                    <span className={cx("w-9 font-medium", d === today ? "text-primary" : "text-ink")}>{dayCfg.short}</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={cx("absolute inset-y-0 left-0 rounded-full", d === today ? "bg-primary" : "bg-slate-400")}
                        style={{ width: `${(periods / dayCfg.periodCount) * 100}%` }}
                      />
                    </span>
                    <span className="w-28 text-right text-xs text-ink-muted">
                      {periods} of {dayCfg.periodCount} periods
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">Daily limit: {teacher.maxPeriodsPerDay} periods.</p>
          </Panel>
        </div>
      </div>

      <ClassDialog
        entry={selected}
        dataset={dataset}
        lookup={lookup}
        entries={timetable.entries}
        availability={availability}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function NextClassBody({
  entry,
  lookup,
  grid,
  onOpen,
}: {
  entry: ScheduledEntry;
  lookup: Lookup;
  grid: Parameters<typeof entryTimes>[0];
  onOpen: () => void;
}) {
  const subject = lookup.subject(entry.subjectId);
  const room = lookup.room(entry.roomId);
  const section = lookup.section(entry.sectionId);
  return (
    <div className="mt-3">
      <p className="flex items-center gap-2">
        <span className={cx("h-3 w-3 rounded-sm", SUBJECT_STYLE[subject?.color ?? "stone"].dot)} aria-hidden="true" />
        <span className="text-sm font-bold tracking-wide text-ink-muted">{subject?.code}</span>
      </p>
      <p className="mt-1 text-2xl font-semibold leading-tight text-ink">{subject?.name}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: "calendar" as const, label: "Day", value: grid.days.find((d) => d.id === entry.day)?.label },
          { icon: "clock" as const, label: "Time", value: formatRange(entryTimes(grid, entry)) },
          { icon: "pin" as const, label: "Room", value: room?.name },
          { icon: "users" as const, label: "Section", value: section?.name },
        ].map((d) => (
          <div key={d.label} className="rounded-md bg-surface px-3 py-2">
            <dt className="flex items-center gap-1 text-xs text-ink-muted">
              <Icon name={d.icon} className="h-3.5 w-3.5" />
              {d.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink">{d.value}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onOpen} className="mt-4 text-sm font-medium text-primary hover:underline">
        View class details
      </button>
    </div>
  );
}

type Lookup = ReturnType<typeof makeLookup>;
