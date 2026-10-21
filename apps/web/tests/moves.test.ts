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
