import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAvailability } from "../src/lib/timetable/availability.ts";
import { DEFAULT_DEMO_TEACHER_UNAVAILABLE, DEMO_TEACHER_ID, STANDARD_DATASET } from "../src/lib/timetable/demo-data.ts";
import { checkMove, findValidMoves } from "../src/lib/timetable/moves.ts";
import { generateTimetable } from "../src/lib/timetable/scheduler.ts";
import { validateTimetable } from "../src/lib/timetable/validator.ts";

const availability = buildAvailability("standard", DEFAULT_DEMO_TEACHER_UNAVAILABLE);
const { entries } = generateTimetable(STANDARD_DATASET, availability, { seed: 1 });
const mine = entries.filter((e) => e.teacherId === DEMO_TEACHER_ID);

describe("manual moves", () => {
  it("rejects a move onto the teacher's own other class", () => {
    const [a, b] = mine.filter((e) => e.span === 1);
    const { issues } = checkMove(STANDARD_DATASET, entries, availability, a.id, {
      day: b.day,
      startPeriod: b.startPeriod,
      roomId: a.roomId,
    });
    assert.ok(issues.some((i) => i.kind === "teacher"));
  });

  it("rejects a move into a slot the teacher marked unavailable", () => {
    const a = mine.find((e) => e.span === 1)!;
    const { issues } = checkMove(STANDARD_DATASET, entries, availability, a.id, { day: "wed", startPeriod: 8, roomId: a.roomId });
    assert.ok(issues.some((i) => i.kind === "availability"));
  });

  it("rejects a lab moved across the lunch break", () => {
    const lab = mine.find((e) => e.span === 2)!;
    const { issues } = checkMove(STANDARD_DATASET, entries, availability, lab.id, { day: "mon", startPeriod: 4, roomId: lab.roomId });
    assert.ok(issues.some((i) => i.kind === "grid"));
  });

  it("never lets suggested moves push a teacher past the daily limit", () => {
    // Before the validator checked daily limits, three suggested moves gave this teacher 6 periods on Monday.
    const limit = STANDARD_DATASET.teachers.find((t) => t.id === DEMO_TEACHER_ID)!.maxPeriodsPerDay;
    const mondayLoad = (es: typeof entries) =>
      es.filter((e) => e.teacherId === DEMO_TEACHER_ID && e.day === "mon").reduce((n, e) => n + e.span, 0);
    let current = entries;
    for (const e of mine.filter((x) => x.day !== "mon")) {
      const target = findValidMoves(STANDARD_DATASET, current, availability, current.find((x) => x.id === e.id)!).find(
        (t) => t.day === "mon",
      );
      if (target) current = checkMove(STANDARD_DATASET, current, availability, e.id, target).entries;
    }
    assert.ok(mondayLoad(current) > mondayLoad(entries), "some classes moved to Monday");
    assert.ok(mondayLoad(current) <= limit, `Monday load ${mondayLoad(current)} exceeds ${limit}`);
    assert.equal(validateTimetable(STANDARD_DATASET, current, availability).valid, true);
  });

  it("rejects a move that breaks the daily limit, with the reason", () => {
    // Only this teacher's classes, with Monday filled up to the limit (periods 1 to 5).
    const singles = mine.filter((e) => e.span === 1);
    const limit = STANDARD_DATASET.teachers.find((t) => t.id === DEMO_TEACHER_ID)!.maxPeriodsPerDay;
    const filled = mine.map((e) => {
      const i = singles.indexOf(e);
      return i >= 0 && i < limit ? { ...e, day: "mon" as const, startPeriod: i + 1 } : e;
    });
    const sixth = singles[limit];
    const { issues } = checkMove(STANDARD_DATASET, filled, {}, sixth.id, { day: "mon", startPeriod: 7, roomId: sixth.roomId });
    const daily = issues.find((i) => i.kind === "dailyLimit");
    assert.ok(daily, JSON.stringify(issues));
    assert.match(daily.message, /6 periods on Monday; the daily limit is 5/);
  });

  it("offers only moves that keep the whole timetable clash-free", () => {
    const lab = mine.find((e) => e.span === 2)!;
    const targets = findValidMoves(STANDARD_DATASET, entries, availability, lab);
    assert.ok(targets.length > 0);
    for (const t of targets.slice(0, 10)) {
      const { entries: moved } = checkMove(STANDARD_DATASET, entries, availability, lab.id, t);
      assert.equal(validateTimetable(STANDARD_DATASET, moved, availability).valid, true);
    }
  });
});
