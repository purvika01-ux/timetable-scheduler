import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blankDataset, checkDataset, defaultGrid, fieldErrors, usedBy } from "../src/lib/timetable/college.ts";
import { OVER_CONSTRAINED_DATASET, STANDARD_DATASET } from "../src/lib/timetable/demo-data.ts";
import { precheck } from "../src/lib/timetable/precheck.ts";
import { roomUseReport, teacherLoadReport } from "../src/lib/timetable/reports.ts";
import { generateTimetable } from "../src/lib/timetable/scheduler.ts";
import type { Dataset } from "../src/lib/timetable/types.ts";

describe("checkDataset", () => {
  it("finds no problems in the sample college", () => {
    assert.deepEqual(checkDataset(STANDARD_DATASET), []);
  });

  it("asks for the college name and semester on a blank college", () => {
    const problems = checkDataset(blankDataset());
    assert.deepEqual(problems.map((p) => p.field), ["name", "semesterLabel"]);
  });

  it("reports form errors per record and field", () => {
    const d: Dataset = {
      ...STANDARD_DATASET,
      rooms: [...STANDARD_DATASET.rooms, { id: "r-x", name: "room 101", type: "lecture", capacity: 0, building: "", departmentId: "d-gone" }],
    };
    assert.deepEqual(fieldErrors(checkDataset(d), "r-x"), {
      name: "Another room is also called room 101.",
      capacity: "Seats must be a whole number from 1 to 1000.",
      departmentId: "Choose an existing department, or make the room shared.",
    });
  });

  it("checks the time grid", () => {
    const grid = defaultGrid();
    const bad = {
      ...grid,
      periods: grid.periods.map((p) => (p.number === 3 ? { ...p, start: "10:30" } : p)),
      breaks: [{ ...grid.breaks[0], afterPeriod: 8 }],
      days: [...grid.days, grid.days[0]],
    };
    const messages = checkDataset({ ...STANDARD_DATASET, grid: bad }).map((p) => p.message);
    assert.ok(messages.includes("Period 3 starts before period 2 ends."));
    assert.ok(messages.includes("A break must come after one of periods 1 to 7."));
    assert.ok(messages.includes("Monday is listed twice."));
  });

  it("refuses a course longer than any unbroken run of periods", () => {
    const d: Dataset = {
      ...STANDARD_DATASET,
      requirements: [{ ...STANDARD_DATASET.requirements[2], id: "q-long", span: 4, subjectId: "sub-javal" }],
    };
    assert.deepEqual(fieldErrors(checkDataset(d), "q-long"), {});
    const longer = { ...d, requirements: [{ ...d.requirements[0], span: 5 }] };
    assert.match(fieldErrors(checkDataset(longer), "q-long").span, /1 to 4 periods/);
  });

  it("refuses the same subject, section and teacher twice", () => {
    const copy = { ...STANDARD_DATASET.requirements[0], id: "q-copy" };
    const errors = fieldErrors(checkDataset({ ...STANDARD_DATASET, requirements: [...STANDARD_DATASET.requirements, copy] }), "q-copy");
    assert.match(errors.subjectId, /already have a course/);
  });

  it("lists what still uses a record before it can be deleted", () => {
    assert.deepEqual(usedBy(STANDARD_DATASET, "teachers", "t-manjit"), ["course HU301 for CSE 3A", "course HU301 for CSE 3B"]);
    assert.ok(usedBy(STANDARD_DATASET, "departments", "d-hu").includes("teacher Prof. Manjit Dhillon"));
    assert.deepEqual(usedBy(STANDARD_DATASET, "rooms", "r-101"), []);
  });
});

describe("precheck", () => {
  it("passes the sample college", () => {
    assert.deepEqual(precheck(STANDARD_DATASET).filter((i) => i.severity === "blocking"), []);
  });

  it("explains every reason the stress-test college cannot fit", () => {
    const messages = precheck(OVER_CONSTRAINED_DATASET).filter((i) => i.severity === "blocking").map((i) => i.message);
    assert.ok(messages.some((m) => /CS703 for CSE 7A \(merged\): no lecture room seats 85 students/.test(m)));
    assert.ok(messages.some((m) => /CS751 for CSE 5B: the college has no workshop room/.test(m)));
    assert.ok(messages.some((m) => /Prof. Kuldeep Arora teaches 3 periods a week but is available for only 2/.test(m)));
  });

  it("asks for courses before generating a blank college", () => {
    const d = { ...blankDataset(), college: { name: "Test College", shortName: "TC", semesterLabel: "Odd 2026" } };
    assert.match(precheck(d)[0].message, /Add at least one course/);
  });

  it("stops at data problems before checking capacity", () => {
    assert.ok(precheck(blankDataset()).every((i) => i.area === "college"));
  });
});

describe("reports", () => {
  const { entries } = generateTimetable(STANDARD_DATASET, STANDARD_DATASET.availability, { seed: 1 });

  it("reports each teacher's load against their needs and daily limit", () => {
    const rows = teacherLoadReport(STANDARD_DATASET, entries);
    assert.equal(rows.length, STANDARD_DATASET.teachers.length);
    for (const row of rows) {
      assert.equal(row.periods, row.required, row.teacherId);
      assert.ok(row.busiestDay!.periods <= row.dailyLimit);
      assert.ok(row.gaps >= 0);
    }
  });

  it("reports room use by department", () => {
    const rows = roomUseReport(STANDARD_DATASET, entries);
    const total = rows.reduce((n, r) => n + r.used, 0);
    assert.equal(total, entries.reduce((n, e) => n + e.span, 0));
    const lab = rows.find((r) => r.roomId === "r-lab1")!;
    assert.deepEqual(lab.byDepartment.map((x) => x.departmentId), lab.used > 0 ? ["d-cse"] : []);
    assert.equal(lab.available, 44);
  });
});
