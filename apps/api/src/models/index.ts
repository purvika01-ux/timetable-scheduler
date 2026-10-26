// Register every model on a connection. Models are always created this way (never on the global
// mongoose instance) so each process or test has its own isolated set.

import type { Connection } from "mongoose";

import {
  departmentSchema,
  requirementSchema,
  roomSchema,
  sectionSchema,
  subjectSchema,
  teacherAvailabilitySchema,
  teacherSchema,
  timetableSchema,
} from "./academic.ts";
import { collegeSchema, idempotencyKeySchema, passwordResetSchema, platformAuditEventSchema, rateLimitSchema, sessionSchema, userSchema } from "./platform.ts";
import { auditEventSchema, invitationSchema, membershipSchema } from "./tenant.ts";

export function registerModels(connection: Connection) {
  return {
    College: connection.model("College", collegeSchema),
    User: connection.model("User", userSchema),
    Session: connection.model("Session", sessionSchema),
    IdempotencyKey: connection.model("IdempotencyKey", idempotencyKeySchema),
    RateLimit: connection.model("RateLimit", rateLimitSchema),
    PasswordReset: connection.model("PasswordReset", passwordResetSchema),
    PlatformAuditEvent: connection.model("PlatformAuditEvent", platformAuditEventSchema),
    Membership: connection.model("Membership", membershipSchema),
    Invitation: connection.model("Invitation", invitationSchema),
    AuditEvent: connection.model("AuditEvent", auditEventSchema),
    Department: connection.model("Department", departmentSchema),
    Teacher: connection.model("Teacher", teacherSchema),
    Subject: connection.model("Subject", subjectSchema),
    Section: connection.model("Section", sectionSchema),
    Room: connection.model("Room", roomSchema),
    Requirement: connection.model("Requirement", requirementSchema),
    TeacherAvailability: connection.model("TeacherAvailability", teacherAvailabilitySchema),
    Timetable: connection.model("Timetable", timetableSchema),
  };
}

export type Models = ReturnType<typeof registerModels>;

/** Models whose documents belong to one college (collegeId required, tenantPlugin applied). */
export const TENANT_MODELS = [
  "Membership",
  "Invitation",
  "AuditEvent",
  "Department",
  "Teacher",
  "Subject",
  "Section",
  "Room",
  "Requirement",
  "TeacherAvailability",
  "Timetable",
] as const satisfies readonly (keyof Models)[];

