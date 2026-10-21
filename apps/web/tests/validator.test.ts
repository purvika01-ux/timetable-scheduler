import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STANDARD_DATASET } from "../src/lib/timetable/demo-data.ts";
import type { ScheduledEntry } from "../src/lib/timetable/types.ts";
import { issuesForEntry, validateTimetable } from "../src/lib/timetable/validator.ts";

function entry(overrides: Partial<ScheduledEntry>): ScheduledEntry {
  return {
    id: "e1",
    requirementId: "q-ds-3a",
    subjectId: "sub-ds",
    teacherId: "t-amandeep",
    sectionId: "s-3a",
    roomId: "r-101",
    day: "mon",
    startPeriod: 2,
    span: 1,
    ...overrides,
  };
}

describe("validateTimetable", () => {
  it("accepts a clean timetable", () => {
    const report = validateTimetable(STANDARD_DATASET, [entry({})], {});
    assert.equal(report.valid, true);
  });

  it("detects a teacher clash", () => {
    const report = validateTimetable(
      STANDARD_DATASET,
      [entry({}), entry({ id: "e2", requirementId: "q-ds-3b", sectionId: "s-3b", roomId: "r-102" })],
      {},
    );
    assert.equal(report.counts.teacher, 1);
    assert.equal(report.counts.room, 0);
    assert.equal(report.counts.section, 0);
    assert.equal(report.valid, false);
  });

  it("detects a room clash", () => {
    const report = validateTimetable(
      STANDARD_DATASET,
      [entry({}), entry({ id: "e2", requirementId: "q-oop-3b", subjectId: "sub-oop", teacherId: "t-simran", sectionId: "s-3b" })],
      {},
    );
    assert.equal(report.counts.room, 1);
    assert.equal(report.counts.teacher, 0);
  });

  it("detects a section clash", () => {
    const report = validateTimetable(
      STANDARD_DATASET,
      [entry({}), entry({ id: "e2", requirementId: "q-oop-3a", subjectId: "sub-oop", teacherId: "t-simran", roomId: "r-102" })],
      {},
    );
    assert.equal(report.counts.section, 1);
  });

  it("detects overlap of a two-period lab with a later single period", () => {
    const lab = entry({ id: "lab", requirementId: "q-dsl-3a", subjectId: "sub-dsl", roomId: "r-lab1", startPeriod: 5, span: 2 });
    const theory = entry({ id: "t", requirementId: "q-ds-3b", sectionId: "s-3b", roomId: "r-102", startPeriod: 6 });
    const report = validateTimetable(STANDARD_DATASET, [lab, theory], {});
    assert.equal(report.counts.teacher, 1);
    // Adjacent, not overlapping:
    const ok = validateTimetable(STANDARD_DATASET, [lab, { ...theory, startPeriod: 7 }], {});
    assert.equal(ok.valid, true);
  });

  it("detects availability, capacity, room type, break and day-length violations", () => {
    const report = validateTimetable(
      STANDARD_DATASET,
      [
        entry({ id: "a", startPeriod: 1 }),
        entry({ id: "b", requirementId: "q-ds-3b", sectionId: "s-3a", roomId: "r-205", day: "tue" }),
        entry({ id: "c", requirementId: "q-dsl-3b", subjectId: "sub-dsl", sectionId: "s-3b", roomId: "r-102", day: "wed", startPeriod: 4, span: 2 }),
        entry({ id: "d", requirementId: "q-pc-3b", subjectId: "sub-pc", teacherId: "t-manjit", sectionId: "s-3b", day: "sat", startPeriod: 6 }),
      ],
      { "t-amandeep": ["mon-1"] },
    );
    assert.equal(report.counts.availability, 1);
    assert.equal(report.counts.capacity, 1);
    assert.equal(report.counts.roomType, 1);
    assert.equal(report.counts.grid, 2);
    assert.equal(issuesForEntry(report, "a").length, 1);
  });

  it("flags unknown references instead of crashing", () => {
    const report = validateTimetable(STANDARD_DATASET, [entry({ roomId: "r-missing" })], {});
    assert.equal(report.counts.reference, 1);
  });
});
