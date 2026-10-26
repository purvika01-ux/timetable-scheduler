"use client";

import React, { useMemo } from "react";

import { formatTime } from "@/lib/timetable/grid";
import type { Lookup } from "@/lib/timetable/lookup";
import type { DayConfig, DayId, Period, Room, ScheduledEntry, Subject, Teacher, TimeGrid } from "@/lib/timetable/types";
import { cx } from "./ui";

export interface RoutineTableProps {
  grid: TimeGrid;
  entries: ScheduledEntry[];
  lookup: Lookup;
  title?: string;
  subtitle?: string;
  onSelect?: (entry: ScheduledEntry) => void;
  flaggedIds?: Set<string>;
  highlightDay?: DayId | null;
  perspective?: "section" | "teacher" | "room" | "department";
  className?: string;
}

function getTeacherShort(teacher?: Teacher): string {
  if (!teacher) return "";
  const clean = teacher.name.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+/i, "").trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return parts.map((p) => p[0]).join("").toUpperCase();
  }
  return clean.slice(0, 4).toUpperCase();
}

function getRoomShort(room?: Room): string {
  if (!room) return "";
  if (room.type === "lab") {
    const m = room.name.match(/\d+/);
    return m ? `L-${m[0]}` : room.name.split(" ")[0] ?? "Lab";
  }
  return room.name;
}

function classifyEntry(subject?: Subject, room?: Room, span = 1) {
  const name = subject?.name?.toLowerCase() ?? "";
  const code = subject?.code?.toLowerCase() ?? "";

  const isLab =
    subject?.kind === "lab" ||
    span >= 2 ||
    room?.type === "lab" ||
    name.includes("lab") ||
    code.includes("lab") ||
    name.includes("practical");

  const isTraining =
    name.includes("training") ||
    name.includes("workshop") ||
    name.includes("seminar") ||
    name.includes("elective") ||
    name.includes("aat") ||
    name.includes("eet") ||
    code.startsWith("tr") ||
    code.startsWith("mc");

  return { isLab, isTraining, isTheory: !isLab && !isTraining };
}

export function RoutineTable({
  grid,
  entries,
  lookup,
  title,
  subtitle,
  onSelect,
  flaggedIds,
  highlightDay,
  perspective = "section",
  className,
}: RoutineTableProps) {
  // Determine lunch break split
  const lunchBreak = grid.breaks.find((b) => b.label.toLowerCase().includes("lunch")) ?? grid.breaks[0];
  const breakAfter = lunchBreak ? lunchBreak.afterPeriod : 4;

  const maxPeriods = Math.max(...grid.days.map((d) => d.periodCount));
  const activePeriods = grid.periods.filter((p) => p.number <= maxPeriods);

  const morningPeriods = activePeriods.filter((p) => p.number <= breakAfter);
  const afternoonPeriods = activePeriods.filter((p) => p.number > breakAfter);

  // Derive weekly holidays from unlisted days
  const activeDayIds = useMemo(() => new Set<string>(grid.days.map((d) => String(d.id))), [grid.days]);
  const defaultSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    const allDays: { id: string; label: string }[] = [
      { id: "sun", label: "Sunday" },
      { id: "mon", label: "Monday" },
      { id: "tue", label: "Tuesday" },
      { id: "wed", label: "Wednesday" },
      { id: "thu", label: "Thursday" },
      { id: "fri", label: "Friday" },
      { id: "sat", label: "Saturday" },
    ];
    const offDays = allDays.filter((d) => !activeDayIds.has(d.id));
    if (offDays.length === 0) return "All 7 Days Teaching Schedule";
    if (offDays.length === 1) return `${offDays[0]?.label}: Weekly Holiday`;
    return `${offDays.map((d) => d.label).join(" & ")}: Weekly Holiday`;
  }, [subtitle, activeDayIds]);

  const displayTitle = useMemo(() => {
    if (!title) return undefined;
    let t = title.trim();
    if (t.toLowerCase().startsWith("weekly timetable for ")) {
      t = t.slice(21);
    }
    if (!t.toLowerCase().includes("routine")) {
      return `${t} — Weekly Routine`;
    }
    return t;
  }, [title]);

  return (
    <div className={cx("space-y-4", className)}>
      {/* Title Header matching the reference styling */}
      {displayTitle && (
        <div className="text-center py-2">
          <h2 className="text-2xl font-extrabold tracking-tight text-[#1E3A8A] sm:text-3xl font-display">
            {displayTitle}
          </h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {defaultSubtitle}
          </p>
        </div>
      )}

      {/* Routine Grid Container */}
      <div className="overflow-x-auto rounded-xl border-2 border-[#1E3A8A] bg-white shadow-md">
        <table className="w-full min-w-[900px] border-collapse text-xs sm:text-sm">
          {/* Header Rows in Institutional Deep Blue */}
          <thead>
            {/* Top Header: Session Bands */}
            <tr className="bg-[#1E3A8A] text-white">
              <th
                rowSpan={2}
                className="w-20 border-r border-b border-blue-900 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider"
              >
                Day
              </th>
              {morningPeriods.length > 0 && (
                <th
                  colSpan={morningPeriods.length}
                  className="border-r border-b border-blue-900 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider"
                >
                  Morning Session
                </th>
              )}
              {lunchBreak && (
                <th
                  rowSpan={2}
                  className="w-24 border-r border-b border-blue-900 bg-[#1D4ED8] px-2 py-3 text-center text-xs font-bold uppercase tracking-wider"
                >
                  <div>Lunch</div>
                  <div className="text-[10px] font-normal text-blue-200">
                    {formatTime(lunchBreak.start)}–{formatTime(lunchBreak.end)}
                  </div>
                </th>
              )}
              {afternoonPeriods.length > 0 && (
                <th
                  colSpan={afternoonPeriods.length}
                  className="border-b border-blue-900 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider"
                >
                  Afternoon Session
                </th>
              )}
            </tr>

            {/* Second Header: Period Time Intervals */}
            <tr className="bg-[#1E40AF] text-white">
              {morningPeriods.map((p) => (
                <th
                  key={p.number}
                  className="border-r border-b border-blue-800 px-2 py-1.5 text-center font-medium"
                >
                  <div className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">
                    P{p.number}
                  </div>
                  <div className="text-xs font-semibold tracking-tight whitespace-nowrap">
                    {formatTime(p.start)}–{formatTime(p.end)}
                  </div>
                </th>
              ))}
              {afternoonPeriods.map((p, idx) => (
                <th
                  key={p.number}
                  className={cx(
                    "border-b border-blue-800 px-2 py-1.5 text-center font-medium",
                    idx < afternoonPeriods.length - 1 && "border-r",
                  )}
                >
                  <div className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">
                    P{p.number}
                  </div>
                  <div className="text-xs font-semibold tracking-tight whitespace-nowrap">
                    {formatTime(p.start)}–{formatTime(p.end)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body: Days as Rows */}
          <tbody>
            {grid.days.map((day, dayIdx) => {
              const isToday = highlightDay === day.id;
              const isLastDay = dayIdx === grid.days.length - 1;

              // Pre-calculate which periods are occupied by earlier multi-span entries
              const dayEntries = entries.filter((e) => e.day === day.id);
              const coveredPeriods = new Set<number>();
              dayEntries.forEach((e) => {
                for (let i = 1; i < e.span; i++) {
                  coveredPeriods.add(e.startPeriod + i);
                }
              });

              const renderPeriodCell = (p: Period) => {
                if (p.number > day.periodCount) {
                  return (
                    <td
                      key={p.number}
                      className="border-b border-r border-slate-200 bg-slate-100/70 p-2 text-center text-slate-400 text-xs"
                    >
                      —
                    </td>
                  );
                }

                if (coveredPeriods.has(p.number)) {
                  // Handled by preceding colSpan
                  return null;
                }

                const here = dayEntries.filter((e) => e.startPeriod === p.number);
                if (here.length === 0) {
                  return (
                    <td
                      key={p.number}
                      className="border-b border-r border-slate-200 bg-slate-50/50 p-2 text-center text-slate-300 font-medium"
                    >
                      <span className="inline-block py-3 text-slate-400">—</span>
                    </td>
                  );
                }

                // If multiple classes (should rarely happen in conflict-free timetable, but render cleanly)
                const mainEntry = here[0]!;
                const span = Math.min(mainEntry.span, day.periodCount - p.number + 1);
                const subj = lookup.subject(mainEntry.subjectId);
                const teacher = lookup.teacher(mainEntry.teacherId);
                const room = lookup.room(mainEntry.roomId);
                const section = lookup.section(mainEntry.sectionId);

                const { isLab, isTraining } = classifyEntry(subj, room, span);
                const isFlagged = flaggedIds?.has(mainEntry.id);

                // Reference style backgrounds:
                // Lab -> pastel mint green #DCFCE7
                // Training -> pastel yellow #FEF9C3
                // Theory -> crisp white #FFFFFF
                const cellBg = isLab
                  ? "bg-[#DCFCE7] hover:bg-[#C2F5D7] border-[#86EFAC]"
                  : isTraining
                    ? "bg-[#FEF9C3] hover:bg-[#FDF399] border-[#FDE047]"
                    : "bg-white hover:bg-slate-50 border-slate-200";

                const teacherCode = getTeacherShort(teacher);
                const roomCode = getRoomShort(room);

                // Subtitle items based on perspective
                const secondaryInfo =
                  perspective === "teacher"
                    ? [subj?.code, section?.name ? `Sec ${section.name}` : null, roomCode].filter(Boolean).join(" · ")
                    : perspective === "room"
                      ? [subj?.code, teacherCode, section?.name ? `Sec ${section.name}` : null].filter(Boolean).join(" · ")
                      : [subj?.code, teacherCode, roomCode].filter(Boolean).join(" · ");

                return (
                  <td
                    key={p.number}
                    colSpan={span}
                    className={cx(
                      "border-b border-r border-slate-200 p-1.5 align-middle transition-all",
                      isFlagged && "ring-2 ring-red-500 ring-inset",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect?.(mainEntry)}
                      className={cx(
                        "w-full h-full min-h-[64px] rounded-lg p-2.5 text-center flex flex-col items-center justify-center border transition-shadow shadow-xs",
                        cellBg,
                        onSelect && "cursor-pointer hover:shadow-md",
                      )}
                    >
                      {/* Subject Name / Lab Headline */}
                      <span className="font-bold text-xs sm:text-sm text-slate-900 leading-snug">
                        {subj?.name ?? "Subject"}
                        {isLab && !subj?.name.toLowerCase().includes("lab") && (
                          <span className="ml-1 uppercase text-[11px] font-extrabold text-emerald-800">
                            LAB
                          </span>
                        )}
                      </span>

                      {/* Code · Teacher Initials · Room Code */}
                      <span className="mt-1 text-[11px] font-medium text-slate-600 leading-tight">
                        {secondaryInfo}
                      </span>
                    </button>
                  </td>
                );
              };

              return (
                <tr
                  key={day.id}
                  className={cx(
                    "transition-colors",
                    isToday ? "bg-blue-50/40" : "bg-white",
                    !isLastDay && "border-b border-slate-200",
                  )}
                >
                  {/* Day Column */}
                  <th
                    scope="row"
                    className={cx(
                      "border-r border-b border-slate-300 bg-[#EEF4FF] px-3 py-4 text-center align-middle font-black tracking-widest text-[#1E3A8A] uppercase",
                      isToday && "bg-blue-100 text-blue-950 font-black",
                    )}
                  >
                    <div>{day.short}</div>
                    {isToday && (
                      <span className="mt-0.5 inline-block rounded bg-primary px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-white">
                        Today
                      </span>
                    )}
                  </th>

                  {/* Morning Session Periods */}
                  {morningPeriods.map((p) => renderPeriodCell(p))}

                  {/* Lunch Ribbon Column */}
                  {lunchBreak && (
                    <td
                      className="border-r border-b border-blue-200 bg-[#DBEAFE]/80 px-2 py-3 text-center align-middle font-bold text-xs tracking-widest text-[#1D4ED8] uppercase select-none"
                    >
                      LUNCH
                    </td>
                  )}

                  {/* Afternoon Session Periods */}
                  {afternoonPeriods.map((p) => renderPeriodCell(p))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Routine Legend matching the uploaded image */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-xs text-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded border border-slate-300 bg-white shadow-xs" />
          <span className="font-medium">Theory</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded border border-[#86EFAC] bg-[#DCFCE7] shadow-xs" />
          <span className="font-medium">Lab (2 hrs)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded border border-[#FDE047] bg-[#FEF9C3] shadow-xs" />
          <span className="font-medium">Training Session</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded border border-blue-300 bg-[#DBEAFE] shadow-xs" />
          <span className="font-medium">Lunch Break</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded border border-slate-200 bg-slate-100 shadow-xs" />
          <span className="font-medium">No Class</span>
        </div>
      </div>
    </div>
  );
}
