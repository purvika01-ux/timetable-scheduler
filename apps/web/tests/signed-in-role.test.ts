import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { landingPath, roleFromMembership } from "../src/lib/signed-in-role.ts";

describe("roleFromMembership", () => {
  it("gives administrators and coordinators the coordinator view", () => {
    assert.deepEqual(roleFromMembership(["CA"]), { kind: "coordinator" });
    assert.deepEqual(roleFromMembership(["TC"]), { kind: "coordinator" });
  });

  it("gives the principal the principal view, not the coordinator view", () => {
    assert.deepEqual(roleFromMembership(["PR"]), { kind: "principal" });
  });

  it("uses the most capable view when a person holds several roles", () => {
    assert.deepEqual(roleFromMembership(["TE", "TC"]), { kind: "coordinator" });
    assert.deepEqual(roleFromMembership(["HOD", "PR"]), { kind: "principal" });
  });

  it("never picks a department, teacher or section for an account that is not linked to one", () => {
    assert.deepEqual(roleFromMembership(["HOD"]), { kind: "unlinked", reason: "hod" });
    assert.deepEqual(roleFromMembership(["TE"]), { kind: "unlinked", reason: "teacher" });
    assert.deepEqual(roleFromMembership(["ST"]), { kind: "unlinked", reason: "student" });
  });

  it("gives no college view without a membership or with unknown roles", () => {
    assert.deepEqual(roleFromMembership(null), { kind: "unlinked", reason: "noCollege" });
    assert.deepEqual(roleFromMembership([]), { kind: "unlinked", reason: "noCollege" });
    assert.deepEqual(roleFromMembership(["XX"]), { kind: "unlinked", reason: "noCollege" });
  });
});

describe("landingPath", () => {
  it("sends a platform administrator without a college to the platform page", () => {
    assert.equal(landingPath(["PA"], false), "/platform");
  });

  it("sends everyone in a college to their home page", () => {
    assert.equal(landingPath(["PA"], true), "/");
    assert.equal(landingPath([], true), "/");
    assert.equal(landingPath([], false), "/");
  });
});
