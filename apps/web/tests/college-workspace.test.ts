import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collegeWorkspaceFromApi, emptyCollegeWorkspace } from "../src/lib/college-workspace.ts";
import { STANDARD_DATASET } from "../src/lib/timetable/demo-data.ts";

const ID = "65f000000000000000000001";

describe("college workspace", () => {
  it("starts empty with the college's name, holding none of the sample data", () => {
    const w = emptyCollegeWorkspace(ID, "Sutlej Valley Institute");
    assert.equal(w.timetable, null);
    assert.equal(w.dataset.id, ID);
    assert.equal(w.dataset.college.name, "Sutlej Valley Institute");
    for (const list of [w.dataset.departments, w.dataset.teachers, w.dataset.subjects, w.dataset.sections, w.dataset.rooms, w.dataset.requirements]) {
      assert.equal(list.length, 0);
    }
    assert.deepEqual(w.dataset.availability, {});
  });

  it("uses only what the API returned, and no timetable when the server has none", () => {
    const w = collegeWorkspaceFromApi(ID, "Fallback name", { departments: STANDARD_DATASET.departments.slice(0, 1) }, null);
    assert.equal(w.dataset.departments.length, 1);
    assert.equal(w.dataset.teachers.length, 0);
    assert.equal(w.dataset.college.name, "Fallback name");
    assert.equal(w.timetable, null);
  });

  it("keeps the server's saved timetable", () => {
    const w = collegeWorkspaceFromApi(ID, "X", {}, { source: "edited", seed: 4, entries: [], updatedAt: "2026-10-27T00:00:00.000Z" });
    assert.deepEqual(w.timetable, { source: "edited", seed: 4, entries: [], updatedAt: "2026-10-27T00:00:00.000Z" });
  });
});
