// Summaries for coordinators: teacher loads against their limits, and how much each room is used
// (including which departments use shared rooms).

import { coveredPeriods } from "./grid.ts";
import type { Dataset, DayId, ScheduledEntry } from "./types.ts";

export interface TeacherLoadRow {
  teacherId: string;
  /** Periods scheduled per week. */
  periods: number;
  /** Periods the teacher's courses need per week. */
  required: number;
  busiestDay: { day: DayId; periods: number } | null;
  dailyLimit: number;
  /** Empty periods between a teacher's first and last class, summed over the week. */
  gaps: number;
}

export function teacherLoadReport(d: Dataset, entries: ScheduledEntry[]): TeacherLoadRow[] {
  return d.teachers.map((t) => {
    const mine = entries.filter((e) => e.teacherId === t.id);
    let busiestDay: TeacherLoadRow["busiestDay"] = null;
    let gaps = 0;
    for (const day of d.grid.days) {
      const periods = mine.filter((e) => e.day === day.id).flatMap((e) => coveredPeriods(e.startPeriod, e.span));
      if (periods.length === 0) continue;
      if (!busiestDay || periods.length > busiestDay.periods) busiestDay = { day: day.id, periods: periods.length };
      gaps += Math.max(...periods) - Math.min(...periods) + 1 - new Set(periods).size;
    }
    return {
      teacherId: t.id,
      periods: mine.reduce((n, e) => n + e.span, 0),
      required: d.requirements.filter((r) => r.teacherId === t.id).reduce((n, r) => n + r.sessionsPerWeek * r.span, 0),
      busiestDay,
      dailyLimit: t.maxPeriodsPerDay,
      gaps,
    };
  });
}

export interface RoomUseRow {
  roomId: string;
  used: number;
  available: number;
  /** Periods used per department of the sections taught there. */
  byDepartment: { departmentId: string; periods: number }[];
}

export function roomUseReport(d: Dataset, entries: ScheduledEntry[]): RoomUseRow[] {
  const available = d.grid.days.reduce((n, day) => n + day.periodCount, 0);
  return d.rooms.map((room) => {
    const here = entries.filter((e) => e.roomId === room.id);
    const byDept = new Map<string, number>();
    for (const e of here) {
      const dept = d.sections.find((s) => s.id === e.sectionId)?.departmentId ?? "";
      byDept.set(dept, (byDept.get(dept) ?? 0) + e.span);
    }
    return {
      roomId: room.id,
      used: here.reduce((n, e) => n + e.span, 0),
      available,
      byDepartment: [...byDept].map(([departmentId, periods]) => ({ departmentId, periods })).sort((a, b) => b.periods - a.periods),
    };
  });
}
