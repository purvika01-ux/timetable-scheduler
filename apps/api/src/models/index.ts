// Register every model on a connection. Models are always created this way (never on the global
// mongoose instance) so each process or test has its own isolated set.

import type { Connection } from "mongoose";

import { collegeSchema, idempotencyKeySchema, rateLimitSchema, sessionSchema, userSchema } from "./platform.ts";
import { auditEventSchema, invitationSchema, membershipSchema } from "./tenant.ts";

export function registerModels(connection: Connection) {
  return {
    College: connection.model("College", collegeSchema),
    User: connection.model("User", userSchema),
    Session: connection.model("Session", sessionSchema),
    IdempotencyKey: connection.model("IdempotencyKey", idempotencyKeySchema),
    RateLimit: connection.model("RateLimit", rateLimitSchema),
    Membership: connection.model("Membership", membershipSchema),
    Invitation: connection.model("Invitation", invitationSchema),
    AuditEvent: connection.model("AuditEvent", auditEventSchema),
  };
}

export type Models = ReturnType<typeof registerModels>;

/** Models whose documents belong to one college (collegeId required, tenantPlugin applied). */
export const TENANT_MODELS = ["Membership", "Invitation", "AuditEvent"] as const satisfies readonly (keyof Models)[];
