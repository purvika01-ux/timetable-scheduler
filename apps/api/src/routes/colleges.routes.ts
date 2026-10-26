// /api/v1/colleges/:collegeId/...: everything about one college. Every route requires a membership
// of that college (read from the database) and a capability; ids in the path are looked up inside
// the college's tenant scope, so another college's ids are simply "not found".

import { Types } from "mongoose";
import { z } from "zod";

import { authOf, memberOf } from "../auth/context.ts";
import { sendData } from "../http/response.ts";
import { valid } from "../middleware/validate.ts";
import type { CollegeAccessService } from "../services/college-access.service.ts";
import { collegeParams, email, mobile, objectId, roles, withCollege } from "./schemas.ts";
import type { ModuleSpec } from "./secure-router.ts";

const updateCollege = {
  params: collegeParams,
  body: z.strictObject({
    rowVersion: z.number().int().min(0),
    name: z.strictObject({ en: z.string().trim().min(3).max(200), pa: z.string().trim().max(200).optional() }).optional(),
    shortName: z.string().trim().max(40).optional(),
    district: z.string().trim().max(80).optional(),
    settings: z.strictObject({ timeFormat: z.enum(["12h", "24h"]).optional() }).optional(),
  }),
};
const membershipParams = { params: withCollege({ membershipId: objectId }) };
const updateMembership = {
  params: withCollege({ membershipId: objectId }),
  body: z.strictObject({ rowVersion: z.number().int().min(0), roles: roles.optional(), status: z.enum(["active", "suspended"]).optional() }),
};
const createInvitation = { params: collegeParams, body: z.strictObject({ email: email.optional(), mobile: mobile.optional(), roles }) };
const invitationParams = { params: withCollege({ invitationId: objectId }) };
const auditQuery = { params: collegeParams, query: z.strictObject({ limit: z.coerce.number().int().min(1).max(200).default(50) }) };
const collegeOnly = { params: collegeParams };

export function collegeRoutes(s: { access: CollegeAccessService }): ModuleSpec {
  const actor = (res: import("express").Response) => ({ userId: authOf(res).userId, member: memberOf(res), requestId: String(res.locals.requestId) });
  const id = (v: string) => new Types.ObjectId(v);

  return {
    mount: "/colleges/:collegeId",
    routes: [
      { method: "get", path: "/", access: { kind: "member", capability: "college.view" }, schemas: collegeOnly, handler: async (_req, res) => sendData(res, await s.access.getCollege(memberOf(res))) },
      {
        method: "patch",
        path: "/",
        access: { kind: "member", capability: "college.update" },
        schemas: updateCollege,
        handler: async (req, res) => sendData(res, await s.access.updateCollege(actor(res), valid(req, updateCollege).body)),
      },
      { method: "get", path: "/memberships", access: { kind: "member", capability: "members.view" }, schemas: collegeOnly, handler: async (_req, res) => sendData(res, await s.access.listMembers(memberOf(res))) },
      {
        method: "get",
        path: "/memberships/export.csv",
        access: { kind: "member", capability: "members.export" },
        schemas: collegeOnly,
        handler: async (_req, res) => {
          const csv = await s.access.exportMembersCsv(actor(res));
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", 'attachment; filename="members.csv"');
          res.setHeader("Cache-Control", "no-store");
          res.send(`\uFEFF${csv}`);
        },
      },
      {
        method: "patch",
        path: "/memberships/:membershipId",
        access: { kind: "member", capability: "members.manage" },
        schemas: updateMembership,
        handler: async (req, res) => {
          const { params, body } = valid(req, updateMembership);
          sendData(res, await s.access.updateMember(actor(res), id(params.membershipId), body));
        },
      },
      {
        method: "delete",
        path: "/memberships/:membershipId",
        access: { kind: "member", capability: "members.manage" },
        schemas: membershipParams,
        handler: async (req, res) => {
          await s.access.removeMember(actor(res), id(valid(req, membershipParams).params.membershipId));
          res.status(204).end();
        },
      },
      {
        method: "post",
        path: "/memberships/:membershipId/reset-link",
        access: { kind: "member", capability: "passwordReset.issue" },
        schemas: membershipParams,
        handler: async (req, res) => {
          res.setHeader("Cache-Control", "no-store");
          sendData(res, await s.access.issueResetLink(actor(res), id(valid(req, membershipParams).params.membershipId)), 201);
        },
      },
      { method: "get", path: "/invitations", access: { kind: "member", capability: "invitations.manage" }, schemas: collegeOnly, handler: async (_req, res) => sendData(res, await s.access.listInvitations()) },
      {
        method: "post",
        path: "/invitations",
        access: { kind: "member", capability: "invitations.manage" },
        schemas: createInvitation,
        handler: async (req, res) => {
          res.setHeader("Cache-Control", "no-store");
          sendData(res, await s.access.createInvitation(actor(res), valid(req, createInvitation).body), 201);
        },
      },
      {
        method: "delete",
        path: "/invitations/:invitationId",
        access: { kind: "member", capability: "invitations.manage" },
        schemas: invitationParams,
        handler: async (req, res) => {
          await s.access.revokeInvitation(actor(res), id(valid(req, invitationParams).params.invitationId));
          res.status(204).end();
        },
      },
      {
        method: "get",
        path: "/audit-events",
        access: { kind: "member", capability: "audit.view" },
        schemas: auditQuery,
        handler: async (req, res) => sendData(res, await s.access.listAudit(valid(req, auditQuery).query.limit)),
      },
    ],
  };
}
