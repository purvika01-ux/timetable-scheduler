// Shared request schemas. Every object is strict: unknown fields (including any collegeId or role a
// client might try to slip in) are refused.

import { z } from "zod";

import { COLLEGE_ROLES } from "../auth/permissions.ts";
import { MAX_PASSWORD_LENGTH } from "../auth/passwords.ts";

export const objectId = z.string().regex(/^[a-f0-9]{24}$/, { error: "must be a 24-character id" });
export const token = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, { error: "is not a valid link token" });
export const password = z.string().min(1, { error: "is required" }).max(MAX_PASSWORD_LENGTH, { error: `must be at most ${MAX_PASSWORD_LENGTH} characters` });
export const personName = z.string().trim().min(2, { error: "enter at least 2 characters" }).max(120);
export const email = z.email({ error: "is not a valid email address" }).max(254);
export const mobile = z.string().trim().max(20);
export const roles = z.array(z.enum(COLLEGE_ROLES)).min(1, { error: "choose at least one role" }).max(COLLEGE_ROLES.length);
export const reason = z.string().trim().min(3, { error: "enter a reason" }).max(500);

export const collegeParams = z.strictObject({ collegeId: objectId });
export const withCollege = <T extends z.ZodRawShape>(shape: T) => z.strictObject({ collegeId: objectId, ...shape });
