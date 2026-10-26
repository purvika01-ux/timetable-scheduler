import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blankDataset } from "../src/lib/timetable/college.ts";
import { OVER_CONSTRAINED_DATASET, STANDARD_DATASET } from "../src/lib/timetable/demo-data.ts";
import { generateTimetable } from "../src/lib/timetable/scheduler.ts";
import type { ScheduledEntry } from "../src/lib/timetable/types.ts";
import {
  parseCollegeFile,
  parseWorkspace,
  reconcileTimetable,
  sampleWorkspace,
  toCollegeFile,
  type Workspace,
} from "../src/lib/workspace.ts";

const sample = sampleWorkspace(STANDARD_DATASET, new Date("2026-10-26T09:00:00Z"));
const stored = (w: unknown) => JSON.stringify(w);

describe("parseWorkspace", () => {
  it("returns nothing (and no problem) when nothing is stored", () => {
    assert.deepEqual(parseWorkspace(null), { value: null });
  });

  it("round-trips the sample college and its timetable", () => {
    const { value, problem } = parseWorkspace(stored(sample));
    assert.equal(problem, undefined);
    assert.deepEqual(value, sample);
  });

  it("round-trips a blank college with no timetable", () => {
    const blank: Workspace = { version: 1, dataset: blankDataset(), timetable: null };
    assert.deepEqual(parseWorkspace(stored(blank)).value, blank);
  });

  for (const [name, raw] of [
    ["corrupt JSON", "{not json"],
    ["an older version", stored({ ...sample, version: 0 })],
    ["a room with text for capacity", stored({ ...sample, dataset: { ...sample.dataset, rooms: [{ ...sample.dataset.rooms[0], capacity: "40" }] } })],
    ["two rooms with the same id", stored({ ...sample, dataset: { ...sample.dataset, rooms: [sample.dataset.rooms[0], sample.dataset.rooms[0]] } })],
    ["availability for an unknown teacher", stored({ ...sample, dataset: { ...sample.dataset, availability: { "t-x": ["mon-1"] } } })],
    ["an unknown day", stored({ ...sample, dataset: { ...sample.dataset, availability: { "t-neha": ["sun-1"] } } })],
  ] as const) {
    it(`rejects ${name} safely`, () => {
      const result = parseWorkspace(raw);
      assert.equal(result.value, null);
      assert.ok(result.problem);
    });
  }

  it("keeps the college but removes a stored timetable that contains a clash", () => {
    const [a, b] = sample.timetable!.entries.filter((e) => e.teacherId === "t-amandeep");
    const clashing = sample.timetable!.entries.map((e) => (e.id === b.id ? { ...e, day: a.day, startPeriod: a.startPeriod } : e));
    const result = parseWorkspace(stored({ ...sample, timetable: { ...sample.timetable, entries: clashing } }));
    assert.ok(result.value);
    assert.equal(result.value.timetable, null);
    assert.match(result.timetableProblem ?? "", /clash or damaged entries/);
  });

  it("keeps a timetable whose only problems come from later data edits", () => {
    // Lowering a teacher's daily limit is a legitimate edit; the timetable is kept and shown with the problem.
    const dataset = { ...sample.dataset, teachers: sample.dataset.teachers.map((t) => ({ ...t, maxPeriodsPerDay: 1 })) };
    const result = parseWorkspace(stored({ ...sample, dataset }));
    assert.ok(result.value?.timetable);
    assert.equal(result.timetableProblem, undefined);
  });

  it("ignores unknown fields instead of keeping them", () => {
    const result = parseWorkspace(stored({ ...sample, dataset: { ...sample.dataset, extra: "x", college: { ...sample.dataset.college, extra: 1 } } }));
    assert.ok(result.value);
    assert.equal("extra" in result.value.dataset, false);
    assert.equal("extra" in result.value.dataset.college, false);
  });
});

describe("college file", () => {
  it("exports and imports to the same college and timetable", () => {
    const file = toCollegeFile(sample, new Date("2026-10-26T10:00:00Z"));
    assert.deepEqual(parseCollegeFile(file).value, sample);
  });

  it("gives the same timetable for the same seed after a round trip", () => {
    const reopened = parseCollegeFile(toCollegeFile(sampleWorkspace(OVER_CONSTRAINED_DATASET))).value!;
    const before = generateTimetable(OVER_CONSTRAINED_DATASET, OVER_CONSTRAINED_DATASET.availability, { seed: 7 });
    const after = generateTimetable(reopened.dataset, reopened.dataset.availability, { seed: 7 });
    assert.deepEqual(after, before);
  });

  for (const [name, raw, pattern] of [
    ["not JSON", "hello", /not valid JSON/],
    ["another app's JSON", JSON.stringify({ a: 1 }), /not exported from College Timetable Optimizer/],
    ["a newer version", JSON.stringify({ format: "college-timetable-optimizer", version: 2 }), /newer version/],
    ["a damaged college", JSON.stringify({ format: "college-timetable-optimizer", version: 1, dataset: { id: 1 } }), /damaged or incomplete/],
  ] as const) {
    it(`refuses ${name} with a clear message`, () => {
      const result = parseCollegeFile(raw);
      assert.equal(result.value, null);
      assert.match(result.problem ?? "", pattern);
    });
  }

  it("refuses files over 5 MB", () => {
    assert.match(parseCollegeFile(" ".repeat(5 * 1024 * 1024 + 1)).problem ?? "", /larger than 5 MB/);
  });
});

describe("reconcileTimetable", () => {
  const entries = sample.timetable!.entries;

  it("keeps everything when nothing changed", () => {
    assert.deepEqual(reconcileTimetable(sample.dataset, entries), { entries, removed: 0 });
  });

  it("removes the classes of a deleted course", () => {
    const dataset = { ...sample.dataset, requirements: sample.dataset.requirements.filter((r) => r.id !== "q-ds-3a") };
    const result = reconcileTimetable(dataset, entries);
    assert.equal(result.removed, 3);
    assert.ok(result.entries.every((e) => e.requirementId !== "q-ds-3a"));
  });

  it("removes the classes of a course given to another teacher, so they show as missing", () => {
    const dataset = {
      ...sample.dataset,
      requirements: sample.dataset.requirements.map((r) => (r.id === "q-ds-3a" ? { ...r, teacherId: "t-harpreet" } : r)),
    };
    assert.equal(reconcileTimetable(dataset, entries).removed, 3);
  });

  it("drops extra sessions when a course needs fewer a week", () => {
    const dataset = {
      ...sample.dataset,
      requirements: sample.dataset.requirements.map((r) => (r.id === "q-ds-3a" ? { ...r, sessionsPerWeek: 1 } : r)),
    };
    const result = reconcileTimetable(dataset, entries);
    assert.equal(result.removed, 2);
    assert.equal(result.entries.filter((e: ScheduledEntry) => e.requirementId === "q-ds-3a").length, 1);
  });
});
