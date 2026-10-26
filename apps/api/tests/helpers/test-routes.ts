// Routes mounted only in integration tests, to exercise real persistence, tenant scoping,
// validation and shutdown through HTTP. They are never part of the real API.

import { Router } from "express";
import { z } from "zod";

import { runInTenant } from "../../src/db/tenant.ts";
import { sendData } from "../../src/http/response.ts";
import { valid, validate } from "../../src/middleware/validate.ts";
import type { Models } from "../../src/models/index.ts";
import type { ApiModule } from "../../src/routes/module.ts";

const objectId = z.string().regex(/^[a-f0-9]{24}$/, { error: "must be a 24-character id" });
const eventSchemas = {
  params: z.strictObject({ collegeId: objectId }),
  body: z.strictObject({ action: z.string().min(1).max(80), targetId: z.string().min(1).max(64) }),
};
const listSchemas = { params: z.strictObject({ collegeId: objectId }) };
const slowSchemas = { query: z.strictObject({ ms: z.coerce.number().int().min(0).max(5_000) }) };

export function testRoutes(models: Models): ApiModule {
  const router = Router();

  router.post("/colleges/:collegeId/events", validate(eventSchemas), async (req, res) => {
    const { params, body } = valid(req, eventSchemas);
    const event = await runInTenant(params.collegeId, () =>
      models.AuditEvent.create({ action: body.action, target: { kind: "test", id: body.targetId }, requestId: String(res.locals.requestId) }),
    );
    sendData(res, { id: String(event._id), collegeId: String(event.collegeId), action: event.action }, 201);
  });

  router.get("/colleges/:collegeId/events", validate(listSchemas), async (req, res) => {
    const { params } = valid(req, listSchemas);
    const events = await runInTenant(params.collegeId, () => models.AuditEvent.find().sort({ at: 1 }).lean());
    sendData(res, events.map((e) => ({ id: String(e._id), collegeId: String(e.collegeId), action: e.action })));
  });

  router.get("/slow", validate(slowSchemas), async (req, res) => {
    const { query } = valid(req, slowSchemas);
    await new Promise((r) => setTimeout(r, query.ms));
    sendData(res, { waitedMs: query.ms });
  });

  return { path: "/test", router };
}
