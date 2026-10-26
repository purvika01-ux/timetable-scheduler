import type { DayId, ScheduledEntry, SlotKey, TimeGrid } from "./types.ts";

export const DAY_ORDER: DayId[] = ["mon", "tue", "wed", "thu", "fri", "sat"];

export const PERIOD_MINUTES = 50;

export const DEFAULT_TIME_GRID: TimeGrid = {
  days: [
    { id: "mon", label: "Monday", short: "Mon", periodCount: 8 },
    { id: "tue", label: "Tuesday", short: "Tue", periodCount: 8 },
    { id: "wed", label: "Wednesday", short: "Wed", periodCount: 8 },
    { id: "thu", label: "Thursday", short: "Thu", periodCount: 8 },
    { id: "fri", label: "Friday", short: "Fri", periodCount: 8 },
    { id: "sat", label: "Saturday", short: "Sat", periodCount: 4 },
  ],
  periods: [
    { number: 1, start: "09:00", end: "09:50" },
    { number: 2, start: "09:50", end: "10:40" },
    { number: 3, start: "10:40", end: "11:30" },
    { number: 4, start: "11:30", end: "12:20" },
    { number: 5, start: "13:00", end: "13:50" },
    { number: 6, start: "13:50", end: "14:40" },
    { number: 7, start: "14:40", end: "15:30" },
    { number: 8, start: "15:30", end: "16:20" },
  ],
  breaks: [{ afterPeriod: 4, start: "12:20", end: "13:00", label: "Lunch break" }],
};

export function slotKey(day: DayId, period: number): SlotKey {
  return `${day}-${period}`;
}

export function parseSlotKey(key: string): { day: DayId; period: number } | null {
  const match = /^(mon|tue|wed|thu|fri|sat)-(\d{1,2})$/.exec(key);
  if (!match) return null;
  return { day: match[1] as DayId, period: Number(match[2]) };
}

export function periodCountFor(grid: TimeGrid, day: DayId): number {
  return grid.days.find((d) => d.id === day)?.periodCount ?? 0;
}

/** Periods covered by a block starting at `start` with `span` periods. */
export function coveredPeriods(start: number, span: number): number[] {
  return Array.from({ length: span }, (_, i) => start + i);
}

/** True when a block fits inside the day and does not straddle a break. */
export function fitsGrid(grid: TimeGrid, day: DayId, start: number, span: number): boolean {
  const last = start + span - 1;
  if (start < 1 || span < 1 || last > periodCountFor(grid, day)) return false;
  return !grid.breaks.some((b) => start <= b.afterPeriod && last > b.afterPeriod);
}

/** Every valid start period for a block of `span` periods on `day`. */
export function validStarts(grid: TimeGrid, day: DayId, span: number): number[] {
  const starts: number[] = [];
  for (let p = 1; p <= periodCountFor(grid, day); p++) {
    if (fitsGrid(grid, day, p, span)) starts.push(p);
  }
  return starts;
}

export function totalTeachingPeriods(grid: TimeGrid): number {
  return grid.days.reduce((sum, d) => sum + d.periodCount, 0);
}

export function periodTimes(grid: TimeGrid, start: number, span: number) {
  const first = grid.periods.find((p) => p.number === start);
  const last = grid.periods.find((p) => p.number === start + span - 1);
  return { start: first?.start ?? "", end: last?.end ?? "" };
}

export function entryTimes(grid: TimeGrid, entry: Pick<ScheduledEntry, "startPeriod" | "span">) {
  return periodTimes(grid, entry.startPeriod, entry.span);
}

export function overlaps(a: { startPeriod: number; span: number }, b: { startPeriod: number; span: number }) {
  return a.startPeriod < b.startPeriod + b.span && b.startPeriod < a.startPeriod + a.span;
}
