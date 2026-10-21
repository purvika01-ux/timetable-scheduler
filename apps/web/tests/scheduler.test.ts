import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAvailability } from "../src/lib/timetable/availability.ts";
import {
  DEFAULT_DEMO_TEACHER_UNAVAILABLE,
  DEMO_TEACHER_ID,
  OVER_CONSTRAINED_DATASET,
  STANDARD_DATASET,
} from "../src/lib/timetable/demo-data.ts";
import { fitsGrid } from "../src/lib/timetable/grid.ts";
import { generateTimetable } from "../src/lib/timetable/scheduler.ts";
import type { Dataset, SlotKey } from "../src/lib/timetable/types.ts";
import { validateTimetable } from "../src/lib/timetable/validator.ts";

const standardAvailability = buildAvailability("standard", DEFAULT_DEMO_TEACHER_UNAVAILABLE);

describe("generateTimetable on the standard dataset", () => {
  const result = generateTimetable(STANDARD_DATASET, standardAvailability, { seed: 1 });

  it("places every required session", () => {
    const required = STANDARD_DATASET.requirements.reduce((n, r) => n + r.sessionsPerWeek, 0);
    assert.equal(result.totalSessions, required);
    assert.equal(result.unplaced.length, 0, JSON.stringify(result.unplaced, null, 2));
    assert.equal(result.entries.length, required);
  });

  it("passes the independent validator with zero clashes", () => {
    const report = validateTimetable(STANDARD_DATASET, result.entries, standardAvailability);
    assert.deepEqual(report.issues, []);
    assert.equal(report.valid, true);
  });

  it("keeps labs as one block that never crosses lunch", () => {
    const labs = result.entries.filter((e) => e.span === 2);
    assert.ok(labs.length > 0);
    for (const lab of labs) assert.ok(fitsGrid(STANDARD_DATASET.grid, lab.day, lab.startPeriod, lab.span));
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const again = generateTimetable(STANDARD_DATASET, standardAvailability, { seed: 1 });
    assert.deepEqual(again.entries, result.entries);
    const other = generateTimetable(STANDARD_DATASET, standardAvailability, { seed: 2 });
    assert.notDeepEqual(other.entries, result.entries);
    assert.equal(validateTimetable(STANDARD_DATASET, other.entries, standardAvailability).valid, true);
  });

  it("stays clash-free across many seeds", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = generateTimetable(STANDARD_DATASET, standardAvailability, { seed });
      const report = validateTimetable(STANDARD_DATASET, r.entries, standardAvailability);
      assert.equal(report.valid, true, `seed ${seed}: ${report.issues.map((i) => i.message).join("; ")}`);
      assert.equal(r.unplaced.length, 0, `seed ${seed} left sessions unplaced`);
    }
  });
});

describe("teacher availability", () => {
  it("never schedules the demo teacher in a slot marked unavailable", () => {
    const blocked: SlotKey[] = ["mon-1", "mon-2", "mon-3", "tue-5", "tue-6", "thu-1", "fri-8"];
    const availability = buildAvailability("standard", blocked);
    const result = generateTimetable(STANDARD_DATASET, availability, { seed: 3 });
    const mine = result.entries.filter((e) => e.teacherId === DEMO_TEACHER_ID);
    for (const e of mine) {
      for (let p = e.startPeriod; p < e.startPeriod + e.span; p++) {
        assert.ok(!blocked.includes(`${e.day}-${p}`), `scheduled in blocked slot ${e.day}-${p}`);
      }
    }
    assert.equal(validateTimetable(STANDARD_DATASET, result.entries, availability).valid, true);
  });

  it("reports sessions as unplaced when the teacher is barely available", () => {
    // Demo teacher available only on Monday: 13 periods needed, at most 5 per day allowed.
    const blocked = STANDARD_DATASET.grid.days
      .filter((d) => d.id !== "mon")
      .flatMap((d) => Array.from({ length: d.periodCount }, (_, i) => `${d.id}-${i + 1}` as SlotKey));
    const availability = buildAvailability("standard", blocked);
    const result = generateTimetable(STANDARD_DATASET, availability, { seed: 1 });
    const mineUnplaced = result.unplaced.filter((u) => u.teacherId === DEMO_TEACHER_ID);
    assert.ok(mineUnplaced.length > 0);
    assert.ok(mineUnplaced.every((u) => u.reasons.length > 0));
    assert.ok(mineUnplaced.some((u) => u.reasons.some((r) => r.includes("available for only"))));
    assert.equal(validateTimetable(STANDARD_DATASET, result.entries, availability).valid, true);
  });
});

describe("over-constrained dataset", () => {
  const availability = buildAvailability("over-constrained", DEFAULT_DEMO_TEACHER_UNAVAILABLE);
  const result = generateTimetable(OVER_CONSTRAINED_DATASET, availability, { seed: 1 });
  const byReq = (id: string) => result.unplaced.filter((u) => u.requirementId === id);

  it("reports the sessions it cannot place, with reasons", () => {
    assert.equal(byReq("q-cd-7a").length, 2);
    assert.match(byReq("q-cd-7a")[0].reasons.join(" "), /seats 85 students/);
    assert.equal(byReq("q-iot-5b").length, 1);
    assert.match(byReq("q-iot-5b")[0].reasons.join(" "), /no workshop room/);
    assert.equal(byReq("q-cc-5a").length, 1);
    assert.equal(result.entries.length + result.unplaced.length, result.totalSessions);
  });

  it("still produces a clash-free timetable for everything it placed", () => {
    assert.equal(validateTimetable(OVER_CONSTRAINED_DATASET, result.entries, availability).valid, true);
  });
});

describe("tiny infeasible case", () => {
  it("reports the second class when one room and one period exist", () => {
    const tiny: Dataset = {
      ...STANDARD_DATASET,
      grid: { ...STANDARD_DATASET.grid, days: [{ id: "mon", label: "Monday", short: "Mon", periodCount: 1 }] },
      rooms: [STANDARD_DATASET.rooms[0]],
      requirements: [
        { id: "a", subjectId: "sub-ds", teacherId: "t-harpreet", sectionId: "s-3a", sessionsPerWeek: 1, span: 1, roomType: "lecture" },
        { id: "b", subjectId: "sub-oop", teacherId: "t-simran", sectionId: "s-3b", sessionsPerWeek: 1, span: 1, roomType: "lecture" },
      ],
    };
    const result = generateTimetable(tiny, {}, { seed: 1 });
    assert.equal(result.entries.length, 1);
    assert.equal(result.unplaced.length, 1);
    assert.match(result.unplaced[0].reasons.join(" "), /every suitable room taken/);
  });
});
