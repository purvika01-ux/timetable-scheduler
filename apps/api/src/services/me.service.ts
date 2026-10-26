import { trusted, type Types } from "mongoose";

import type { Deps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { publicUser } from "./auth.service.ts";

export function createMeService(deps: Deps) {
  const { models } = deps;

  /** The person's colleges (active and suspended memberships) and pending or decided applications. */
  async function memberships(userId: Types.ObjectId) {
    // Deliberately cross-college, filtered by the user: listing one's own colleges at sign-in.
    const list = await models.Membership.find({ userId }).setOptions({ platformScope: true }).lean();
    const collegeIds = list.map((m) => m.collegeId);
    const colleges =
      collegeIds.length > 0
        ? new Map((await models.College.find({ _id: trusted({ $in: collegeIds }) }, { name: 1, code: 1, status: 1, registration: 1 }).lean()).map((c) => [String(c._id), c]))
        : new Map();
    return list.map((m) => {
      const c = colleges.get(String(m.collegeId));
      const applicant = c?.registration?.applicantUserId && String(c.registration.applicantUserId) === String(userId);
      return {
        collegeId: String(m.collegeId),
        collegeName: c?.name.en ?? "",
        collegeCode: c?.code ?? "",
        collegeStatus: c?.status ?? "suspended",
        roles: m.roles,
        status: m.status,
        // Only the applicant sees the platform's reason for rejecting their application.
        decisionReason: applicant && c?.status === "rejected" ? (c.registration?.reason ?? null) : null,
      };
    });
  }

  async function profile(userId: Types.ObjectId) {
    const user = await models.User.findById(userId).lean();
    if (!user) throw new ApiError(401, "unauthenticated", "Please sign in again.");
    return publicUser(user);
  }

  return {
    memberships,
    profile,
    async summary(sessionId: Types.ObjectId) {
      const session = await models.Session.findById(sessionId, { userId: 1, expiresAt: 1, mfaVerified: 1 }).lean();
      if (!session) throw new ApiError(401, "unauthenticated", "Please sign in again.");
      return { user: await profile(session.userId), memberships: await memberships(session.userId), session: { expiresAt: session.expiresAt, twoStepVerified: session.mfaVerified } };
    },
    async update(userId: Types.ObjectId, input: { name?: string; locale?: "en" | "pa" }) {
      const set: Record<string, unknown> = {};
      if (input.name) set.name = input.name;
      if (input.locale) set.locale = input.locale;
      await models.User.updateOne({ _id: userId }, { $set: set });
      return profile(userId);
    },
  };
}

export type MeService = ReturnType<typeof createMeService>;
