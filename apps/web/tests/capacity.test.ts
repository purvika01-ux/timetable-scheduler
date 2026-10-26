import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAvailability } from "../src/lib/timetable/availability.ts";
import { teachingCapacity } from "../src/lib/timetable/capacity.ts";
import { DEFAULT_DEMO_TEACHER_UNAVAILABLE, DEMO_TEACHER_ID, STANDARD_DATASET } from "../src/lib/timetable/demo-data.ts";
import { generateTimetable } from "../src/lib/timetable/scheduler.ts";
import type { DayId, SlotKey } from "../src/lib/timetable/types.ts";

const { grid, requirements } = STANDARD_DATASET;
const teacher = STANDARD_DATASET.teachers.find((t) => t.id === DEMO_TEACHER_ID)!;

/** Every slot except those on the given days. */
function onlyDays(...days: DayId[]): SlotKey[] {
  return grid.days
    .filter((d) => !days.includes(d.id))
    .flatMap((d) => Array.from({ length: d.periodCount }, (_, i) => `${d.id}-${i + 1}` as SlotKey));
}

describe("teachingCapacity", () => {
  it("accepts the sample availability", () => {
    const result = teachingCapacity(grid, teacher, requirements, DEFAULT_DEMO_TEACHER_UNAVAILABLE);
    assert.equal(result.needed, 13);
    assert.deepEqual(result.problems, []);
  });

  it("reports too few available periods", () => {
    const result = teachingCapacity(grid, teacher, requirements, onlyDays("mon"));
    assert.equal(result.available, 8);
    assert.match(result.problems[0], /teaches 13 periods a week but is available for only 8/);
  });

  it("counts the daily limit: two free days give 16 periods but only 10 can be taught", () => {
    const result = teachingCapacity(grid, teacher, requirements, onlyDays("mon", "tue"));
    assert.equal(result.available, 16);
    assert.match(result.problems[0], /daily limit of 5 periods the available days allow only 10/);
  });

  it("counts two-period lab blocks that avoid breaks", () => {
    // Free only in periods 4 and 5 each weekday: 10 periods, but lunch splits them, so no lab block fits.
    const unavailable = grid.days.flatMap((d) =>
      Array.from({ length: d.periodCount }, (_, i) => i + 1)
        .filter((p) => d.id === "sat" || (p !== 4 && p !== 5))
        .map((p) => `${d.id}-${p}` as SlotKey),
    );
    const result = teachingCapacity(grid, teacher, requirements, unavailable);
    assert.ok(result.problems.some((p) => /needs 2 2-period lab blocks a week, but the available periods allow only 0/.test(p)));
  });

  it("explains unplaced sessions with the daily-limit reason", () => {
    const availability = buildAvailability("standard", onlyDays("mon", "tue"));
    const result = generateTimetable(STANDARD_DATASET, availability, { seed: 1 });
    const mine = result.unplaced.filter((u) => u.teacherId === DEMO_TEACHER_ID);
    assert.ok(mine.length > 0);
    assert.ok(mine.every((u) => u.reasons.some((r) => r.includes("daily limit of 5 periods"))));
  });
});
