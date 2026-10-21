// Read-side helpers for the teacher views: today's agenda, next class, weekly load.

import { DAY_ORDER, entryTimes, minutesOf } from "./grid.ts";
import type { BreakSlot, DayId, ScheduledEntry, TimeGrid } from "./types.ts";

export type AgendaItem =
  | { type: "class"; entry: ScheduledEntry; startPeriod: number }
  | { type: "free"; startPeriod: number }
  | { type: "break"; slot: BreakSlot; startPeriod: number };

/** JavaScript's Sunday-first weekday to our DayId (Sunday has no classes). */
export function dayIdFor(date: Date): DayId | null {
  const index = date.getDay();
  return index === 0 ? null : DAY_ORDER[index - 1];
}

export function sortEntries(entries: ScheduledEntry[]): ScheduledEntry[] {
  return [...entries].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startPeriod - b.startPeriod,
  );
}

export function entriesOnDay(entries: ScheduledEntry[], day: DayId): ScheduledEntry[] {
  return sortEntries(entries.filter((e) => e.day === day));
}

/** Periods, breaks and free slots of one day for one teacher, in time order. */
export function dayAgenda(grid: TimeGrid, entries: ScheduledEntry[], day: DayId): AgendaItem[] {
  const count = grid.days.find((d) => d.id === day)?.periodCount ?? 0;
  const items: AgendaItem[] = [];
  const todays = entriesOnDay(entries, day);
  let p = 1;
  while (p <= count) {
    const entry = todays.find((e) => e.startPeriod === p);
    if (entry) {
      items.push({ type: "class", entry, startPeriod: p });
      p += entry.span;
    } else {
      items.push({ type: "free", startPeriod: p });
      p += 1;
    }
    const brk = grid.breaks.find((b) => b.afterPeriod === p - 1 && p <= count);
    if (brk) items.push({ type: "break", slot: brk, startPeriod: p - 0.5 });
  }
  return items;
}

export interface NextClass {
  entry: ScheduledEntry;
  daysAhead: number;
  status: "in-progress" | "upcoming";
  minutesUntil: number;
}

/** The class in progress now, or the next one this week (wrapping to next week). */
export function nextClass(grid: TimeGrid, entries: ScheduledEntry[], now: Date): NextClass | null {
  if (entries.length === 0) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = now.getDay(); // 0 = Sunday
  for (let ahead = 0; ahead <= 7; ahead++) {
    const jsDay = (todayIndex + ahead) % 7;
    if (jsDay === 0) continue;
    const day = DAY_ORDER[jsDay - 1];
    for (const entry of entriesOnDay(entries, day)) {
      const t = entryTimes(grid, entry);
      const start = minutesOf(t.start);
      const end = minutesOf(t.end);
      if (ahead === 0 && end <= nowMinutes) continue;
      if (ahead === 0 && start <= nowMinutes) {
        return { entry, daysAhead: 0, status: "in-progress", minutesUntil: 0 };
      }
      return {
        entry,
        daysAhead: ahead,
        status: "upcoming",
        minutesUntil: ahead * 24 * 60 + start - nowMinutes,
      };
    }
  }
  return null;
}

/** Remaining classes from now onwards for the rest of this week (Mon–Sat). */
export function upcomingThisWeek(grid: TimeGrid, entries: ScheduledEntry[], now: Date): ScheduledEntry[] {
  const today = dayIdFor(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIdx = today ? DAY_ORDER.indexOf(today) : -1;
  return sortEntries(entries).filter((e) => {
    const idx = DAY_ORDER.indexOf(e.day);
    if (today === null) return false; // Sunday: the week is over
    if (idx > todayIdx) return true;
    return idx === todayIdx && minutesOf(entryTimes(grid, e).start) > nowMinutes;
  });
}

export function weeklyLoad(entries: ScheduledEntry[]) {
  const periods = entries.reduce((sum, e) => sum + e.span, 0);
  const labs = entries.filter((e) => e.span > 1).length;
  const sections = new Set(entries.map((e) => e.sectionId)).size;
  const subjects = new Set(entries.map((e) => e.subjectId)).size;
  return { classes: entries.length, periods, labs, sections, subjects };
}

export function freePeriods(grid: TimeGrid, entries: ScheduledEntry[], day: DayId): number[] {
  return dayAgenda(grid, entries, day)
    .filter((i): i is Extract<AgendaItem, { type: "free" }> => i.type === "free")
    .map((i) => i.startPeriod);
}
