// /api/v1/me (own account), /api/v1/registrations (apply to join), /api/v1/platform (platform
// administrators).

import { Types } from "mongoose";
import { z } from "zod";

import { authOf } from "../auth/context.ts";
import { sendData } from "../http/response.ts";
import { valid } from "../middleware/validate.ts";
import type { AuthService } from "../services/auth.service.ts";
import type { OnboardingService } from "../services/college-onboarding.service.ts";
import type { MeService } from "../services/me.service.ts";
import { email, mobile, objectId, password, personName, reason } from "./schemas.ts";
import type { ModuleSpec } from "./secure-router.ts";

const updateMe = { body: z.strictObject({ name: personName.optional(), locale: z.enum(["en", "pa"]).optional() }) };
const changePassword = { body: z.strictObject({ currentPassword: password, newPassword: password }) };

export function meRoutes(s: { me: MeService; auth: AuthService }): ModuleSpec {
  return {
    mount: "/me",
    routes: [
      {
        method: "get",
        path: "/",
        access: { kind: "user" },
        handler: async (_req, res) => {
          res.setHeader("Cache-Control", "no-store");
          sendData(res, await s.me.summary(authOf(res).sessionId));
        },
      },
      {
        method: "patch",
        path: "/",
        access: { kind: "user" },
        schemas: updateMe,
        handler: async (req, res) => sendData(res, await s.me.update(authOf(res).userId, valid(req, updateMe).body)),
      },
      {
        method: "post",
        path: "/password",
        access: { kind: "user" },
        limit: "passwordReset",
        schemas: changePassword,
        handler: async (req, res) => {
          const { body } = valid(req, changePassword);
          const a = authOf(res);
          await s.auth.changePassword(a.userId, a.sessionId, body.currentPassword, body.newPassword, String(res.locals.requestId));
          res.status(204).end();
        },
      },
    ],
  };
}

const registration = {
  body: z.strictObject({
    college: z.strictObject({
      name: z.string().trim().min(3).max(200),
      shortName: z.string().trim().max(40).optional(),
      code: z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/, { error: "use 2 to 20 letters, digits or dashes" }),
      district: z.string().trim().max(80).optional(),
      kind: z.string().trim().max(80).optional(),
    }),
    applicant: z.strictObject({ name: personName, email: email.optional(), mobile: mobile.optional(), password }).optional(),
  }),
};

export function registrationRoutes(s: { onboarding: OnboardingService }): ModuleSpec {
  return {
    mount: "/registrations",
    routes: [
      {
        method: "post",
        path: "/",
        access: { kind: "public" },
        optionalAuth: true,
        limit: "registration",
        schemas: registration,
        handler: async (req, res) => {
          const { body } = valid(req, registration);
          const userId = res.locals.auth?.userId ?? null;
          const result = await s.onboarding.register(body, userId, String(res.locals.requestId));
          sendData(res, { collegeId: String(result.collegeId), status: result.status, message: "Application received. A platform administrator will review it; you can sign in to see its status." }, 202);
        },
      },
    ],
  };
}

const listColleges = { query: z.strictObject({ status: z.enum(["pending", "active", "rejected", "suspended"]).optional() }) };
const collegeParam = { params: z.strictObject({ collegeId: objectId }) };
const decision = { params: z.strictObject({ collegeId: objectId }), body: z.strictObject({ reason: reason.optional() }) };
const needsReason = { params: z.strictObject({ collegeId: objectId }), body: z.strictObject({ reason }) };
const recovery = { params: z.strictObject({ collegeId: objectId }), body: z.strictObject({ userId: objectId, note: reason }) };
const userParam = { params: z.strictObject({ userId: objectId }) };

export function platformRoutes(s: { onboarding: OnboardingService }): ModuleSpec {
  const decide = (kind: "approve" | "reject" | "suspend" | "reactivate", schemas: typeof decision | typeof needsReason) => ({
    method: "post" as const,
    path: `/colleges/:collegeId/${kind}`,
    access: { kind: "platform" as const },
    schemas,
    handler: async (req: import("express").Request, res: import("express").Response) => {
      const { params, body } = valid(req, decision);
      await s.onboarding.decide(new Types.ObjectId(params.collegeId), kind, authOf(res).userId, body.reason, String(res.locals.requestId));
      res.status(204).end();
    },
  });
  return {
    mount: "/platform",
    routes: [
      {
        method: "get",
        path: "/colleges",
        access: { kind: "platform" },
        schemas: listColleges,
        handler: async (req, res) => sendData(res, await s.onboarding.list(valid(req, listColleges).query.status)),
      },
      decide("approve", decision),
      decide("reject", needsReason),
      decide("suspend", needsReason),
      decide("reactivate", decision),
      {
        method: "post",
        path: "/colleges/:collegeId/recovery",
        access: { kind: "platform" },
        schemas: recovery,
        handler: async (req, res) => {
          const { params, body } = valid(req, recovery);
          const link = await s.onboarding.recoveryLink(new Types.ObjectId(params.collegeId), new Types.ObjectId(body.userId), authOf(res).userId, body.note, String(res.locals.requestId));
          res.setHeader("Cache-Control", "no-store");
          sendData(res, { url: link.url, expiresAt: link.expiresAt }, 201);
        },
      },
      ...(["disable", "enable"] as const).map((kind) => ({
        method: "post" as const,
        path: `/users/:userId/${kind}`,
        access: { kind: "platform" as const },
        schemas: userParam,
        handler: async (req: import("express").Request, res: import("express").Response) => {
          const { params } = valid(req, userParam);
          await s.onboarding.setUserStatus(new Types.ObjectId(params.userId), kind === "disable" ? "disabled" : "active", authOf(res).userId, String(res.locals.requestId));
          res.status(204).end();
        },
      })),
    ],
  };
}

export { collegeParam };
