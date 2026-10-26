// Platform collections: no collegeId (DATABASE_DESIGN.md section 4.1). Field lists and indexes
// follow the approved design; behaviour that uses them arrives in Phase 5 (sign-in).

import { Schema, type InferSchemaType } from "mongoose";

const bilingual = new Schema({ en: { type: String, required: true, trim: true, maxlength: 200 }, pa: { type: String, trim: true, maxlength: 200 } }, { _id: false });

export const collegeSchema = new Schema(
  {
    name: { type: bilingual, required: true },
    shortName: { type: String, trim: true, maxlength: 40 },
    code: { type: String, required: true, trim: true, maxlength: 40 },
    district: { type: String, trim: true, maxlength: 80 },
    kind: { type: String, trim: true, maxlength: 80 },
    affiliation: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: ["pending", "active", "rejected", "suspended"], required: true, default: "pending" },
    /** Self-registration (M16): who applied, and the platform administrator's decision. */
    registration: {
      applicantUserId: { type: Schema.Types.ObjectId },
      submittedAt: { type: Date },
      decidedAt: { type: Date },
      decidedBy: { type: Schema.Types.ObjectId },
      reason: { type: String, maxlength: 500 },
    },
    isSample: { type: Boolean, required: true, default: false },
    timeZone: { type: String, required: true, default: "Asia/Kolkata" },
    settings: {
      timeFormat: { type: String, enum: ["12h", "24h"], default: "12h" },
      publishUndoMinutes: { type: Number, default: 15, min: 0, max: 120 },
    },
    rowVersion: { type: Number, required: true, default: 0 },
  },
  { collection: "colleges", timestamps: true, strict: "throw" },
);
collegeSchema.index({ code: 1 }, { unique: true, name: "code_unique" });
collegeSchema.index({ status: 1 }, { name: "status" });

export const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, trim: true, maxlength: 254 },
    emailNormalized: { type: String, maxlength: 254 },
    mobile: { type: String, trim: true, maxlength: 20 },
    mobileNormalized: { type: String, maxlength: 20 },
    passwordHash: { type: String },
    passwordChangedAt: { type: Date },
    /** Hashes of the previous passwords (newest first), to refuse reuse. */
    passwordHistory: { type: [String], default: [] },
    platformRoles: { type: [String], enum: ["PA", "PS"], default: [] },
    mfa: {
      enabled: { type: Boolean, default: false },
      secretEncrypted: { type: String },
      /** Set during enrolment until the first code confirms the authenticator app. */
      pendingSecretEncrypted: { type: String },
      lastUsedStep: { type: Number },
      recoveryCodeHashes: { type: [String], default: undefined },
    },
    locale: { type: String, enum: ["en", "pa"], default: "en" },
    status: { type: String, enum: ["active", "disabled"], required: true, default: "active" },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { collection: "users", timestamps: true, strict: "throw" },
);
userSchema.index({ emailNormalized: 1 }, { unique: true, partialFilterExpression: { emailNormalized: { $type: "string" } }, name: "email_unique" });
userSchema.index({ mobileNormalized: 1 }, { unique: true, partialFilterExpression: { mobileNormalized: { $type: "string" } }, name: "mobile_unique" });

export const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId },
    replacedById: { type: Schema.Types.ObjectId },
    lastUsedAt: { type: Date, required: true },
    /** Inactivity allowed between refreshes, from the session policy (M19). */
    idleTimeoutSeconds: { type: Number, required: true },
    /** Absolute end of the session; the document is deleted after it. */
    expiresAt: { type: Date, required: true },
    /** Two-step sign-in was completed for this session (required for platform administrators). */
    mfaVerified: { type: Boolean, required: true, default: false },
    revokedAt: { type: Date },
    revokeReason: { type: String, maxlength: 80 },
    deviceLabel: { type: String, maxlength: 120 },
  },
  { collection: "sessions", timestamps: true, strict: "throw" },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true, name: "token_unique" });
sessionSchema.index({ userId: 1, revokedAt: 1 }, { name: "user_revoked" });
sessionSchema.index({ familyId: 1 }, { name: "family" });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expires_ttl" });

export const idempotencyKeySchema = new Schema(
  {
    _id: { type: String, required: true },
    collegeId: { type: Schema.Types.ObjectId },
    requestHash: { type: String, required: true },
    status: { type: String, enum: ["inProgress", "done"], required: true },
    response: { status: Number, body: Schema.Types.Mixed },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "idempotencyKeys", strict: "throw" },
);
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60, name: "created_ttl_24h" });

export const rateLimitSchema = new Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { collection: "rateLimits", strict: "throw" },
);
rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0, name: "reset_ttl" });

export const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    issuedBy: { type: Schema.Types.ObjectId, required: true },
    /** College whose administrator issued it; absent when a platform administrator did. */
    collegeId: { type: Schema.Types.ObjectId },
  },
  { collection: "passwordResets", timestamps: true, strict: "throw" },
);
passwordResetSchema.index({ tokenHash: 1 }, { unique: true, name: "token_unique" });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expires_ttl" });

/** Platform-level audit trail: registrations, decisions, sign-in security events, recovery (append-only). */
export const platformAuditEventSchema = new Schema(
  {
    actor: {
      userId: { type: Schema.Types.ObjectId },
      platformRoles: { type: [String], default: [] },
    },
    action: { type: String, required: true, maxlength: 80 },
    target: {
      kind: { type: String, required: true, maxlength: 40 },
      id: { type: String, required: true, maxlength: 64 },
    },
    collegeId: { type: Schema.Types.ObjectId },
    summary: { type: Schema.Types.Mixed },
    requestId: { type: String, maxlength: 64 },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "platformAuditEvents", strict: "throw" },
);
platformAuditEventSchema.index({ at: -1 }, { name: "at" });
platformAuditEventSchema.index({ "target.kind": 1, "target.id": 1 }, { name: "target" });

export type College = InferSchemaType<typeof collegeSchema>;
export type User = InferSchemaType<typeof userSchema>;
