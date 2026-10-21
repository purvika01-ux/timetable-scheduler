import type { DayId, ScheduledEntry, SlotKey, TimeGrid } from "./types.ts";

export const DAY_ORDER: DayId[] = ["mon", "tue", "wed", "thu", "fri", "sat"];

export const PERIOD_MINUTES = 50;

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

/** "13:50" -> "1:50 PM" (12-hour format is the proposed default, U2). */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatRange(range: { start: string; end: string }): string {
  return `${formatTime(range.start)} – ${formatTime(range.end)}`;
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function periodLabel(start: number, span: number): string {
  return span > 1 ? `Periods ${start}–${start + span - 1}` : `Period ${start}`;
}

export function overlaps(a: { startPeriod: number; span: number }, b: { startPeriod: number; span: number }) {
  return a.startPeriod < b.startPeriod + b.span && b.startPeriod < a.startPeriod + a.span;
}
