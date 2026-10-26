// Audit events (PRODUCT_REQUIREMENTS.md section 4.4). Written in the same transaction as the change
// they describe. College events go to the college's own log; platform events (registrations,
// decisions, sign-in security, recovery) to the platform log.

import type { ClientSession, Types } from "mongoose";

import type { Models } from "../models/index.ts";

export interface AuditInput {
  action: string;
  target: { kind: string; id: string };
  actorUserId?: Types.ObjectId | null;
  actorRoles?: string[];
  summary?: Record<string, unknown>;
  requestId?: string;
}

/** Must run inside the college's tenant context (runInTenant or requireMember). */
export async function auditCollege(models: Models, input: AuditInput, session?: ClientSession): Promise<void> {
  await models.AuditEvent.create(
    [
      {
        actor: { userId: input.actorUserId ?? undefined, roles: input.actorRoles ?? [] },
        action: input.action,
        target: input.target,
        summary: input.summary,
        requestId: input.requestId,
      },
    ],
    { session },
  );
}

export async function auditPlatform(
  models: Models,
  input: AuditInput & { collegeId?: Types.ObjectId | null },
  session?: ClientSession,
): Promise<void> {
  await models.PlatformAuditEvent.create(
    [
      {
        actor: { userId: input.actorUserId ?? undefined, platformRoles: input.actorRoles ?? [] },
        action: input.action,
        target: input.target,
        collegeId: input.collegeId ?? undefined,
        summary: input.summary,
        requestId: input.requestId,
      },
    ],
    { session },
  );
}
