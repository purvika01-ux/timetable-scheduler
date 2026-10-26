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

  it("flags an entry whose course requirement does not exist", () => {
    const report = validateTimetable(STANDARD_DATASET, [entry({ requirementId: "q-gone" })], {});
    assert.equal(report.counts.reference, 1);
    assert.equal(report.valid, false);
  });

  it("enforces each teacher's daily teaching limit", () => {
    // Dr. Amandeep Singh may teach 5 periods a day; six single periods on Monday break it.
    const six = [1, 2, 3, 5, 6, 7].map((p, i) =>
      entry({ id: `m${i}`, requirementId: i < 3 ? "q-ds-3a" : "q-ds-3b", sectionId: i < 3 ? "s-3a" : "s-3b", startPeriod: p }),
    );
    const report = validateTimetable(STANDARD_DATASET, six, {});
    assert.equal(report.counts.dailyLimit, 1);
    assert.match(report.issues[0].message, /6 periods on Monday; the daily limit is 5/);
    assert.equal(issuesForEntry(report, "m5").length, 1);
    assert.equal(validateTimetable(STANDARD_DATASET, six.slice(1), {}).counts.dailyLimit, 0);
  });

  it("requires a class to last as long as its course's sessions", () => {
    const shortLab = entry({ requirementId: "q-dsl-3a", subjectId: "sub-dsl", roomId: "r-lab1", startPeriod: 5, span: 1 });
    const report = validateTimetable(STANDARD_DATASET, [shortLab], {});
    assert.equal(report.counts.requirement, 1);
    assert.match(report.issues[0].message, /lasts 1 period, but each session needs 2/);
  });

  it("requires the teacher, subject and section to match the course", () => {
    const report = validateTimetable(
      STANDARD_DATASET,
      [entry({ teacherId: "t-harpreet" }), entry({ id: "e2", subjectId: "sub-oop", day: "tue" }), entry({ id: "e3", sectionId: "s-3b", day: "wed" })],
      {},
    );
    assert.equal(report.counts.requirement, 3);
    assert.equal(report.valid, false);
  });

  it("rejects more sessions than the course needs each week", () => {
    const four = ["mon", "tue", "wed", "thu"].map((day, i) => entry({ id: `x${i}`, day: day as ScheduledEntry["day"] }));
    const report = validateTimetable(STANDARD_DATASET, four, {});
    assert.equal(report.counts.requirement, 1);
    assert.match(report.issues[0].message, /4 sessions a week, but needs 3/);
  });

  it("rejects two classes with the same id", () => {
    const report = validateTimetable(STANDARD_DATASET, [entry({}), entry({ day: "tue" })], {});
    assert.equal(report.counts.duplicate, 1);
    assert.equal(report.valid, false);
  });

  it("rejects non-integer and missing period numbers", () => {
    for (const bad of [1.5, Number.NaN]) {
      const report = validateTimetable(STANDARD_DATASET, [entry({ startPeriod: bad })], {});
      assert.equal(report.counts.grid, 1, `startPeriod ${bad}`);
      assert.equal(report.valid, false);
    }
  });

  it("reports missing weekly sessions separately from rule breaks", () => {
    const report = validateTimetable(STANDARD_DATASET, [entry({})], {});
    assert.equal(report.valid, true);
    assert.equal(report.complete, false);
    assert.deepEqual(
      report.missing.find((m) => m.requirementId === "q-ds-3a"),
      { requirementId: "q-ds-3a", missing: 2 },
    );
    const required = STANDARD_DATASET.requirements.reduce((n, r) => n + r.sessionsPerWeek, 0);
    assert.equal(report.missing.reduce((n, m) => n + m.missing, 0), required - 1);
    assert.equal(validateTimetable(STANDARD_DATASET, [], {}).complete, false);
  });
});
