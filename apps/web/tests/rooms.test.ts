import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STANDARD_DATASET } from "../src/lib/timetable/demo-data.ts";
import { findValidMoves } from "../src/lib/timetable/moves.ts";
import { eligibleRooms, roomUsableBy } from "../src/lib/timetable/rooms.ts";
import { generateTimetable } from "../src/lib/timetable/scheduler.ts";
import type { Dataset } from "../src/lib/timetable/types.ts";
import { validateTimetable } from "../src/lib/timetable/validator.ts";

// The sample's labs belong to CSE. Add an Applied Sciences section that needs a lab.
const withPhysicsLab: Dataset = {
  ...STANDARD_DATASET,
  sections: [
    ...STANDARD_DATASET.sections,
    { id: "s-ph1", name: "B.Sc. Physics 1", programme: "B.Sc. Physics", semester: 1, strength: 40, departmentId: "d-as" },
  ],
  subjects: [
    ...STANDARD_DATASET.subjects,
    { id: "sub-phl", code: "PH151", name: "Physics Lab", kind: "lab", color: "orange" },
  ],
  requirements: [
    ...STANDARD_DATASET.requirements,
    { id: "q-phl", subjectId: "sub-phl", teacherId: "t-neha", sectionId: "s-ph1", sessionsPerWeek: 1, span: 2, roomType: "lab" },
  ],
};

describe("room access", () => {
  it("lets a department use its own rooms and shared rooms only", () => {
    const lab = STANDARD_DATASET.rooms.find((r) => r.id === "r-lab1")!;
    const lecture = STANDARD_DATASET.rooms.find((r) => r.id === "r-101")!;
    assert.equal(roomUsableBy(lab, "d-cse"), true);
    assert.equal(roomUsableBy(lab, "d-as"), false);
    assert.equal(roomUsableBy(lecture, "d-as"), true);
  });

  it("offers only rooms open to the section's department", () => {
    const req = withPhysicsLab.requirements.find((r) => r.id === "q-phl")!;
    assert.deepEqual(eligibleRooms(withPhysicsLab, req), []);
  });

  it("reports a course as unplaced when every suitable room belongs to another department", () => {
    const result = generateTimetable(withPhysicsLab, withPhysicsLab.availability, { seed: 1 });
    const unplaced = result.unplaced.filter((u) => u.requirementId === "q-phl");
    assert.equal(unplaced.length, 1);
    assert.match(unplaced[0].reasons.join(" "), /belongs to another department \(Computer Science and Engineering\)/);
    assert.equal(validateTimetable(withPhysicsLab, result.entries, withPhysicsLab.availability).valid, true);
  });

  it("places the course once the lab is shared", () => {
    const shared: Dataset = {
      ...withPhysicsLab,
      rooms: withPhysicsLab.rooms.map((r) => (r.id === "r-lab2" ? { ...r, departmentId: undefined } : r)),
    };
    const result = generateTimetable(shared, shared.availability, { seed: 1 });
    assert.equal(result.unplaced.length, 0, JSON.stringify(result.unplaced));
    const report = validateTimetable(shared, result.entries, shared.availability);
    assert.equal(report.valid, true);
    assert.equal(report.complete, true);
  });

  it("flags a class placed in another department's room", () => {
    const entry = {
      id: "x", requirementId: "q-phl", subjectId: "sub-phl", teacherId: "t-neha", sectionId: "s-ph1",
      roomId: "r-lab1", day: "mon" as const, startPeriod: 5, span: 2,
    };
    const report = validateTimetable(withPhysicsLab, [entry], {});
    assert.equal(report.counts.roomAccess, 1);
    assert.match(report.issues.find((i) => i.kind === "roomAccess")!.message, /Programming Lab 1 belongs to Computer Science and Engineering/);
  });

  it("never suggests a move into another department's room", () => {
    const shared: Dataset = {
      ...withPhysicsLab,
      rooms: withPhysicsLab.rooms.map((r) => (r.id === "r-lab2" ? { ...r, departmentId: undefined } : r)),
    };
    const { entries } = generateTimetable(shared, shared.availability, { seed: 1 });
    const physics = entries.find((e) => e.requirementId === "q-phl")!;
    const targets = findValidMoves(shared, entries, shared.availability, physics);
    assert.ok(targets.length > 0);
    assert.ok(targets.every((t) => t.roomId === "r-lab2"));
  });
});
