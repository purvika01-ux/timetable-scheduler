// Integration tests against a real, throwaway MongoDB (tests/helpers/mongod.ts): health with a live
// database, collections and indexes from the approved schema, the database-level collegeId rule,
// tenant scoping, real persistence through HTTP, and graceful shutdown.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Types } from "mongoose";

import { TenantScopeError, runInTenant } from "../../src/db/tenant.ts";
import { startApi, type RunningApi } from "../../src/lifecycle.ts";
import { call, silentLogger, testConfig } from "../helpers/api.ts";
import { startTestMongo, type TestMongo } from "../helpers/mongod.ts";
import { testRoutes } from "../helpers/test-routes.ts";

let mongo: TestMongo;
let api: RunningApi;

before(async () => {
  mongo = await startTestMongo();
  api = await startApi({
    config: testConfig({ MONGODB_URI: mongo.uri }),
    logger: silentLogger,
    version: "test",
    extraModules: (models) => [testRoutes(models)],
  });
  await api.databaseReady;
});

after(async () => {
  await api?.close();
  await mongo?.stop();
});

const collegeA = new Types.ObjectId().toHexString();
const collegeB = new Types.ObjectId().toHexString();
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("health with a live database", () => {
  it("reports ok, connected, with a measured latency", async () => {
    const res = await call<{ data: { status: string; database: { status: string; state: string; latencyMs: number } } }>(`${api.url}/api/v1/health`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "ok");
    assert.equal(res.body.data.database.status, "up");
    assert.equal(res.body.data.database.state, "connected");
    assert.equal(typeof res.body.data.database.latencyMs, "number");
    assert.equal((res.body.data.database as { schemaReady?: boolean }).schemaReady, true);
  });
});

describe("collections and indexes", () => {
  const indexNames = async (collection: string) =>
    (await api.db.connection.db!.collection(collection).indexes()).map((i) => i.name).sort();

  it("creates the indexes of the approved design", async () => {
    assert.deepEqual(await indexNames("colleges"), ["_id_", "code_unique", "status"]);
    assert.deepEqual(await indexNames("users"), ["_id_", "email_unique", "mobile_unique"]);
    assert.deepEqual(await indexNames("sessions"), ["_id_", "expires_ttl", "family", "token_unique", "user_revoked"]);
    assert.deepEqual(await indexNames("memberships"), ["_id_", "college_roles", "college_user_unique", "user"]);
    assert.deepEqual(await indexNames("invitations"), ["_id_", "college_target_email", "college_target_mobile", "expires_ttl", "token_unique"]);
    assert.deepEqual(await indexNames("auditEvents"), ["_id_", "college_at", "college_target"]);
    assert.deepEqual(await indexNames("idempotencyKeys"), ["_id_", "created_ttl_24h"]);
    assert.deepEqual(await indexNames("rateLimits"), ["_id_", "reset_ttl"]);
  });

  it("sets up time-to-live and partial unique indexes correctly", async () => {
    const sessions = await api.db.connection.db!.collection("sessions").indexes();
    assert.equal(sessions.find((i) => i.name === "expires_ttl")?.expireAfterSeconds, 0);
    const users = await api.db.connection.db!.collection("users").indexes();
    const email = users.find((i) => i.name === "email_unique");
    assert.equal(email?.unique, true);
    assert.deepEqual(email?.partialFilterExpression, { emailNormalized: { $type: "string" } });
  });

  it("is safe to run setup again (restarts do not fail or drop anything)", async () => {
    const { setUpDatabase } = await import("../../src/db/setup.ts");
    const result = await setUpDatabase(api.models, silentLogger);
    assert.equal(result.collections.length, 8);
  });

  it("enforces unique emails, ignoring users without one", async () => {
    await api.models.User.create({ name: "Test User One", emailNormalized: "one@example.edu" });
    await api.models.User.create({ name: "No Email A" });
    await api.models.User.create({ name: "No Email B" });
    await assert.rejects(api.models.User.create({ name: "Test User Two", emailNormalized: "one@example.edu" }), /E11000/);
  });

  it("refuses a college-owned document without collegeId at the database level", async () => {
    // Bypasses Mongoose on purpose: the collection validator is the last line of defence.
    await assert.rejects(api.db.connection.db!.collection("memberships").insertOne({ userId: new Types.ObjectId(), roles: ["TE"] }), /Document failed validation/);
  });
});

describe("tenant scoping", () => {
  it("refuses queries and inserts without a college context", async () => {
    await assert.rejects(api.models.AuditEvent.find().exec(), TenantScopeError);
    await assert.rejects(api.models.AuditEvent.countDocuments().exec(), TenantScopeError);
    await assert.rejects(api.models.AuditEvent.aggregate([{ $match: {} }]).exec(), TenantScopeError);
    await assert.rejects(api.models.AuditEvent.create({ action: "x", target: { kind: "t", id: "1" } }), TenantScopeError);
  });

  it("keeps each college's documents to itself", async () => {
    await runInTenant(collegeA, () => api.models.AuditEvent.create({ action: "a1", target: { kind: "t", id: "1" } }));
    await runInTenant(collegeB, () => api.models.AuditEvent.create({ action: "b1", target: { kind: "t", id: "1" } }));
    const seenByA = await runInTenant(collegeA, () => api.models.AuditEvent.find().lean());
    assert.ok(seenByA.length >= 1);
    assert.ok(seenByA.every((e) => String(e.collegeId) === collegeA));
    const countB = await runInTenant(collegeB, () => api.models.AuditEvent.aggregate([{ $group: { _id: "$collegeId", n: { $sum: 1 } } }]));
    assert.deepEqual(countB.map((g) => String(g._id)), [collegeB]);
  });

  it("refuses an explicit request for another college's data", async () => {
    await assert.rejects(
      runInTenant(collegeA, () => api.models.AuditEvent.find({ collegeId: new Types.ObjectId(collegeB) }).exec()),
      /another college/,
    );
    await assert.rejects(
      runInTenant(collegeA, () => api.models.AuditEvent.create({ collegeId: new Types.ObjectId(collegeB), action: "x", target: { kind: "t", id: "1" } })),
      /another college/,
    );
  });

  it("limits updates and deletes to the current college", async () => {
    const result = await runInTenant(collegeA, () => api.models.AuditEvent.updateMany({}, { $set: { action: "updated-by-a" } }));
    assert.ok(result.modifiedCount >= 1);
    const stillB = await runInTenant(collegeB, () => api.models.AuditEvent.find().lean());
    assert.ok(stillB.every((e) => e.action !== "updated-by-a"));
  });

  it("allows deliberate cross-college access only when asked for", async () => {
    const all = await api.models.AuditEvent.find().setOptions({ platformScope: true }).lean();
    assert.ok(new Set(all.map((e) => String(e.collegeId))).size >= 2);
  });
});

describe("persistence through the API", () => {
  it("stores and reads back data, separately per college", async () => {
    const c1 = new Types.ObjectId().toHexString();
    const c2 = new Types.ObjectId().toHexString();
    const created = await call<{ data: { id: string; collegeId: string; action: string } }>(
      `${api.url}/api/v1/test/colleges/${c1}/events`,
      post({ action: "timetable.published", targetId: "v1" }),
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.data.collegeId, c1);

    const mine = await call<{ data: { id: string }[] }>(`${api.url}/api/v1/test/colleges/${c1}/events`);
    assert.deepEqual(mine.body.data.map((e) => e.id), [created.body.data.id]);
    const theirs = await call<{ data: unknown[] }>(`${api.url}/api/v1/test/colleges/${c2}/events`);
    assert.deepEqual(theirs.body.data, []);

    const stored = await api.models.AuditEvent.findById(created.body.data.id).setOptions({ platformScope: true }).lean();
    assert.equal(stored?.action, "timetable.published");
  });

  it("validates input before touching the database", async () => {
    const before = await api.models.AuditEvent.countDocuments().setOptions({ platformScope: true });
    const res = await call<{ error: { code: string } }>(`${api.url}/api/v1/test/colleges/not-an-id/events`, post({ action: "" }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "validation_failed");
    assert.equal(await api.models.AuditEvent.countDocuments().setOptions({ platformScope: true }), before);
  });
});

describe("graceful shutdown", () => {
  it("lets a request in progress finish, then stops", async () => {
    const second = await startApi({
      config: testConfig({ MONGODB_URI: mongo.uri, SHUTDOWN_TIMEOUT_MS: "3000" }),
      logger: silentLogger,
      version: "test",
      extraModules: (models) => [testRoutes(models)],
    });
    await second.databaseReady;
    const slow = call<{ data: { waitedMs: number } }>(`${second.url}/api/v1/test/slow?ms=400`);
    await new Promise((r) => setTimeout(r, 100));
    const closing = second.close();
    const res = await slow;
    assert.equal(res.status, 200);
    assert.equal(res.body.data.waitedMs, 400);
    await closing;
    assert.equal(second.server.listening, false);
    assert.equal(second.db.status, "disconnected");
    await assert.rejects(fetch(`${second.url}/api/v1/health/live`));
  });
});
