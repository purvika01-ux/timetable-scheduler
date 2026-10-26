// College-owned collections (DATABASE_DESIGN.md sections 4.2 and 4.9). Every document has
// collegeId, every index starts with it, and tenantPlugin limits all access to one college.

import { Schema, type InferSchemaType } from "mongoose";

import { tenantPlugin } from "../db/tenant.ts";

export const COLLEGE_ROLES = ["CA", "PR", "TC", "HOD", "TE", "ST"] as const;

const collegeId = { type: Schema.Types.ObjectId, required: true, immutable: true } as const;

export const membershipSchema = new Schema(
  {
    collegeId,
    userId: { type: Schema.Types.ObjectId, required: true },
    roles: { type: [{ type: String, enum: COLLEGE_ROLES }], required: true, validate: (v: string[]) => v.length > 0 },
    departmentIds: { type: [Schema.Types.ObjectId], default: [] },
    teacherId: { type: Schema.Types.ObjectId },
    /** "pending" only for a registration applicant until the college is approved (M16). */
    status: { type: String, enum: ["pending", "active", "suspended"], required: true, default: "active" },
    invitedBy: { type: Schema.Types.ObjectId },
    rowVersion: { type: Number, required: true, default: 0 },
  },
  { collection: "memberships", timestamps: true, strict: "throw" },
);
membershipSchema.plugin(tenantPlugin);
membershipSchema.index({ collegeId: 1, userId: 1 }, { unique: true, name: "college_user_unique" });
membershipSchema.index({ collegeId: 1, roles: 1 }, { name: "college_roles" });
// Listing a person's colleges at sign-in is a deliberate cross-college lookup by user.
membershipSchema.index({ userId: 1 }, { name: "user" });

export const invitationSchema = new Schema(
  {
    collegeId,
    tokenHash: { type: String, required: true },
    target: {
      email: { type: String, maxlength: 254 },
      mobile: { type: String, maxlength: 20 },
    },
    roles: { type: [{ type: String, enum: COLLEGE_ROLES }], required: true, validate: (v: string[]) => v.length > 0 },
    departmentIds: { type: [Schema.Types.ObjectId], default: [] },
    teacherId: { type: Schema.Types.ObjectId },
    invitedBy: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
    acceptedBy: { type: Schema.Types.ObjectId },
    revokedAt: { type: Date },
  },
  { collection: "invitations", timestamps: true, strict: "throw" },
);
invitationSchema.plugin(tenantPlugin);
invitationSchema.index({ tokenHash: 1 }, { unique: true, name: "token_unique" });
invitationSchema.index({ collegeId: 1, "target.email": 1 }, { name: "college_target_email", partialFilterExpression: { "target.email": { $type: "string" } } });
invitationSchema.index({ collegeId: 1, "target.mobile": 1 }, { name: "college_target_mobile", partialFilterExpression: { "target.mobile": { $type: "string" } } });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expires_ttl" });

export const auditEventSchema = new Schema(
  {
    collegeId,
    actor: {
      userId: { type: Schema.Types.ObjectId },
      roles: { type: [String], default: [] },
    },
    action: { type: String, required: true, maxlength: 80 },
    target: {
      kind: { type: String, required: true, maxlength: 40 },
      id: { type: String, required: true, maxlength: 64 },
    },
    summary: { type: Schema.Types.Mixed },
    requestId: { type: String, maxlength: 64 },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "auditEvents", strict: "throw" },
);
auditEventSchema.plugin(tenantPlugin);
auditEventSchema.index({ collegeId: 1, at: -1 }, { name: "college_at" });
auditEventSchema.index({ collegeId: 1, "target.kind": 1, "target.id": 1 }, { name: "college_target" });

export type Membership = InferSchemaType<typeof membershipSchema>;
export type AuditEvent = InferSchemaType<typeof auditEventSchema>;
