import { coveredPeriods, validStarts } from "./grid.ts";
import type { SessionRequirement, SlotKey, Teacher, TimeGrid } from "./types.ts";

export interface TeachingCapacity {
  /** Periods a week the teacher's courses need. */
  needed: number;
  /** Periods a week the teacher is available. */
  available: number;
  /** Plain-language reasons the load cannot fit; empty when it might. */
  problems: string[];
}

export function teachingCapacity(
  grid: TimeGrid,
  teacher: Teacher,
  requirements: SessionRequirement[],
  unavailable: SlotKey[],
): TeachingCapacity {
  const mine = requirements.filter((r) => r.teacherId === teacher.id);
  const off = new Set(unavailable);
  const free = (day: TimeGrid["days"][number]["id"], p: number) => !off.has(`${day}-${p}`);
  const max = teacher.maxPeriodsPerDay;

  const needed = mine.reduce((n, r) => n + r.sessionsPerWeek * r.span, 0);
  const freePerDay = grid.days.map((d) => coveredPeriods(1, d.periodCount).filter((p) => free(d.id, p)).length);
  const available = freePerDay.reduce((n, c) => n + c, 0);
  const withinDailyLimit = freePerDay.reduce((n, c) => n + Math.min(c, max), 0);

  const problems: string[] = [];
  if (needed > available) {
    problems.push(`${teacher.name} teaches ${needed} periods a week but is available for only ${available}.`);
  } else if (needed > withinDailyLimit) {
    problems.push(
      `${teacher.name} teaches ${needed} periods a week, but with a daily limit of ${max} periods the available days allow only ${withinDailyLimit}.`,
    );
  }

  // Multi-period sessions (labs) need unbroken blocks of available periods that do not cross a break.
  for (const span of [...new Set(mine.map((r) => r.span).filter((s) => s > 1))]) {
    const sessions = mine.filter((r) => r.span === span).reduce((n, r) => n + r.sessionsPerWeek, 0);
    let blocks = 0;
    for (const d of grid.days) {
      let dayBlocks = 0;
      let nextFree = 1;
      for (const start of validStarts(grid, d.id, span)) {
        if (start >= nextFree && coveredPeriods(start, span).every((p) => free(d.id, p))) {
          dayBlocks++;
          nextFree = start + span;
        }
      }
      blocks += Math.min(dayBlocks, Math.floor(max / span));
    }
    if (blocks < sessions) {
      problems.push(
        `${teacher.name} needs ${sessions} ${span}-period lab ${sessions === 1 ? "block" : "blocks"} a week, but the available periods allow only ${blocks}.`,
      );
    }
  }

  return { needed, available, problems };
}
