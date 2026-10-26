// College self-registration and the platform administrator's decisions (M16), plus administrator
// recovery (M20, N16). A pending, rejected or suspended college gives nobody access.

import { trusted, Types } from "mongoose";

import { normalizeEmail, normalizeMobile } from "../auth/secrets.ts";
import { runInTenant } from "../db/tenant.ts";
import { withTransaction } from "../db/transaction.ts";
import type { Deps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { auditCollege, auditPlatform } from "./audit.service.ts";
import type { AuthService } from "./auth.service.ts";
import { hashPassword, passwordProblems } from "../auth/passwords.ts";

export interface RegistrationInput {
  college: { name: string; shortName?: string; code: string; district?: string; kind?: string };
  applicant?: { name: string; email?: string; mobile?: string; password: string };
}

const notFound = () => new ApiError(404, "not_found", "We couldn't find that college.");

export function createOnboardingService(deps: Deps, auth: AuthService) {
  const { models, db, now } = deps;

  async function register(input: RegistrationInput, signedInUserId: Types.ObjectId | null, requestId?: string) {
    const code = input.college.code.trim().toUpperCase();
    if (await models.College.exists({ code })) throw new ApiError(409, "duplicate", "A college with this code is already registered. Check the code, or contact the platform team.");

    let newUser: { name: string; email: string | null; emailNormalized: string | null; mobile: string | null; mobileNormalized: string | null; passwordHash: string } | null = null;
    if (!signedInUserId) {
      const a = input.applicant;
      if (!a) throw new ApiError(400, "validation_failed", "Enter your details as the applicant.", [{ path: "body.applicant", code: "required", message: "is required" }]);
      const emailNormalized = normalizeEmail(a.email);
      const mobileNormalized = normalizeMobile(a.mobile);
      if (a.mobile && !mobileNormalized) throw new ApiError(400, "validation_failed", "Check the mobile number.", [{ path: "body.applicant.mobile", code: "invalid", message: "is not a valid Indian mobile number" }]);
      if (!emailNormalized && !mobileNormalized) {
        throw new ApiError(400, "validation_failed", "Enter an email address or a mobile number.", [{ path: "body.applicant.email", code: "required", message: "enter an email or a mobile number" }]);
      }
      const problems = await passwordProblems(a.password, { name: a.name, email: emailNormalized, mobile: mobileNormalized });
      if (problems.length > 0) throw new ApiError(400, "validation_failed", "Choose a different password.", problems.map((message) => ({ path: "body.applicant.password", code: "password_policy", message })));
      const taken = await models.User.exists({ $or: [emailNormalized ? { emailNormalized } : null, mobileNormalized ? { mobileNormalized } : null].filter(Boolean) as object[] });
      if (taken) throw new ApiError(409, "duplicate", "An account with this email or mobile number already exists. Sign in with it, then apply again.");
      newUser = { name: a.name.trim(), email: a.email?.trim() || null, emailNormalized, mobile: a.mobile?.trim() || null, mobileNormalized, passwordHash: await hashPassword(a.password) };
    }

    const collegeId = new Types.ObjectId();
    const result = await withTransaction(db.connection, async (session) => {
      let applicantId = signedInUserId;
      if (newUser) {
        const [u] = await models.User.create([{ ...newUser, email: newUser.email ?? undefined, emailNormalized: newUser.emailNormalized ?? undefined, mobile: newUser.mobile ?? undefined, mobileNormalized: newUser.mobileNormalized ?? undefined }], { session });
        applicantId = u!._id;
      }
      await models.College.create(
        [
          {
            _id: collegeId,
            name: { en: input.college.name.trim() },
            shortName: input.college.shortName?.trim() || undefined,
            code,
            district: input.college.district?.trim() || undefined,
            kind: input.college.kind?.trim() || undefined,
            status: "pending",
            registration: { applicantUserId: applicantId, submittedAt: now() },
          },
        ],
        { session },
      );
      await runInTenant(collegeId, () => models.Membership.create([{ userId: applicantId!, roles: ["CA"], status: "pending" }], { session }));
      await auditPlatform(models, { action: "college.registered", target: { kind: "college", id: String(collegeId) }, actorUserId: applicantId, collegeId, summary: { code }, requestId }, session);
      return { applicantId: applicantId! };
    });
    return { collegeId, applicantId: result.applicantId, status: "pending" as const };
  }

  async function list(status?: "pending" | "active" | "rejected" | "suspended") {
    const filter = status ? { status } : {};
    const colleges = await models.College.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const applicantIds = colleges.map((c) => c.registration?.applicantUserId).filter(Boolean) as Types.ObjectId[];
    const applicants =
      applicantIds.length > 0
        ? new Map((await models.User.find({ _id: trusted({ $in: applicantIds }) }, { name: 1, email: 1, mobile: 1 }).lean()).map((u) => [String(u._id), u]))
        : new Map();
    return colleges.map((c) => {
      const a = c.registration?.applicantUserId ? applicants.get(String(c.registration.applicantUserId)) : undefined;
      return {
        id: String(c._id),
        name: c.name.en,
        shortName: c.shortName ?? null,
        code: c.code,
        district: c.district ?? null,
        kind: c.kind ?? null,
        status: c.status,
        submittedAt: c.registration?.submittedAt ?? null,
        decidedAt: c.registration?.decidedAt ?? null,
        reason: c.registration?.reason ?? null,
        applicant: a ? { id: String(a._id), name: a.name, email: a.email ?? null, mobile: a.mobile ?? null } : null,
      };
    });
  }

  type Decision = "approve" | "reject" | "suspend" | "reactivate";
  const TRANSITIONS: Record<Decision, { from: string[]; to: string; action: string }> = {
    approve: { from: ["pending"], to: "active", action: "college.approved" },
    reject: { from: ["pending"], to: "rejected", action: "college.rejected" },
    suspend: { from: ["active"], to: "suspended", action: "college.suspended" },
    reactivate: { from: ["suspended"], to: "active", action: "college.reactivated" },
  };

  async function decide(collegeId: Types.ObjectId, decision: Decision, actorId: Types.ObjectId, reason: string | undefined, requestId?: string) {
    const t = TRANSITIONS[decision];
    const college = await models.College.findById(collegeId).lean();
    if (!college) throw notFound();
    if (!t.from.includes(college.status)) {
      throw new ApiError(409, "state_conflict", `This college is ${college.status}, so it cannot be ${decision === "reactivate" ? "reactivated" : `${decision}d`}.`);
    }
    await withTransaction(db.connection, async (session) => {
      const updated = await models.College.updateOne(
        { _id: collegeId, status: college.status },
        {
          $set: { status: t.to, ...(decision === "approve" || decision === "reject" ? { "registration.decidedAt": now(), "registration.decidedBy": actorId, "registration.reason": reason } : {}) },
          $inc: { rowVersion: 1 },
        },
        { session },
      );
      if (updated.modifiedCount !== 1) throw new ApiError(409, "state_conflict", "Someone else decided this college a moment ago. Reload and check.");
      if (decision === "approve") {
        await runInTenant(collegeId, () => models.Membership.updateMany({ status: "pending" }, { $set: { status: "active" } }, { session }));
      }
      await auditPlatform(models, { action: t.action, target: { kind: "college", id: String(collegeId) }, actorUserId: actorId, actorRoles: ["PA"], collegeId, summary: reason ? { reason } : undefined, requestId }, session);
      await runInTenant(collegeId, () =>
        auditCollege(models, { action: t.action, target: { kind: "college", id: String(collegeId) }, actorUserId: actorId, actorRoles: ["PA"], summary: reason ? { reason } : undefined, requestId }, session),
      );
    });
  }

  /** Reset link for one of the college's administrators, after an out-of-band identity check (N16). */
  async function recoveryLink(collegeId: Types.ObjectId, userId: Types.ObjectId, actorId: Types.ObjectId, note: string, requestId?: string) {
    if (!(await models.College.exists({ _id: collegeId }))) throw notFound();
    const membership = await runInTenant(collegeId, () => models.Membership.findOne({ userId, roles: "CA" }).lean());
    if (!membership) throw new ApiError(404, "not_found", "That person is not an administrator of this college.");
    const link = await auth.issueResetLink(userId, actorId, null);
    await auditPlatform(models, { action: "admin.recovery_link_issued", target: { kind: "user", id: String(userId) }, actorUserId: actorId, actorRoles: ["PA"], collegeId, summary: { note }, requestId });
    await runInTenant(collegeId, () => auditCollege(models, { action: "admin.recovery_link_issued", target: { kind: "user", id: String(userId) }, actorUserId: actorId, actorRoles: ["PA"], summary: { note }, requestId }));
    return link;
  }

  async function setUserStatus(userId: Types.ObjectId, status: "active" | "disabled", actorId: Types.ObjectId, requestId?: string) {
    if (String(userId) === String(actorId)) throw new ApiError(409, "state_conflict", "You cannot disable your own account.");
    const updated = await models.User.updateOne({ _id: userId }, { $set: { status } });
    if (updated.matchedCount !== 1) throw new ApiError(404, "not_found", "Account not found.");
    if (status === "disabled") await models.Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now(), revokeReason: "account_disabled" } });
    await auditPlatform(models, { action: status === "disabled" ? "user.disabled" : "user.enabled", target: { kind: "user", id: String(userId) }, actorUserId: actorId, actorRoles: ["PA"], requestId });
  }

  return { register, list, decide, recoveryLink, setUserStatus };
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;
