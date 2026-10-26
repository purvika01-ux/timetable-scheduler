import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

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

const authHeaders = (token: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${token}`,
  ...extra,
});

describe("Core Timetable Generation and Independent Server Validation", () => {
  let collegeAId: string;
  let collegeBId: string;
  let tcTokenA: string;
  let teTokenA: string;
  let stTokenA: string;
  let tcTokenB: string;

  before(async () => {
    const passwordHash = await hashPassword("StrongAcademicPass123!");

    // Create College A Users
    const [userTc, userTe, userSt, userTcB] = await api.deps.models.User.create([
      { name: "Coordinator A", emailNormalized: "tc-a@svit.ac.in", passwordHash, status: "active" },
      { name: "Teacher A", emailNormalized: "te-a@svit.ac.in", passwordHash, status: "active" },
      { name: "Student A", emailNormalized: "st-a@svit.ac.in", passwordHash, status: "active" },
      { name: "Coordinator B", emailNormalized: "tc-b@other.ac.in", passwordHash, status: "active" },
    ]);

    const [collegeA] = await api.deps.models.College.create([
      {
        code: "SVIT_TT",
        name: { en: "Sutlej Valley Institute" },
        status: "active",
      },
    ]);
    collegeAId = String(collegeA!._id);

    const [collegeB] = await api.deps.models.College.create([
      {
        code: "OTHER_TT",
        name: { en: "Other College" },
        status: "active",
      },
    ]);
    collegeBId = String(collegeB!._id);

    await runInTenant(collegeA!._id, async () => {
      await api.deps.models.Membership.create([
        { collegeId: collegeA!._id, userId: userTc!._id, roles: ["TC"], status: "active" },
        { collegeId: collegeA!._id, userId: userTe!._id, roles: ["TE"], status: "active" },
        { collegeId: collegeA!._id, userId: userSt!._id, roles: ["ST"], status: "active" },
      ]);
    });

    await runInTenant(collegeB!._id, async () => {
      await api.deps.models.Membership.create([
        { collegeId: collegeB!._id, userId: userTcB!._id, roles: ["TC"], status: "active" },
      ]);
    });

    // Obtain login tokens
    const login = async (email: string) => {
      const res = await call<{ data: { accessToken: string } }>(
        `${base}/auth/login`,
        jsonPost({ identifier: email, password: "StrongAcademicPass123!" }),
      );
      assert.equal(res.status, 200);
      return res.body.data.accessToken;
    };

    tcTokenA = await login("tc-a@svit.ac.in");
    teTokenA = await login("te-a@svit.ac.in");
    stTokenA = await login("st-a@svit.ac.in");
    tcTokenB = await login("tc-b@other.ac.in");

    // Seed demo academic data in College A
    const seedRes = await call(`${base}/colleges/${collegeAId}/academic/seed`, jsonPost({}, authHeaders(tcTokenA)));
    assert.equal(seedRes.status, 201);
  });

  it("generates a deterministic timetable on the server using MongoDB data", async () => {
    const res = await call<{
      data: {
        result: { entries: Array<{ id: string; day: string; startPeriod: number; span: number }>; unplaced: unknown[]; seed: number; totalSessions: number };
        report: { valid: boolean; complete: boolean; serverValidated: boolean; counts: Record<string, number> };
        durationMs: number;
      };
    }>(
      `${base}/colleges/${collegeAId}/academic/timetable/generate`,
      jsonPost({ seed: 42, maxAttempts: 5 }, authHeaders(tcTokenA)),
    );
    assert.equal(res.status, 200);

    const body = res.body;
    assert.equal(body.data.report.serverValidated, true);
    assert.equal(body.data.result.seed, 42);
    assert.ok(body.data.result.entries.length > 0, "should schedule entries");
    assert.equal(body.data.result.totalSessions, 32, "demo data has 32 total weekly sessions");
    assert.equal(body.data.report.counts.teacher, 0, "zero teacher clashes");
    assert.equal(body.data.report.counts.room, 0, "zero room clashes");
    assert.equal(body.data.report.counts.section, 0, "zero section clashes");
  });

  it("server-side validator independently validates and approves a clash-free timetable", async () => {
    const genRes = await call<{ data: { result: { entries: unknown[] } } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/generate`,
      jsonPost({ seed: 1 }, authHeaders(tcTokenA)),
    );
    const { result } = genRes.body.data;

    const valRes = await call<{ data: { valid: boolean; serverValidated: boolean; counts: Record<string, number> } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/validate`,
      jsonPost({ entries: result.entries }, authHeaders(tcTokenA)),
    );
    assert.equal(valRes.status, 200);

    const report = valRes.body.data;
    assert.equal(report.valid, true);
    assert.equal(report.serverValidated, true);
    assert.equal(report.counts.teacher, 0);
    assert.equal(report.counts.room, 0);
    assert.equal(report.counts.section, 0);
  });

  it("server validator catches and reports teacher double-booking clash", async () => {
    const genRes = await call<{ data: { result: { entries: Array<{ id: string; teacherId: string; day: string; startPeriod: number; span: number }> } } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/generate`,
      jsonPost({ seed: 1 }, authHeaders(tcTokenA)),
    );
    const entries = genRes.body.data.result.entries;

    const tampered = structuredClone(entries);
    assert.ok(tampered.length >= 2);
    tampered[1]!.teacherId = tampered[0]!.teacherId;
    tampered[1]!.day = tampered[0]!.day;
    tampered[1]!.startPeriod = tampered[0]!.startPeriod;
    tampered[1]!.span = tampered[0]!.span;

    const valRes = await call<{ data: { valid: boolean; counts: Record<string, number>; issues: Array<{ kind: string; message: string }> } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/validate`,
      jsonPost({ entries: tampered }, authHeaders(tcTokenA)),
    );
    assert.equal(valRes.status, 200);

    const report = valRes.body.data;
    assert.equal(report.valid, false, "must fail validation");
    assert.ok(report.counts.teacher >= 1, "must report at least 1 teacher clash");
    assert.ok(report.issues.some((i) => i.kind === "teacher" && i.message.includes("booked twice")));
  });

  it("server validator catches and reports room double-booking clash", async () => {
    const genRes = await call<{ data: { result: { entries: Array<{ id: string; roomId: string; day: string; startPeriod: number; span: number }> } } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/generate`,
      jsonPost({ seed: 1 }, authHeaders(tcTokenA)),
    );
    const entries = genRes.body.data.result.entries;

    const tampered = structuredClone(entries);
    tampered[1]!.roomId = tampered[0]!.roomId;
    tampered[1]!.day = tampered[0]!.day;
    tampered[1]!.startPeriod = tampered[0]!.startPeriod;
    tampered[1]!.span = tampered[0]!.span;

    const valRes = await call<{ data: { valid: boolean; counts: Record<string, number> } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/validate`,
      jsonPost({ entries: tampered }, authHeaders(tcTokenA)),
    );
    const report = valRes.body.data;
    assert.equal(report.valid, false);
    assert.ok(report.counts.room >= 1, "must report room clash");
  });

  it("server validator catches room capacity and type violations", async () => {
    const genRes = await call<{ data: { result: { entries: Array<{ id: string; roomId: string; requirementId: string }> } } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/generate`,
      jsonPost({ seed: 1 }, authHeaders(tcTokenA)),
    );
    const entries = genRes.body.data.result.entries;

    const datasetRes = await call<{ data: { rooms: Array<{ id: string; type: string; capacity: number }>; requirements: Array<{ id: string; roomType: string }> } }>(
      `${base}/colleges/${collegeAId}/academic`,
      { headers: authHeaders(tcTokenA) },
    );
    const dataset = datasetRes.body.data;

    const smallLab = dataset.rooms.find((r) => r.type === "lab" && r.capacity === 40);
    assert.ok(smallLab);

    const tampered = structuredClone(entries);
    tampered[0]!.roomId = smallLab.id;

    const valRes = await call<{ data: { valid: boolean; counts: Record<string, number>; issues: Array<{ kind: string }> } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/validate`,
      jsonPost({ entries: tampered }, authHeaders(tcTokenA)),
    );
    const report = valRes.body.data;
    assert.equal(report.valid, false);
    assert.ok(report.issues.some((i) => i.kind === "capacity" || i.kind === "roomType"));
  });

  it("persists timetable in MongoDB and retrieves it via GET /timetable", async () => {
    const genRes = await call<{ data: { result: { entries: unknown[]; seed: number } } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/generate`,
      jsonPost({ seed: 7 }, authHeaders(tcTokenA)),
    );
    const { result } = genRes.body.data;

    const saveRes = await call<{ data: { isValid: boolean; entries: unknown[]; seed: number } }>(
      `${base}/colleges/${collegeAId}/academic/timetable`,
      jsonPost({ entries: result.entries, source: "generated", seed: result.seed }, authHeaders(tcTokenA)),
    );
    assert.equal(saveRes.status, 200);

    const saved = saveRes.body.data;
    assert.equal(saved.isValid, true);
    assert.equal(saved.seed, 7);
    assert.equal(saved.entries.length, result.entries.length);

    const readRes = await call<{ data: { isValid: boolean; entries: unknown[]; seed: number } }>(
      `${base}/colleges/${collegeAId}/academic/timetable`,
      { headers: authHeaders(tcTokenA) },
    );
    assert.equal(readRes.status, 200);
    const fetched = readRes.body.data;
    assert.equal(fetched.isValid, true);
    assert.equal(fetched.seed, 7);
    assert.equal(fetched.entries.length, result.entries.length);
  });

  it("respects teacher availability and avoids scheduling on blocked slots", async () => {
    const datasetRes = await call<{ data: { teachers: Array<{ id: string }> } }>(
      `${base}/colleges/${collegeAId}/academic`,
      { headers: authHeaders(tcTokenA) },
    );
    const teacher = datasetRes.body.data.teachers[0]!;

    await call(
      `${base}/colleges/${collegeAId}/academic/availability/${teacher.id}`,
      jsonPost({ slots: ["mon-1", "mon-2", "mon-3", "mon-4"] }, authHeaders(tcTokenA)),
    );

    const genRes = await call<{ data: { result: { entries: Array<{ teacherId: string; day: string; startPeriod: number; span: number }> } } }>(
      `${base}/colleges/${collegeAId}/academic/timetable/generate`,
      jsonPost({ seed: 15 }, authHeaders(tcTokenA)),
    );
    const entries = genRes.body.data.result.entries;

    for (const e of entries) {
      if (e.teacherId === teacher.id && e.day === "mon") {
        const covered = Array.from({ length: e.span }, (_, k) => e.startPeriod + k);
        assert.ok(!covered.includes(1), "should not be on mon-1");
        assert.ok(!covered.includes(2), "should not be on mon-2");
        assert.ok(!covered.includes(3), "should not be on mon-3");
        assert.ok(!covered.includes(4), "should not be on mon-4");
      }
    }
  });

  it("enforces role permissions: TE and ST cannot generate or save timetables", async () => {
    const teGen = await call(
      `${base}/colleges/${collegeAId}/academic/timetable/generate`,
      jsonPost({ seed: 1 }, authHeaders(teTokenA)),
    );
    assert.equal(teGen.status, 403);

    const stSave = await call(
      `${base}/colleges/${collegeAId}/academic/timetable`,
      jsonPost({ entries: [] }, authHeaders(stTokenA)),
    );
    assert.equal(stSave.status, 403);

    const teView = await call(`${base}/colleges/${collegeAId}/academic/timetable`, { headers: authHeaders(teTokenA) });
    assert.equal(teView.status, 200);

    const stView = await call(`${base}/colleges/${collegeAId}/academic/timetable`, { headers: authHeaders(stTokenA) });
    assert.equal(stView.status, 200);
  });

  it("enforces college-level tenant isolation: College B cannot access College A timetable", async () => {
    const crossRead = await call(
      `${base}/colleges/${collegeAId}/academic/timetable`,
      { headers: authHeaders(tcTokenB) },
    );
    assert.ok([403, 404].includes(crossRead.status), "must reject cross-college timetable read");

    const crossSave = await call(
      `${base}/colleges/${collegeAId}/academic/timetable`,
      jsonPost({ entries: [] }, authHeaders(tcTokenB)),
    );
    assert.ok([403, 404].includes(crossSave.status), "must reject cross-college timetable modification");

    const ownRead = await call(
      `${base}/colleges/${collegeBId}/academic/timetable`,
      { headers: authHeaders(tcTokenB) },
    );
    assert.equal(ownRead.status, 200);
  });

});
