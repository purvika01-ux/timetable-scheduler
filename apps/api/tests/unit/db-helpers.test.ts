import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describe as describeError, isDatabaseUnavailableError } from "../../src/db/connection.ts";
import { createHealthService } from "../../src/services/health.service.ts";

const named = (name: string, message = "x") => Object.assign(new Error(message), { name });

describe("isDatabaseUnavailableError", () => {
  it("recognises connection failures", () => {
    for (const name of ["MongooseServerSelectionError", "MongoServerSelectionError", "MongoNetworkError", "MongoNetworkTimeoutError", "MongoNotConnectedError"]) {
      assert.equal(isDatabaseUnavailableError(named(name)), true, name);
    }
    assert.equal(isDatabaseUnavailableError(named("MongooseError", "Cannot call `users.find()` before initial connection is complete if `bufferCommands = false`.")), true);
  });

  it("does not treat query errors as outages", () => {
    assert.equal(isDatabaseUnavailableError(named("MongoServerError", "E11000 duplicate key")), false);
    assert.equal(isDatabaseUnavailableError(named("ValidationError")), false);
    assert.equal(isDatabaseUnavailableError("not an error"), false);
  });
});

describe("error descriptions for logs", () => {
  it("removes connection strings, which may contain passwords", () => {
    const d = describeError(named("MongoServerSelectionError", "failed to connect to mongodb+srv://admin:pw@cluster.example.net/db?x=1"));
    assert.equal(d.message, "failed to connect to mongodb://[redacted]");
  });
});

describe("health service", () => {
  const startedAt = new Date("2026-10-26T10:00:00Z");
  const now = () => new Date("2026-10-26T10:01:30Z");

  it("is ok when the database answers", async () => {
    const service = createHealthService({ db: { status: "connected", ping: async () => ({ status: "up", latencyMs: 4 }) }, version: "1.0.0", startedAt, now });
    assert.deepEqual(await service.check(), {
      status: "ok",
      api: { status: "up", version: "1.0.0", uptimeSeconds: 90 },
      database: { status: "up", latencyMs: 4, state: "connected" },
      checkedAt: "2026-10-26T10:01:30.000Z",
    });
  });

  it("is degraded while the database answers but collections and indexes are not set up yet", async () => {
    const service = createHealthService({
      db: { status: "connected", ping: async () => ({ status: "up", latencyMs: 2, schemaReady: false }) },
      version: "1.0.0",
      startedAt,
      now,
    });
    const report = await service.check();
    assert.equal(report.status, "degraded");
    assert.equal(report.database.schemaReady, false);
  });

  it("is degraded when the database does not answer, with the reason", async () => {
    const service = createHealthService({
      db: { status: "connecting", ping: async () => ({ status: "down", reason: "connecting" }) },
      version: "1.0.0",
      startedAt,
      now,
    });
    const report = await service.check();
    assert.equal(report.status, "degraded");
    assert.deepEqual(report.database, { status: "down", reason: "connecting", state: "connecting" });
  });
});
