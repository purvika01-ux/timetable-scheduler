import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseStoredAvailability, parseStoredTimetable } from "../src/lib/storage.ts";
import { STANDARD_DATASET } from "../src/lib/timetable/demo-data.ts";
import { dayAgenda, nextClass, weeklyLoad } from "../src/lib/timetable/queries.ts";
import type { ScheduledEntry } from "../src/lib/timetable/types.ts";

const T = "t-amandeep";

describe("parseStoredAvailability", () => {
  it("returns nothing (and no problem) when nothing is stored", () => {
    assert.deepEqual(parseStoredAvailability(null, STANDARD_DATASET, T), { value: null });
  });

  it("round-trips valid data and removes duplicates", () => {
    const raw = JSON.stringify({ version: 1, teacherId: T, unavailable: ["mon-1", "mon-1", "sat-4"], savedAt: "2026-10-21T10:00:00Z" });
    const { value, problem } = parseStoredAvailability(raw, STANDARD_DATASET, T);
    assert.equal(problem, undefined);
    assert.deepEqual(value?.unavailable, ["mon-1", "sat-4"]);
  });

  for (const [name, raw] of [
    ["corrupt JSON", "{not json"],
    ["old version", JSON.stringify({ version: 0, teacherId: T, unavailable: [] })],
    ["slot outside the half-day Saturday", JSON.stringify({ version: 1, teacherId: T, unavailable: ["sat-6"] })],
    ["unknown day", JSON.stringify({ version: 1, teacherId: T, unavailable: ["sun-1"] })],
    ["another teacher", JSON.stringify({ version: 1, teacherId: "t-x", unavailable: [] })],
  ] as const) {
    it(`rejects ${name} safely`, () => {
      const result = parseStoredAvailability(raw, STANDARD_DATASET, T);
      assert.equal(result.value, null);
      assert.ok(result.problem);
    });
  }
});

describe("parseStoredTimetable", () => {
  const entry: ScheduledEntry = {
    id: "q-ds-3a#1", requirementId: "q-ds-3a", subjectId: "sub-ds", teacherId: T,
    sectionId: "s-3a", roomId: "r-101", day: "mon", startPeriod: 2, span: 1,
  };

  it("accepts a valid timetable", () => {
    const raw = JSON.stringify({ version: 1, datasetId: "standard", source: "edited", seed: 4, updatedAt: "x", entries: [entry] });
    assert.equal(parseStoredTimetable(raw, STANDARD_DATASET).value?.entries.length, 1);
  });

  it("rejects entries that point at data that no longer exists", () => {
    const raw = JSON.stringify({ version: 1, datasetId: "standard", entries: [{ ...entry, roomId: "r-gone" }] });
    const result = parseStoredTimetable(raw, STANDARD_DATASET);
    assert.equal(result.value, null);
    assert.ok(result.problem);
  });
});

describe("teacher queries", () => {
  const grid = STANDARD_DATASET.grid;
  const entries: ScheduledEntry[] = [
    { id: "a", requirementId: "q-ds-3a", subjectId: "sub-ds", teacherId: T, sectionId: "s-3a", roomId: "r-101", day: "wed", startPeriod: 2, span: 1 },
    { id: "b", requirementId: "q-dsl-3a", subjectId: "sub-dsl", teacherId: T, sectionId: "s-3a", roomId: "r-lab1", day: "wed", startPeriod: 5, span: 2 },
    { id: "c", requirementId: "q-ds-3b", subjectId: "sub-ds", teacherId: T, sectionId: "s-3b", roomId: "r-102", day: "fri", startPeriod: 1, span: 1 },
  ];

  it("builds a day agenda with classes, free periods and the lunch break", () => {
    const agenda = dayAgenda(grid, entries, "wed");
    const kinds = agenda.map((i) => (i.type === "class" ? `class:${i.entry.id}` : i.type));
    assert.deepEqual(kinds, ["free", "class:a", "free", "free", "break", "class:b", "free", "free"]);
  });

  it("finds the class in progress, then the next one, wrapping to next week", () => {
    // Wednesday 21 October 2026, 10:00 (period 2 runs 09:50–10:40)
    assert.equal(nextClass(grid, entries, new Date(2026, 9, 21, 10, 0))?.status, "in-progress");
    const later = nextClass(grid, entries, new Date(2026, 9, 21, 11, 0));
    assert.equal(later?.entry.id, "b");
    assert.equal(later?.minutesUntil, 120);
    // Saturday evening -> Wednesday's first class, 4 days ahead
    const weekend = nextClass(grid, entries, new Date(2026, 9, 24, 18, 0));
    assert.equal(weekend?.entry.id, "a");
    assert.equal(weekend?.daysAhead, 4);
  });

  it("sums weekly load in periods and classes", () => {
    assert.deepEqual(weeklyLoad(entries), { classes: 3, periods: 4, labs: 1, sections: 2, subjects: 2 });
  });
});
