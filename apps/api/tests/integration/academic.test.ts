import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Types } from "mongoose";

import { hashPassword } from "../../src/auth/passwords.ts";
import { runInTenant } from "../../src/db/tenant.ts";
import { startApi, type RunningApi } from "../../src/lifecycle.ts";
import { call, silentLogger, testConfig } from "../helpers/api.ts";
import { startTestMongo, type TestMongo } from "../helpers/mongod.ts";

let mongo: TestMongo;
let api: RunningApi;
let base: string;

before(async () => {
  mongo = await startTestMongo();
  api = await startApi({
    config: testConfig({ MONGODB_URI: mongo.uri }),
    logger: silentLogger,
    version: "test",
  });
  await api.databaseReady;
  base = `${api.url}/api/v1`;
});

after(async () => {
  await api?.close();
  await mongo?.stop();
});

const jsonPost = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const jsonPatch = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "PATCH",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const jsonDelete = (headers: Record<string, string> = {}): RequestInit => ({
  method: "DELETE",
  headers,
});

const authHeaders = (token: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${token}`,
  ...extra,
});

describe("Academic Data Management Module", () => {
  let collegeAId: Types.ObjectId;
  let collegeBId: Types.ObjectId;

  let tcToken: string;
  let caToken: string;
  let teToken: string;
  let stToken: string;
  let prToken: string;
  let hodToken: string;
  let otherCollegeTcToken: string;

  before(async () => {
    const passwordHash = await hashPassword("StrongAcademicPass123!");

    // Create College A
    const [colA] = await api.models.College.create([
      {
        code: "GNE-LDH",
        name: { en: "Guru Nanak Dev Engineering College" },
        status: "active",
      },
    ]);
    collegeAId = colA!._id;

    // Create College B
    const [colB] = await api.models.College.create([
      {
        code: "TIET-PTA",
        name: { en: "Thapar Institute of Engineering and Technology" },
        status: "active",
      },
    ]);
    collegeBId = colB!._id;

    // Create Users
    const [uTc, uCa, uTe, uSt, uOtherTc] = await api.models.User.create([
      { name: "Harpreet Singh (TC)", emailNormalized: "harpreet.tc@gne.edu", passwordHash, status: "active" },
      { name: "Dr. Sehajpal (CA)", emailNormalized: "principal@gne.edu", passwordHash, status: "active" },
      { name: "Prof. Aman (TE)", emailNormalized: "aman.te@gne.edu", passwordHash, status: "active" },
      { name: "Simran (ST)", emailNormalized: "simran.st@gne.edu", passwordHash, status: "active" },
      { name: "Other College TC", emailNormalized: "coord@thapar.edu", passwordHash, status: "active" },
    ]);
    const [uPr, uHod] = await api.models.User.create([
      { name: "Principal (PR)", emailNormalized: "pr@gne.edu", passwordHash, status: "active" },
      { name: "Head of CSE (HOD)", emailNormalized: "hod@gne.edu", passwordHash, status: "active" },
    ]);

    // Create Memberships for College A
    await runInTenant(collegeAId, async () => {
      await api.models.Membership.create([
        { collegeId: collegeAId, userId: uTc!._id, roles: ["TC"], status: "active" },
        { collegeId: collegeAId, userId: uCa!._id, roles: ["CA"], status: "active" },
        { collegeId: collegeAId, userId: uTe!._id, roles: ["TE"], status: "active" },
        { collegeId: collegeAId, userId: uSt!._id, roles: ["ST"], status: "active" },
        { collegeId: collegeAId, userId: uPr!._id, roles: ["PR"], status: "active" },
        { collegeId: collegeAId, userId: uHod!._id, roles: ["HOD"], status: "active" },
      ]);
    });

    // Create Membership for College B
    await runInTenant(collegeBId, async () => {
      await api.models.Membership.create([
        { collegeId: collegeBId, userId: uOtherTc!._id, roles: ["TC"], status: "active" },
      ]);
    });

    // Log in all users to get tokens
    const login = async (email: string) => {
      const res = await call<{ data: { accessToken: string } }>(
        `${base}/auth/login`,
        jsonPost({ identifier: email, password: "StrongAcademicPass123!" }),
      );
      assert.equal(res.status, 200);
      return res.body.data.accessToken;
    };

    tcToken = await login("harpreet.tc@gne.edu");
    caToken = await login("principal@gne.edu");
    teToken = await login("aman.te@gne.edu");
    stToken = await login("simran.st@gne.edu");
    prToken = await login("pr@gne.edu");
    hodToken = await login("hod@gne.edu");
    otherCollegeTcToken = await login("coord@thapar.edu");
  });

  it("seeds consistent demo dataset when requested by TC", async () => {
    const res = await call<{
      data: {
        departments: Array<{ id: string; code: string; name: string }>;
        teachers: Array<{ id: string; name: string }>;
        subjects: Array<{ id: string; code: string }>;
        sections: Array<{ id: string; name: string }>;
        rooms: Array<{ id: string; name: string }>;
        requirements: Array<{ id: string; sessionsPerWeek: number }>;
        availability: Record<string, string[]>;
      };
    }>(`${base}/colleges/${collegeAId}/academic/seed`, jsonPost({}, authHeaders(tcToken)));

    assert.equal(res.status, 201);
    const data = res.body.data;
    assert.ok(data.departments.length >= 3, "seeded at least 3 departments");
    assert.ok(data.teachers.length >= 5, "seeded at least 5 teachers");
    assert.ok(data.subjects.length >= 5, "seeded at least 5 subjects");
    assert.ok(data.sections.length >= 2, "seeded at least 2 sections");
    assert.ok(data.rooms.length >= 4, "seeded at least 4 rooms");
    assert.ok(data.requirements.length >= 5, "seeded at least 5 requirements");
  });

  it("retrieves the full academic dataset for the college", async () => {
    const res = await call<{
      data: {
        departments: Array<{ id: string; code: string }>;
        teachers: Array<{ id: string; name: string }>;
      };
    }>(`${base}/colleges/${collegeAId}/academic`, {
      method: "GET",
      headers: authHeaders(tcToken),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.departments.some((d) => d.code === "CSE"));
  });

  describe("CRUD operations for academic entities", () => {
    let newDeptId: string;
    let newTeacherId: string;
    let newSubjectId: string;
    let newSectionId: string;
    let newRoomId: string;
    let newRequirementId: string;

    it("creates a new department", async () => {
      const res = await call<{ data: { id: string; code: string; name: string } }>(
        `${base}/colleges/${collegeAId}/academic/departments`,
        jsonPost({ code: "ECE", name: "Electronics and Communication" }, authHeaders(tcToken)),
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.data.code, "ECE");
      newDeptId = res.body.data.id;
      assert.ok(newDeptId);
    });

    it("creates a new teacher", async () => {
      const res = await call<{ data: { id: string; name: string; employeeId: string } }>(
        `${base}/colleges/${collegeAId}/academic/teachers`,
        jsonPost(
          {
            name: "Dr. Navneet Kaur",
            designation: "Associate Professor",
            departmentId: newDeptId,
            employeeId: "EMP-ECE-01",
            email: "navneet.ece@gne.edu",
            maxPeriodsPerDay: 4,
          },
          authHeaders(tcToken),
        ),
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.data.employeeId, "EMP-ECE-01");
      newTeacherId = res.body.data.id;
      assert.ok(newTeacherId);
    });

    it("creates a new subject", async () => {
      const res = await call<{ data: { id: string; code: string; kind: string } }>(
        `${base}/colleges/${collegeAId}/academic/subjects`,
        jsonPost(
          {
            code: "EC301",
            name: "Digital Signal Processing",
            kind: "theory",
            color: "emerald",
            departmentId: newDeptId,
          },
          authHeaders(tcToken),
        ),
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.data.code, "EC301");
      newSubjectId = res.body.data.id;
      assert.ok(newSubjectId);
    });

    it("creates a new section", async () => {
      const res = await call<{ data: { id: string; name: string; semester: number } }>(
        `${base}/colleges/${collegeAId}/academic/sections`,
        jsonPost(
          {
            name: "ECE-5A",
            programme: "B.Tech ECE",
            semester: 5,
            strength: 60,
            departmentId: newDeptId,
          },
          authHeaders(tcToken),
        ),
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.data.name, "ECE-5A");
      newSectionId = res.body.data.id;
      assert.ok(newSectionId);
    });

    it("creates a new room (laboratory)", async () => {
      const res = await call<{ data: { id: string; name: string; type: string } }>(
        `${base}/colleges/${collegeAId}/academic/rooms`,
        jsonPost(
          {
            name: "DSP Lab (ECE)",
            type: "lab",
            capacity: 35,
            building: "Block C",
            departmentId: newDeptId,
          },
          authHeaders(tcToken),
        ),
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.data.type, "lab");
      newRoomId = res.body.data.id;
      assert.ok(newRoomId);
    });

    it("creates a required weekly subject session", async () => {
      const res = await call<{ data: { id: string; sessionsPerWeek: number } }>(
        `${base}/colleges/${collegeAId}/academic/requirements`,
        jsonPost(
          {
            subjectId: newSubjectId,
            teacherId: newTeacherId,
            sectionId: newSectionId,
            sessionsPerWeek: 4,
            span: 1,
            roomType: "lecture",
          },
          authHeaders(tcToken),
        ),
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.data.sessionsPerWeek, 4);
      newRequirementId = res.body.data.id;
      assert.ok(newRequirementId);
    });

    it("updates entities via PATCH", async () => {
      // Update department
      const dRes = await call<{ data: { name: string } }>(
        `${base}/colleges/${collegeAId}/academic/departments/${newDeptId}`,
        jsonPatch({ name: "Electronics and Communication Engg" }, authHeaders(tcToken)),
      );
      assert.equal(dRes.status, 200);
      assert.equal(dRes.body.data.name, "Electronics and Communication Engg");

      // Update teacher
      const tRes = await call<{ data: { designation: string } }>(
        `${base}/colleges/${collegeAId}/academic/teachers/${newTeacherId}`,
        jsonPatch({ designation: "Professor & Head" }, authHeaders(tcToken)),
      );
      assert.equal(tRes.status, 200);
      assert.equal(tRes.body.data.designation, "Professor & Head");

      // Update subject
      const sRes = await call<{ data: { color: string } }>(
        `${base}/colleges/${collegeAId}/academic/subjects/${newSubjectId}`,
        jsonPatch({ color: "violet" }, authHeaders(tcToken)),
      );
      assert.equal(sRes.status, 200);
      assert.equal(sRes.body.data.color, "violet");

      // Update section
      const secRes = await call<{ data: { strength: number } }>(
        `${base}/colleges/${collegeAId}/academic/sections/${newSectionId}`,
        jsonPatch({ strength: 65 }, authHeaders(tcToken)),
      );
      assert.equal(secRes.status, 200);
      assert.equal(secRes.body.data.strength, 65);

      // Update room
      const rRes = await call<{ data: { capacity: number } }>(
        `${base}/colleges/${collegeAId}/academic/rooms/${newRoomId}`,
        jsonPatch({ capacity: 40 }, authHeaders(tcToken)),
      );
      assert.equal(rRes.status, 200);
      assert.equal(rRes.body.data.capacity, 40);

      // Update requirement
      const reqRes = await call<{ data: { sessionsPerWeek: number } }>(
        `${base}/colleges/${collegeAId}/academic/requirements/${newRequirementId}`,
        jsonPatch({ sessionsPerWeek: 5 }, authHeaders(tcToken)),
      );
      assert.equal(reqRes.status, 200);
      assert.equal(reqRes.body.data.sessionsPerWeek, 5);
    });

    it("manages teacher unavailable slots", async () => {
      const res = await call<{ data: { teacherId: string; slots: string[] } }>(
        `${base}/colleges/${collegeAId}/academic/availability/${newTeacherId}`,
        jsonPost({ slots: ["mon-1", "wed-4", "fri-2"] }, authHeaders(tcToken)),
      );

      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data.slots, ["mon-1", "wed-4", "fri-2"]);

      // Read back availability
      const getRes = await call<{ data: Record<string, string[]> }>(
        `${base}/colleges/${collegeAId}/academic/availability`,
        { method: "GET", headers: authHeaders(tcToken) },
      );
      assert.equal(getRes.status, 200);
      assert.deepEqual(getRes.body.data[newTeacherId], ["mon-1", "wed-4", "fri-2"]);
    });

    it("prevents deleting department or teacher when references exist (409 conflict)", async () => {
      // Trying to delete department that has teacher/section
      const dDel = await call<{ error: { code: string; message: string } }>(
        `${base}/colleges/${collegeAId}/academic/departments/${newDeptId}`,
        jsonDelete(authHeaders(tcToken)),
      );
      assert.equal(dDel.status, 409);
      assert.equal(dDel.body.error.code, "state_conflict");

      // Trying to delete teacher that has active requirement
      const tDel = await call<{ error: { code: string } }>(
        `${base}/colleges/${collegeAId}/academic/teachers/${newTeacherId}`,
        jsonDelete(authHeaders(tcToken)),
      );
      assert.equal(tDel.status, 409);
      assert.equal(tDel.body.error.code, "state_conflict");
    });

    it("successfully deletes entities in valid dependency order", async () => {
      // 1. Delete requirement
      const reqDel = await call(
        `${base}/colleges/${collegeAId}/academic/requirements/${newRequirementId}`,
        jsonDelete(authHeaders(tcToken)),
      );
      assert.equal(reqDel.status, 204);

      // 2. Delete teacher
      const tDel = await call(
        `${base}/colleges/${collegeAId}/academic/teachers/${newTeacherId}`,
        jsonDelete(authHeaders(tcToken)),
      );
      assert.equal(tDel.status, 204);

      // 3. Delete subject
      const sDel = await call(
        `${base}/colleges/${collegeAId}/academic/subjects/${newSubjectId}`,
        jsonDelete(authHeaders(tcToken)),
      );
      assert.equal(sDel.status, 204);

      // 4. Delete section
      const secDel = await call(
        `${base}/colleges/${collegeAId}/academic/sections/${newSectionId}`,
        jsonDelete(authHeaders(tcToken)),
      );
      assert.equal(secDel.status, 204);

      // 5. Delete room
      const rDel = await call(
        `${base}/colleges/${collegeAId}/academic/rooms/${newRoomId}`,
        jsonDelete(authHeaders(tcToken)),
      );
      assert.equal(rDel.status, 204);

      // 6. Delete department (now has 0 dependents)
      const dDel = await call(
        `${base}/colleges/${collegeAId}/academic/departments/${newDeptId}`,
        jsonDelete(authHeaders(tcToken)),
      );
      assert.equal(dDel.status, 204);
    });
  });

  describe("Multi-Tenant Isolation", () => {
    it("denies member of College B from reading College A academic records", async () => {
      const res = await call(
        `${base}/colleges/${collegeAId}/academic`,
        { method: "GET", headers: authHeaders(otherCollegeTcToken) },
      );
      // Not a member of College A -> requireMember returns 404
      assert.equal(res.status, 404);
    });

    it("denies member of College B from mutating College A academic records", async () => {
      const res = await call(
        `${base}/colleges/${collegeAId}/academic/departments`,
        jsonPost({ code: "ATTACK", name: "Malicious Department" }, authHeaders(otherCollegeTcToken)),
      );
      assert.equal(res.status, 404);
    });
  });

  describe("Role-Based Authorization", () => {
    it("allows CA to manage academic data", async () => {
      const res = await call<{ data: { id: string } }>(
        `${base}/colleges/${collegeAId}/academic/departments`,
        jsonPost({ code: "MATH", name: "Department of Mathematics" }, authHeaders(caToken)),
      );
      assert.equal(res.status, 201);
      const mathId = res.body.data.id;

      // Clean up
      const del = await call(
        `${base}/colleges/${collegeAId}/academic/departments/${mathId}`,
        jsonDelete(authHeaders(caToken)),
      );
      assert.equal(del.status, 204);
    });

    it("shows TE (Teacher) the timetable data without contact details, and refuses availability edits", async () => {
      const viewRes = await call<{ data: { teachers: Array<{ email?: string; employeeId: string }>; availability: object } }>(
        `${base}/colleges/${collegeAId}/academic`,
        { method: "GET", headers: authHeaders(teToken) },
      );
      assert.equal(viewRes.status, 200);
      assert.ok(viewRes.body.data.teachers.length > 0);
      for (const t of viewRes.body.data.teachers) {
        assert.equal(t.email, undefined);
        assert.equal(t.employeeId, "");
      }
      assert.deepEqual(viewRes.body.data.availability, {});

      const listRes = await call(`${base}/colleges/${collegeAId}/academic/teachers`, { headers: authHeaders(teToken) });
      assert.equal(listRes.status, 403);

      const teacherId = (
        await call<{ data: Array<{ id: string }> }>(`${base}/colleges/${collegeAId}/academic/teachers`, { headers: authHeaders(tcToken) })
      ).body.data[0]!.id;
      const availRes = await call(
        `${base}/colleges/${collegeAId}/academic/availability/${teacherId}`,
        jsonPost({ slots: ["tue-2"] }, authHeaders(teToken)),
      );
      assert.equal(availRes.status, 403);
    });

    it("lets PR and HOD view academic data but not change it or the timetable", async () => {
      for (const token of [prToken, hodToken]) {
        const view = await call<{ data: { teachers: Array<{ employeeId: string }> } }>(`${base}/colleges/${collegeAId}/academic`, {
          headers: authHeaders(token),
        });
        assert.equal(view.status, 200);
        assert.ok(view.body.data.teachers.some((t) => t.employeeId !== ""), "staff who review data see full records");

        const create = await call(
          `${base}/colleges/${collegeAId}/academic/departments`,
          jsonPost({ code: "PRHOD", name: "Should not exist" }, authHeaders(token)),
        );
        assert.equal(create.status, 403);

        const generate = await call(`${base}/colleges/${collegeAId}/academic/timetable/generate`, jsonPost({ seed: 1 }, authHeaders(token)));
        assert.equal(generate.status, 403);

        const clear = await call(`${base}/colleges/${collegeAId}/academic/timetable`, jsonDelete(authHeaders(token)));
        assert.equal(clear.status, 403);

        const avail = await call(
          `${base}/colleges/${collegeAId}/academic/availability/000000000000000000000000`,
          jsonPost({ slots: [] }, authHeaders(token)),
        );
        assert.equal(avail.status, 403);
      }
    });

    it("refuses availability for a teacher that does not exist", async () => {
      for (const teacherId of ["teacher-123", "000000000000000000000000"]) {
        const res = await call<{ error: { code: string } }>(
          `${base}/colleges/${collegeAId}/academic/availability/${teacherId}`,
          jsonPost({ slots: ["tue-2"] }, authHeaders(tcToken)),
        );
        assert.equal(res.status, 404);
        assert.equal(res.body.error.code, "not_found");
      }
    });

    it("forbids TE (Teacher) from creating departments or sections", async () => {
      const res = await call<{ error: { code: string } }>(
        `${base}/colleges/${collegeAId}/academic/departments`,
        jsonPost({ code: "CIVIL", name: "Civil Engineering" }, authHeaders(teToken)),
      );
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "forbidden");
    });

    it("allows ST (Student) to view academic data but forbids modifications", async () => {
      const viewRes = await call(
        `${base}/colleges/${collegeAId}/academic`,
        { method: "GET", headers: authHeaders(stToken) },
      );
      assert.equal(viewRes.status, 200);

      const modRes = await call<{ error: { code: string } }>(
        `${base}/colleges/${collegeAId}/academic/availability/teacher-123`,
        jsonPost({ slots: ["mon-1"] }, authHeaders(stToken)),
      );
      assert.equal(modRes.status, 403);
      assert.equal(modRes.body.error.code, "forbidden");
    });
  });
});
