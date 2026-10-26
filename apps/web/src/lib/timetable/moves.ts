// Manual moves. Every candidate is checked by re-validating the whole timetable.

import { DAY_ORDER, validStarts } from "./grid.ts";
import { eligibleRooms } from "./rooms.ts";
import type { AvailabilityMap, Dataset, DayId, ScheduledEntry, ValidationIssue } from "./types.ts";
import { issuesForEntry, validateTimetable } from "./validator.ts";

export interface MoveTarget {
  day: DayId;
  startPeriod: number;
  roomId: string;
}

export function applyMove(entries: ScheduledEntry[], entryId: string, target: MoveTarget): ScheduledEntry[] {
  return entries.map((e) => (e.id === entryId ? { ...e, ...target } : e));
}

/** Validates the timetable after the move; returns the issues that involve the moved class. */
export function checkMove(
  dataset: Dataset,
  entries: ScheduledEntry[],
  availability: AvailabilityMap,
  entryId: string,
  target: MoveTarget,
): { entries: ScheduledEntry[]; issues: ValidationIssue[] } {
  const moved = applyMove(entries, entryId, target);
  const report = validateTimetable(dataset, moved, availability);
  return { entries: moved, issues: issuesForEntry(report, entryId) };
}

/** Every slot the class could move to without creating a clash (any suitable room). */
export function findValidMoves(
  dataset: Dataset,
  entries: ScheduledEntry[],
  availability: AvailabilityMap,
  entry: ScheduledEntry,
): MoveTarget[] {
  const req = dataset.requirements.find((r) => r.id === entry.requirementId);
  if (!req) return [];
  const rooms = eligibleRooms(dataset, req).sort(
    (a, b) => Number(b.id === entry.roomId) - Number(a.id === entry.roomId) || a.capacity - b.capacity,
  );
  const targets: MoveTarget[] = [];
  for (const day of DAY_ORDER) {
    for (const startPeriod of validStarts(dataset.grid, day, entry.span)) {
      if (day === entry.day && startPeriod === entry.startPeriod) continue;
      const room = rooms.find(
        (r) => checkMove(dataset, entries, availability, entry.id, { day, startPeriod, roomId: r.id }).issues.length === 0,
      );
      if (room) targets.push({ day, startPeriod, roomId: room.id });
    }
  }
  return targets;
}
