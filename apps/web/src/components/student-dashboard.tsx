"use client";

import { useMemo } from "react";

import { RoutineTable } from "@/components/routine-table";
import { Button, ButtonLink, Panel } from "@/components/ui";
import { useNow, useWorkspace } from "@/lib/store";
import { entryTimes, formatRange } from "@/lib/timetable/grid";
import { makeLookup } from "@/lib/timetable/lookup";
import { dayIdFor, entriesOnDay } from "@/lib/timetable/queries";
import type { Section } from "@/lib/timetable/types";

export function StudentDashboard({ section }: { section: Section }) {
  const { dataset, timetable, setRole } = useWorkspace();
  const now = useNow();

  const entries = useMemo(() => timetable?.entries ?? [], [timetable]);
  const lookup = useMemo(() => makeLookup(dataset), [dataset]);
  const grid = dataset.grid;

  const sectionEntries = useMemo(
    () => entries.filter((e) => e.sectionId === section.id),
    [entries, section.id],
  );

  const today = now ? dayIdFor(now) : null;
  const todaysClasses = useMemo(() => {
    if (!today) return [];
    return entriesOnDay(sectionEntries, today).sort((a, b) => a.startPeriod - b.startPeriod);
  }, [sectionEntries, today]);

  // Find current and next class
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const currentClass = todaysClasses.find((e) => {
    const t = entryTimes(grid, e);
    const [sh, sm] = t.start.split(":").map(Number);
    const [eh, em] = t.end.split(":").map(Number);
    return (sh ?? 0) * 60 + (sm ?? 0) <= nowMinutes && nowMinutes < (eh ?? 0) * 60 + (em ?? 0);
  });

  const nextClass = todaysClasses.find((e) => {
    const t = entryTimes(grid, e);
    const [sh, sm] = t.start.split(":").map(Number);
    return (sh ?? 0) * 60 + (sm ?? 0) > nowMinutes;
  });

  const department = dataset.departments.find((d) => d.id === section.departmentId);

  // Section subjects
  const sectionCourses = dataset.requirements.filter((r) => r.sectionId === section.id);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-600" />
            Student Schedule · {department?.code ?? "College"}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            Section {section.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {department?.name ? `${department.name} · ` : ""}
            Daily class routine, lecture rooms, laboratory schedules, and faculty
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
          {dataset.sections.length > 1 && (
            <select
              value={section.id}
              onChange={(e) => setRole({ kind: "student", sectionId: e.target.value })}
              className="h-10 rounded-md border border-line bg-white px-3 text-xs font-medium text-ink focus:border-primary focus:outline-none"
            >
              {dataset.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section: {s.name}
                </option>
              ))}
            </select>
          )}
          <Button variant="ghost" icon="refresh" onClick={() => setRole({ kind: "portal" })}>
            Switch Role
          </Button>
          <Button icon="print" onClick={() => window.print()}>
            Print Routine
          </Button>
          <ButtonLink href="/timetable" variant="primary" icon="calendar">
            Weekly Timetable
          </ButtonLink>
        </div>
      </div>

      {/* Hero Class Notification Card */}
      {currentClass ? (
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                Live Class in Session
              </span>
              <h2 className="mt-2 text-xl font-bold text-ink sm:text-2xl">
                {lookup.subject(currentClass.subjectId)?.name ?? "Subject"}
              </h2>
              <p className="text-xs text-ink-muted">
                Taught by {lookup.teacher(currentClass.teacherId)?.name ?? "Faculty"}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <div className="inline-block rounded-xl bg-white px-4 py-2 border border-emerald-200 shadow-xs">
                <div className="text-xs font-semibold text-emerald-800">ROOM / LAB</div>
                <div className="text-lg font-bold text-ink">
                  {lookup.room(currentClass.roomId)?.name ?? "Assigned Room"}
                </div>
                <div className="text-[11px] text-ink-muted">
                  {formatRange(entryTimes(grid, currentClass))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : nextClass ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                Next Upcoming Class Today
              </span>
              <h2 className="mt-2 text-lg font-bold text-ink sm:text-xl">
                {lookup.subject(nextClass.subjectId)?.name ?? "Subject"}
              </h2>
              <p className="text-xs text-ink-muted">
                Faculty: {lookup.teacher(nextClass.teacherId)?.name ?? "Instructor"}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <div className="inline-block rounded-xl bg-white px-4 py-2 border border-blue-200 shadow-xs">
                <div className="text-xs font-semibold text-blue-700">ROOM / LAB</div>
                <div className="text-base font-bold text-ink">
                  {lookup.room(nextClass.roomId)?.name ?? "Room"}
                </div>
                <div className="text-[11px] text-ink-muted">
                  {formatRange(entryTimes(grid, nextClass))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">
          No active or remaining classes scheduled for your section today.
        </div>
      )}

      {/* Today's Schedule Timeline */}
      <Panel title={`Today's Classes (${today ? today.charAt(0).toUpperCase() + today.slice(1) : "Schedule"})`}>
        {todaysClasses.length === 0 ? (
          <p className="text-xs text-ink-muted py-3">No sessions scheduled for today.</p>
        ) : (
          <div className="divide-y divide-line/60">
            {todaysClasses.map((item, idx) => {
              const time = formatRange(entryTimes(grid, item));
              const subject = lookup.subject(item.subjectId);
              const teacher = lookup.teacher(item.teacherId);
              const room = lookup.room(item.roomId);

              return (
                <div key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-xs font-bold text-ink">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-ink text-sm">
                        {subject?.name} <span className="text-xs text-ink-muted">({subject?.code})</span>
                      </p>
                      <p className="text-xs text-ink-muted">Faculty: {teacher?.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-11 sm:pl-0">
                    <span className="rounded-md border border-line/60 bg-white px-2.5 py-1 text-xs font-medium text-ink">
                      📍 {room?.name} ({room?.type})
                    </span>
                    <span className="text-xs font-medium text-ink-muted whitespace-nowrap">
                      🕒 {time}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Institutional Weekly Routine Grid matching reference design */}
      <Panel title="Complete Weekly Routine">
        <RoutineTable
          grid={grid}
          entries={sectionEntries}
          lookup={lookup}
          title={`Section ${section.name} — Weekly Routine`}
          highlightDay={today}
          perspective="section"
        />
      </Panel>

      {/* Courses / Subjects Overview */}
      <Panel title="Semester Subjects & Instructors">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sectionCourses.map((req) => {
            const subject = lookup.subject(req.subjectId);
            const teacher = lookup.teacher(req.teacherId);

            return (
              <div key={req.id} className="rounded-xl border border-line bg-white p-3.5 shadow-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {subject?.code}
                  </span>
                  <span className="text-[11px] font-medium text-ink-muted">
                    {req.sessionsPerWeek} classes / wk
                  </span>
                </div>
                <p className="font-semibold text-ink text-sm line-clamp-1">{subject?.name}</p>
                <p className="text-xs text-ink-muted">Prof. {teacher?.name}</p>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
