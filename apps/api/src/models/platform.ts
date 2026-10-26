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
    status: { type: String, enum: ["pending", "active", "suspended"], required: true, default: "pending" },
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
    platformRoles: { type: [String], enum: ["PA", "PS"], default: [] },
    mfa: {
      enabled: { type: Boolean, default: false },
      secretEncrypted: { type: String },
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
    lastUsedAt: { type: Date },
    expiresAt: { type: Date, required: true },
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

export type College = InferSchemaType<typeof collegeSchema>;
export type User = InferSchemaType<typeof userSchema>;
